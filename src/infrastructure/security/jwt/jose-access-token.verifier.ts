import { jwtVerify, createRemoteJWKSet, customFetch, errors, type JWTVerifyGetKey } from 'jose'
import type { AccessTokenVerifier } from '@/application/ports/access-token.verifier'
import type { Clock } from '@/application/ports/clock'
import { AuthError } from '@/domain/error/auth.error'
import { ACCESS_ALGORITHM, ACCESS_TYPE, loadPublicKeys } from './keys'

export type VerificationPolicy = {
  issuer: string
  audience: string
  accessTtl: number
  clockTolerance: number
  clock: Clock
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function createVerifier(policy: VerificationPolicy, resolve: JWTVerifyGetKey): AccessTokenVerifier {
  return {
    async verify(token) {
      try {
        if (token.length > 4096 || token.split('.').length !== 3) throw new Error()
        const now = policy.clock.now()
        const { payload } = await jwtVerify(token, async (header, jwt) => {
          if (header.alg !== ACCESS_ALGORITHM || header.typ !== ACCESS_TYPE ||
              typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(header.kid) ||
              Object.keys(header).some(key => !['alg', 'typ', 'kid'].includes(key))) throw new Error()
          return resolve(header, jwt)
        }, {
          algorithms: [ACCESS_ALGORITHM], typ: ACCESS_TYPE,
          issuer: policy.issuer, audience: policy.audience,
          requiredClaims: ['sub', 'iss', 'aud', 'iat', 'exp', 'jti', 'sid'],
          maxTokenAge: policy.accessTtl, clockTolerance: policy.clockTolerance, currentDate: now,
        })
        if (payload.aud !== policy.audience || typeof payload.sub !== 'string' || !uuid.test(payload.sub) ||
            typeof payload.sid !== 'string' || !uuid.test(payload.sid) || typeof payload.jti !== 'string' || !uuid.test(payload.jti) ||
            typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) ||
            typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) ||
            payload.exp <= payload.iat || payload.exp - payload.iat > policy.accessTtl ||
            payload.iat > Math.floor(now.getTime() / 1000) + policy.clockTolerance ||
            (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf >= payload.exp))) throw new Error()
        return { accountId: payload.sub, sessionId: payload.sid, tokenId: payload.jti }
      } catch (error: unknown) {
        throw error instanceof errors.JWTExpired ? AuthError.expiredAccessToken() : AuthError.invalidAccessToken()
      }
    },
  }
}

export function createLocalAccessTokenVerifier(policy: VerificationPolicy, keys: ReadonlyMap<string, CryptoKey>): AccessTokenVerifier {
  return createVerifier(policy, async header => {
    const key = keys.get(header.kid ?? '')
    if (!key || key.type !== 'public') throw new Error()
    return key
  })
}

// Consumer services import only this verifier and provide trusted configuration, never token URLs.
export function createRemoteAccessTokenVerifier(policy: VerificationPolicy, trustedUrl: string): AccessTokenVerifier {
  const url = new URL(trustedUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid trusted JWKS URL')
  const remote = createRemoteJWKSet(url, {
    timeoutDuration: 2000, cooldownDuration: 30_000, cacheMaxAge: 300_000,
    [customFetch]: async (resource, options) => {
      const response = await fetch(resource, { ...options, redirect: 'error' })
      if (response.status !== 200) throw new Error('JWKS unavailable')
      // Bound the trusted server response too; a broken upstream must not exhaust memory.
      const reader = response.body?.getReader()
      if (!reader) throw new Error('JWKS unavailable')
      const chunks: Uint8Array[] = []
      let length = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          length += value.length
          if (length > 65_536) throw new Error('JWKS too large')
          chunks.push(value)
        }
      } finally {
        await reader.cancel()
      }
      const body = Buffer.concat(chunks).toString('utf8')
      const { jwks } = await loadPublicKeys(JSON.parse(body) as unknown)
      return Response.json(jwks)
    },
  })
  return createVerifier(policy, remote)
}
