import { beforeAll, afterAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { createApp } from '@/app'
import { createSessionRepository } from '@/infrastructure/postgres/repositories/session.repository'
import { createOpaqueRefreshToken } from '@/infrastructure/security/opaque-refresh-token'
import { keyFixture } from './fixtures'

// Explicit opt-in. Every run gets a new schema; never migrate or truncate an existing application schema.
const databaseUrl = Bun.env.TEST_DATABASE_URL
const integration = databaseUrl ? describe : describe.skip

integration('PostgreSQL + HTTP authentication', () => {
  let admin: SQL
  let db: SQL
  let app: Awaited<ReturnType<typeof createApp>>
  const schema = `auth_test_${crypto.randomUUID().replaceAll('-', '')}`
  const tokens = createOpaqueRefreshToken()
  const password = 'long-test-password-123'
  let emailCounter = 0

  beforeAll(async () => {
    admin = new SQL(databaseUrl!)
    await admin.unsafe(`CREATE SCHEMA ${schema}`)
    const url = new URL(databaseUrl!)
    url.searchParams.set('options', `-c search_path=${schema}`)
    db = new SQL({ url: url.toString(), max: 5 })
    for (const name of ['000001_create_accounts', '000002_add_account_lifecycle', '000003_create_sessions']) {
      await db.unsafe(await Bun.file(`${import.meta.dir}/../migrations/${name}.up.sql`).text())
    }
    const fixture = await keyFixture()
    app = await createApp({ client: db, jwt: fixture.config })
  })

  afterAll(async () => {
    if (db) await db.close()
    if (admin) {
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.close()
    }
  })

  const request = (path: string, body?: unknown, authorization?: string) => app.handle(new Request(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(authorization ? { authorization } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }))
  async function login() {
    const email = `account-${++emailCounter}@example.com`
    const registered = await request('/api/auth/register', { email, password })
    expect(registered.status).toBe(201)
    const response = await request('/api/auth/login', { email: email.toUpperCase(), password })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const json = await response.json() as { success: boolean; data: { accessToken: string; refreshToken: string; refreshTokenExpiresAt: string } }
    expect(json.success).toBe(true)
    return { ...json.data, email }
  }

  test('register → login → authenticated context; protected route only', async () => {
    const pair = await login()
    const response = await request('/api/auth/me', undefined, `Bearer ${pair.accessToken}`)
    expect(response.status).toBe(200)
    const json = await response.json() as { data: { accountId: string; sessionId: string } }
    expect(json.data.accountId).toBeString()
    expect(json.data.sessionId).toBeString()
    expect((await request('/api/auth/me')).status).toBe(401)
    expect((await request('/api/auth/me', undefined, `Bearer ${pair.refreshToken}`)).status).toBe(401)
  })
  test('refresh rotates, preserves absolute expiry; reuse revokes replacement', async () => {
    const original = await login()
    const response = await request('/api/auth/refresh', { refreshToken: original.refreshToken })
    expect(response.status).toBe(200)
    const { data: next } = await response.json() as { data: { refreshToken: string; refreshTokenExpiresAt: string } }
    expect(next.refreshToken).not.toBe(original.refreshToken)
    expect(next.refreshTokenExpiresAt).toBe(original.refreshTokenExpiresAt)
    expect((await request('/api/auth/refresh', { refreshToken: original.refreshToken })).status).toBe(401)
    expect((await request('/api/auth/refresh', { refreshToken: next.refreshToken })).status).toBe(401)
    const [row] = await db<{ revoked_at: Date | null }[]>`SELECT revoked_at FROM auth_sessions WHERE id = (
      SELECT session_id FROM refresh_tokens WHERE token_hash = ${await tokens.hash(original.refreshToken)})`
    expect(row.revoked_at).toBeInstanceOf(Date)
  })
  test('expired refresh rejected', async () => {
    const pair = await login()
    await db`UPDATE auth_sessions SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 days', expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
      WHERE id = (SELECT session_id FROM refresh_tokens WHERE token_hash = ${await tokens.hash(pair.refreshToken)})`
    expect((await request('/api/auth/refresh', { refreshToken: pair.refreshToken })).status).toBe(401)
  })
  test('logout is idempotent and revokes refresh', async () => {
    const pair = await login()
    expect((await request('/api/auth/logout', { refreshToken: pair.refreshToken })).status).toBe(204)
    expect((await request('/api/auth/logout', { refreshToken: pair.refreshToken })).status).toBe(204)
    expect((await request('/api/auth/refresh', { refreshToken: pair.refreshToken })).status).toBe(401)
    // Stateless access remains valid until exp; logout is not an access-token blacklist.
    expect((await request('/api/auth/me', undefined, `Bearer ${pair.accessToken}`)).status).toBe(200)
  })
  test('simultaneous refresh: one winner and family revoked', async () => {
    const pair = await login()
    const responses = await Promise.all([
      request('/api/auth/refresh', { refreshToken: pair.refreshToken }),
      request('/api/auth/refresh', { refreshToken: pair.refreshToken }),
    ])
    expect(responses.map(response => response.status).sort()).toEqual([200, 401])
    const winner = responses.find(response => response.status === 200)!
    const json = await winner.json() as { data: { refreshToken: string } }
    expect((await request('/api/auth/refresh', { refreshToken: json.data.refreshToken })).status).toBe(401)
  })
  test('issuance failure rolls back rotation', async () => {
    const pair = await login()
    const repo = createSessionRepository(db)
    await expect(repo.rotate({ tokenHash: await tokens.hash(pair.refreshToken), nextTokenHash: await tokens.hash(tokens.generate()),
      now: new Date(), audience: 'auth-service' }, async () => { throw new Error('simulated signer failure') })).rejects.toThrow('simulated signer failure')
    expect((await request('/api/auth/refresh', { refreshToken: pair.refreshToken })).status).toBe(200)
  })
  test('session audience cannot be changed', async () => {
    const pair = await login()
    const repo = createSessionRepository(db)
    expect(await repo.rotate({ tokenHash: await tokens.hash(pair.refreshToken), nextTokenHash: await tokens.hash(tokens.generate()),
      now: new Date(), audience: 'admin-service' }, async () => 'not-issued')).toBeNull()
    expect((await request('/api/auth/refresh', { refreshToken: pair.refreshToken })).status).toBe(200)
  })
  test('suspended and deleted accounts cannot login or refresh', async () => {
    for (const state of ['suspended', 'deleted']) {
      const pair = await login()
      if (state === 'suspended') await db`UPDATE accounts SET status = 'suspended' WHERE email = ${pair.email}`
      else await db`UPDATE accounts SET deleted_at = CURRENT_TIMESTAMP WHERE email = ${pair.email}`
      expect((await request('/api/auth/login', { email: pair.email, password })).status).toBe(401)
      expect((await request('/api/auth/refresh', { refreshToken: pair.refreshToken })).status).toBe(401)
    }
  })
  test('invalid credentials have identical public error shape', async () => {
    const pair = await login()
    const known = await request('/api/auth/login', { email: pair.email, password: 'incorrect-password' })
    const unknown = await request('/api/auth/login', { email: 'absent@example.com', password })
    expect(known.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await known.json()).toEqual(await unknown.json())
  })
  test('public JWKS unwrapped and no private fields; no auth required', async () => {
    const response = await request('/system/security/.well-known/jwks.json')
    expect(response.status).toBe(200)
    const json = await response.json() as { keys: Record<string, unknown>[] }
    expect(json.keys).toHaveLength(1)
    expect(Object.keys(json.keys[0]).sort()).toEqual(['alg', 'crv', 'key_ops', 'kid', 'kty', 'use', 'x', 'y'])
    expect(response.headers.get('cache-control')).toContain('max-age=60')
  })
  test('credential validation and malformed bearer do not echo submitted secret', async () => {
    const secret = 'do-not-echo-this-secret'
    const bad = await request('/api/auth/refresh', { refreshToken: secret })
    expect(bad.status).toBe(422)
    expect(await bad.text()).not.toContain(secret)
    const invalid = await request('/api/auth/me', undefined, `Bearer ${secret}`)
    expect(invalid.status).toBe(401)
    expect(invalid.headers.get('www-authenticate')).toBe('Bearer')
    expect(await invalid.text()).not.toContain(secret)
  })
  test('only hashes are stored', async () => {
    const pair = await login()
    const rows = await db<{ token_hash: string }[]>`SELECT token_hash FROM refresh_tokens WHERE token_hash = ${await tokens.hash(pair.refreshToken)}`
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).not.toBe(pair.refreshToken)
    expect(rows[0].token_hash).toHaveLength(64)
  })
  test('unknown refresh token is rejected', async () => {
    expect((await request('/api/auth/refresh', { refreshToken: tokens.generate() })).status).toBe(401)
  })
  test('refresh works with a single database connection', async () => {
    const url = new URL(databaseUrl!)
    url.searchParams.set('options', `-c search_path=${schema}`)
    const single = new SQL({ url: url.toString(), max: 1 })
    try {
      const pair = await login()
      const repo = createSessionRepository(single)
      const result = await repo.rotate({ tokenHash: await tokens.hash(pair.refreshToken), nextTokenHash: await tokens.hash(tokens.generate()),
        now: new Date(), audience: 'auth-service' }, async (session, account) => {
        expect(account.id).toBe(session.accountId)
        return 'issued'
      })
      expect(result).toBe('issued')
    } finally {
      await single.close()
    }
  })
  test('session schema rollback migration' , async () => {
    // Roll back and reapply only after the other tests; validates deploy rollback SQL.
    await db.unsafe(await Bun.file(`${import.meta.dir}/../migrations/000003_create_sessions.down.sql`).text())
    await db.unsafe(await Bun.file(`${import.meta.dir}/../migrations/000003_create_sessions.up.sql`).text())
    expect((await db`SELECT count(*)::int AS count FROM auth_sessions`)[0].count).toBe(0)
  })
})
