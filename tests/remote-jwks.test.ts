import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { createRemoteAccessTokenVerifier } from '@/infrastructure/security/jwt/jose-access-token.verifier'
import { createJoseAccessTokenSigner } from '@/infrastructure/security/jwt/jose-access-token.signer'
import { AuthError } from '@/domain/error/auth.error'
import { keyFixture, policy, clock, accountId, sessionId } from './fixtures'

const key = await keyFixture('remote-key')
const nextKey = await keyFixture('next-key')
const token = (await createJoseAccessTokenSigner({ ...key.config, privateKey: key.privateKey, clock }).sign({ accountId, sessionId })).token
const nextToken = (await createJoseAccessTokenSigner({ ...nextKey.config, privateKey: nextKey.privateKey, clock }).sign({ accountId, sessionId })).token
const url = 'https://trusted.example/.well-known/jwks.json'
const fetchTarget: { fetch: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> } = globalThis
let fetchSpy: ReturnType<typeof spyOn<typeof fetchTarget, 'fetch'>> | undefined
let dateSpy: ReturnType<typeof spyOn<typeof Date, 'now'>> | undefined

afterEach(() => {
  fetchSpy?.mockRestore()
  dateSpy?.mockRestore()
})

describe('remote JWKS', () => {
  test('uses pinned URL, caches keys and fails closed once stale during outage', async () => {
    let now = Date.now()
    dateSpy = spyOn(Date, 'now').mockImplementation(() => now)
    fetchSpy = spyOn(fetchTarget, 'fetch').mockImplementation(async (resource, options) => {
      expect(resource.toString()).toBe(url)
      expect(options?.redirect).toBe('error')
      expect(options?.signal).toBeInstanceOf(AbortSignal)
      return Response.json({ keys: [key.jwk] })
    })
    const verifier = createRemoteAccessTokenVerifier(policy, url)
    await verifier.verify(token)
    fetchSpy.mockImplementation(async () => { throw new Error('upstream unavailable') })
    await verifier.verify(token)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    now += 300_001
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(AuthError)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
  test('unknown kid respects cooldown and then discovers rotation', async () => {
    let now = Date.now()
    dateSpy = spyOn(Date, 'now').mockImplementation(() => now)
    fetchSpy = spyOn(fetchTarget, 'fetch').mockImplementation(async () => Response.json({ keys: [key.jwk] }))
    const verifier = createRemoteAccessTokenVerifier(policy, url)
    await verifier.verify(token)
    fetchSpy.mockImplementation(async () => Response.json({ keys: [key.jwk, nextKey.jwk] }))
    await expect(verifier.verify(nextToken)).rejects.toBeInstanceOf(AuthError)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    now += 30_001
    await verifier.verify(nextToken)
    await verifier.verify(token)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
  test('private JWK parameters and oversized responses fail closed', async () => {
    fetchSpy = spyOn(fetchTarget, 'fetch').mockImplementation(async () => Response.json({ keys: [{ ...key.jwk, d: 'private' }] }))
    await expect(createRemoteAccessTokenVerifier(policy, url).verify(token)).rejects.toBeInstanceOf(AuthError)
    fetchSpy.mockImplementation(async () => new Response('x'.repeat(65_537)))
    await expect(createRemoteAccessTokenVerifier(policy, url).verify(token)).rejects.toBeInstanceOf(AuthError)
  })
  test('redirect and non-200 response fail closed', async () => {
    fetchSpy = spyOn(fetchTarget, 'fetch').mockImplementation(async () => new Response(null, { status: 302, headers: { location: 'http://attacker.example' } }))
    await expect(createRemoteAccessTokenVerifier(policy, url).verify(token)).rejects.toBeInstanceOf(AuthError)
  })
  test('timeout aborts remote request', async () => {
    fetchSpy = spyOn(fetchTarget, 'fetch').mockImplementation((_resource, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    }))
    await expect(createRemoteAccessTokenVerifier(policy, url).verify(token)).rejects.toBeInstanceOf(AuthError)
  })
})
