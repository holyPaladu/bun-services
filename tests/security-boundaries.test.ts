import { expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { errorPlugin } from '@/presentation/http/plugins/error.plugin'
import { loadEnv } from '@/infrastructure/config/env'
import { createOpaqueRefreshToken } from '@/infrastructure/security/opaque-refresh-token'
import { AuthError } from '@/domain/error/auth.error'

test('configuration errors do not expose input values', () => {
  expect(() => loadEnv({ DATABASE_URL: 'secret-database-value', JWT_PRIVATE_KEY: 'secret-key-value' }))
    .toThrow('Invalid application configuration')
})

test('unexpected HTTP errors never expose internals', async () => {
  const app = new Elysia().use(errorPlugin).get('/failure', () => { throw new Error('private-sensitive-detail') })
  const response = await app.handle(new Request('http://localhost/failure'))
  expect(response.status).toBe(500)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ type: 'internal', message: 'Internal server error' })
})

test('opaque refresh tokens are canonical 32-byte values, hashes stable and input bounded', async () => {
  const tokens = createOpaqueRefreshToken()
  const token = tokens.generate()
  expect(Buffer.from(token, 'base64url')).toHaveLength(32)
  expect(await tokens.hash(token)).toBe(await tokens.hash(token))
  for (const invalid of ['', 'x'.repeat(44), 'A'.repeat(42) + 'B', ' '.repeat(43)]) {
    await expect(tokens.hash(invalid)).rejects.toBeInstanceOf(AuthError)
  }
})
