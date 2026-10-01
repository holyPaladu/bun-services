import { SignJWT } from 'jose'
import type { AccessTokenSigner } from '@/application/ports/access-token.signer'
import type { Clock } from '@/application/ports/clock'
import { ACCESS_ALGORITHM, ACCESS_TYPE } from './keys'

export function createJoseAccessTokenSigner(config: {
  privateKey: CryptoKey
  keyId: string
  issuer: string
  audience: string
  accessTtl: number
  clock: Clock
}): AccessTokenSigner {
  return {
    async sign(identity) {
      const issuedAt = Math.floor(config.clock.now().getTime() / 1000)
      const token = await new SignJWT({ sid: identity.sessionId })
        .setProtectedHeader({ alg: ACCESS_ALGORITHM, typ: ACCESS_TYPE, kid: config.keyId })
        .setSubject(identity.accountId).setIssuer(config.issuer).setAudience(config.audience)
        .setIssuedAt(issuedAt).setExpirationTime(issuedAt + config.accessTtl)
        .setJti(crypto.randomUUID()).sign(config.privateKey)
      return { token, expiresIn: config.accessTtl }
    },
  }
}
