import { describe, test, expect } from 'bun:test'
import { SignJWT, generateKeyPair } from 'jose'
import { AuthError } from '@/domain/error/auth.error'
import { loadPublicKeys, loadSigningKeys } from '@/infrastructure/security/jwt/keys'
import { loadJwtConfig } from '@/infrastructure/config/jwt.config'
import { createJoseAccessTokenSigner } from '@/infrastructure/security/jwt/jose-access-token.signer'
import { createLocalAccessTokenVerifier, createRemoteAccessTokenVerifier } from '@/infrastructure/security/jwt/jose-access-token.verifier'
import { keyFixture, policy, clock, instant, accountId, sessionId, tokenId } from './fixtures'

const first = await keyFixture('old-key')
const second = await keyFixture('new-key')
const keys = await loadSigningKeys(first.config)
const verifier = createLocalAccessTokenVerifier(policy, keys.keys)
const epoch = instant.getTime() / 1000
const baseClaims = { sub: accountId, sid: sessionId, jti: tokenId, iss: policy.issuer, aud: policy.audience, iat: epoch, exp: epoch + 600 }
const baseHeader = { alg: 'ES256', kid: 'old-key', typ: 'at+jwt' }
const sign = (claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}, key = first.privateKey) =>
  new SignJWT({ ...baseClaims, ...claims }).setProtectedHeader({ ...baseHeader, ...header }).sign(key)

async function rejected(token: string) {
  await expect(verifier.verify(token)).rejects.toBeInstanceOf(AuthError)
}

describe('access JWT', () => {
  test('valid token maps only to application context', async () => {
    const signer = createJoseAccessTokenSigner({ ...first.config, privateKey: first.privateKey, clock })
    const result = await signer.sign({ accountId, sessionId })
    expect(result.expiresIn).toBe(600)
    expect(await verifier.verify(result.token)).toEqual({ accountId, sessionId, tokenId: expect.any(String) })
  })
  test('expired token', async () => {
    await expect(verifier.verify(await sign({ iat: epoch - 700, exp: epoch - 100 }))).rejects.toMatchObject({ code: 'EXPIRED_ACCESS_TOKEN' })
  })
  test('incorrect signature', async () => {
    const parts = (await sign()).split('.')
    const signature = Buffer.from(parts[2], 'base64url')
    signature[0] ^= 1
    parts[2] = signature.toString('base64url')
    await rejected(parts.join('.'))
  })
  for (const [name, claims] of Object.entries({
    issuer: { iss: 'https://attacker.example' }, audience: { aud: 'orders-service' },
    'other service': { aud: 'admin-service' }, 'multiple audiences': { aud: ['auth-service', 'admin-service'] },
    'future nbf': { nbf: epoch + 60 }, 'future iat': { iat: epoch + 60, exp: epoch + 600 },
    'too long lifetime': { exp: epoch + 601 }, 'invalid subject': { sub: 'service-orders' },
    'invalid sid': { sid: 123 }, 'invalid jti': { jti: '' }, 'reversed time': { exp: epoch - 1 },
    'fractional iat': { iat: epoch + 0.1 },
  })) test(`rejects ${name}`, async () => rejected(await sign(claims)))
  for (const typ of ['service+jwt', 'refresh+jwt', 'email+jwt', 'reset+jwt', 'JWT', 'application/at+jwt']) {
    test(`rejects token type ${typ}`, async () => rejected(await sign({}, { typ })))
  }
  test('unsupported alg HS256', async () => rejected(await new SignJWT(baseClaims)
    .setProtectedHeader({ ...baseHeader, alg: 'HS256' }).sign(crypto.getRandomValues(new Uint8Array(32)))))
  test('none algorithm', async () => rejected(`${Buffer.from(JSON.stringify({ ...baseHeader, alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify(baseClaims)).toString('base64url')}.`))
  test('unknown kid', async () => rejected(await sign({}, { kid: 'unknown' })))
  test('token signed by another private key', async () => rejected(await sign({}, {}, second.privateKey)))
  for (const value of ['', 'broken', 'a.b.c', 'x'.repeat(5000)]) test(`malformed JWT length ${value.length}`, async () => rejected(value))
  test('untrusted key URLs forbidden', async () => rejected(await sign({}, { jku: 'https://attacker.example/keys' })))
  for (const claim of Object.keys(baseClaims)) test(`required ${claim}`, async () => {
    const claims: Record<string, unknown> = { ...baseClaims }
    delete claims[claim]
    await rejected(await new SignJWT(claims).setProtectedHeader(baseHeader).sign(first.privateKey))
  })
  test('missing kid', async () => rejected(await new SignJWT(baseClaims).setProtectedHeader({ alg: 'ES256', typ: 'at+jwt' }).sign(first.privateKey)))
  test('rotation accepts old and new keys, then retires old', async () => {
    const rotation = await loadPublicKeys({ keys: [first.jwk, second.jwk] })
    const rotatedVerifier = createLocalAccessTokenVerifier(policy, rotation.keys)
    const old = await sign()
    const fresh = await sign({}, { kid: 'new-key' }, second.privateKey)
    expect((await rotatedVerifier.verify(old)).accountId).toBe(accountId)
    expect((await rotatedVerifier.verify(fresh)).accountId).toBe(accountId)
    const retired = createLocalAccessTokenVerifier(policy, (await loadPublicKeys({ keys: [second.jwk] })).keys)
    await expect(retired.verify(old)).rejects.toBeInstanceOf(AuthError)
    expect((await retired.verify(fresh)).accountId).toBe(accountId)
  })
  test('public-key-only verifier cannot sign', () => {
    expect(keys.keys.get('old-key')?.type).toBe('public')
    expect(keys.keys.get('old-key')?.usages).toEqual(['verify'])
    expect('sign' in verifier).toBe(false)
  })
})

describe('startup configuration', () => {
  test('rejects mismatched keys', async () => {
    await expect(loadSigningKeys({ ...first.config, privateKey: second.config.privateKey })).rejects.toThrow('Invalid JWT signing keys')
  })
  test('rejects malformed PEM without echo', async () => {
    await expect(loadSigningKeys({ ...first.config, privateKey: 'secret-invalid-material' })).rejects.toThrow('Invalid JWT signing keys')
  })
  test('rejects duplicate kid', async () => {
    await expect(loadPublicKeys({ keys: [first.jwk, first.jwk] })).rejects.toThrow()
  })
  test('rejects private parameters', async () => {
    await expect(loadPublicKeys({ keys: [{ ...first.jwk, d: 'secret' }] })).rejects.toThrow()
  })
  test('rejects wrong curve', async () => {
    await expect(loadPublicKeys({ keys: [{ ...first.jwk, crv: 'P-384' }] })).rejects.toThrow()
  })
  test('normalizes escaped PEM and validates config at startup', async () => {
    const source = { JWT_PRIVATE_KEY: first.config.privateKey.replaceAll('\n', '\\n'), JWT_PUBLIC_JWKS: first.config.publicKeys,
      JWT_KEY_ID: first.config.keyId, JWT_ISSUER: policy.issuer, JWT_AUDIENCE: policy.audience }
    const config = loadJwtConfig(source)
    expect(config.privateKey).toBe(first.config.privateKey.trim())
    await loadSigningKeys(config)
    expect(() => loadJwtConfig({ ...source, JWT_ACCESS_TTL: '0' })).toThrow('Invalid JWT configuration')
    expect(() => loadJwtConfig({ ...source, JWT_ISSUER: 'http://unsafe' })).toThrow()
  })
  test('rejects unsafe remote URL', () => {
    for (const url of ['http://example.com/jwks', 'https://user:pass@example.com/jwks', 'file:///keys', 'https://example.com/keys?url=evil']) {
      expect(() => createRemoteAccessTokenVerifier(policy, url)).toThrow()
    }
  })
  test('actual Bun/jose algorithm compatibility', async () => {
    for (const alg of ['EdDSA', 'ES256', 'RS256']) {
      const pair = await generateKeyPair(alg)
      const token = await new SignJWT({}).setProtectedHeader({ alg }).sign(pair.privateKey)
      const { jwtVerify } = await import('jose')
      await jwtVerify(token, pair.publicKey, { algorithms: [alg] })
    }
  })
})
