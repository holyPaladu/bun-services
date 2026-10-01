import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import type { Clock } from '@/application/ports/clock'
import type { JwtConfig } from '@/infrastructure/config/jwt.config'

export const accountId = '11111111-1111-4111-8111-111111111111'
export const sessionId = '22222222-2222-4222-8222-222222222222'
export const tokenId = '33333333-3333-4333-8333-333333333333'
export const instant = new Date('2026-10-01T00:00:00Z')
export const clock: Clock = { now: () => new Date(instant) }
export const policy = {
  issuer: 'https://auth.internal.example', audience: 'auth-service',
  accessTtl: 600, clockTolerance: 5, clock,
}

export async function keyFixture(kid = 'test-key') {
  const pair = await generateKeyPair('ES256', { extractable: true })
  const jwk = { ...await exportJWK(pair.publicKey), kid, alg: 'ES256', use: 'sig', key_ops: ['verify'] }
  const config: JwtConfig = {
    ...policy, keyId: kid, privateKey: await exportPKCS8(pair.privateKey),
    publicKeys: JSON.stringify({ keys: [jwk] }), refreshTtl: 2592000,
  }
  return { ...pair, jwk, config }
}
