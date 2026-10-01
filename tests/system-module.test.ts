import { expect, test } from 'bun:test'
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose'
import { systemModule } from '@/presentation/http/modules/system.module'
import { loadSigningKeys } from '@/infrastructure/security/jwt/keys'
import { createJoseAccessTokenSigner } from '@/infrastructure/security/jwt/jose-access-token.signer'
import { keyFixture, clock, policy, accountId, sessionId } from './fixtures'

const fixture = await keyFixture()
const signingKeys = await loadSigningKeys(fixture.config)
const app = systemModule({ signingKeys })

test('system health returns ok', async () => {
  const response = await app.handle(new Request('http://localhost/system/health'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})

test('system JWKS schema serves usable ES256 public keys', async () => {
  const response = await app.handle(new Request('http://localhost/system/security/.well-known/jwks.json'))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate')
  const jwks = await response.json() as JSONWebKeySet
  expect(jwks).toEqual(signingKeys.jwks)
  expect(Object.keys(jwks.keys[0]).sort()).toEqual(['alg', 'crv', 'key_ops', 'kid', 'kty', 'use', 'x', 'y'])
  const signer = createJoseAccessTokenSigner({ ...fixture.config, privateKey: signingKeys.privateKey, clock })
  const { token } = await signer.sign({ accountId, sessionId })
  const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
    algorithms: ['ES256'], issuer: policy.issuer, audience: policy.audience,
    typ: 'at+jwt', currentDate: clock.now(),
  })
  expect(payload.sub).toBe(accountId)
})
