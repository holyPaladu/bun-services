import { importPKCS8, importJWK, SignJWT, jwtVerify } from 'jose'
import type { JwtConfig } from '@/infrastructure/config/jwt.config'

export const ACCESS_ALGORITHM = 'ES256'
export const ACCESS_TYPE = 'at+jwt'

export type PublicAccessJwk = {
  kid: string
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
  alg: typeof ACCESS_ALGORITHM
  use: 'sig'
  key_ops: ['verify']
}

export type PublicKeys = {
  jwks: { keys: PublicAccessJwk[] }
  keys: ReadonlyMap<string, CryptoKey>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export async function loadPublicKeys(input: unknown): Promise<PublicKeys> {
  try {
    if (!isRecord(input) || !Array.isArray(input.keys) || input.keys.length < 1 || input.keys.length > 10) throw new Error()
    const keys = new Map<string, CryptoKey>()
    const publicJwks: PublicAccessJwk[] = []
    for (const value of input.keys) {
      if (!isRecord(value) || Object.keys(value).some(key => !['kid', 'kty', 'crv', 'x', 'y', 'alg', 'use', 'key_ops'].includes(key))) throw new Error()
      if (typeof value.kid !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.kid) || keys.has(value.kid)) throw new Error()
      if (value.kty !== 'EC' || value.crv !== 'P-256' || value.alg !== ACCESS_ALGORITHM || value.use !== 'sig') throw new Error()
      if (typeof value.x !== 'string' || typeof value.y !== 'string') throw new Error()
      if (value.key_ops !== undefined && (!Array.isArray(value.key_ops) || value.key_ops.length !== 1 || value.key_ops[0] !== 'verify')) throw new Error()
      // Construct the public response from an allow-list, never by spreading an imported JWK.
      const jwk: PublicAccessJwk = { kid: value.kid, kty: 'EC', crv: 'P-256', x: value.x, y: value.y, alg: ACCESS_ALGORITHM, use: 'sig', key_ops: ['verify'] }
      const key = await importJWK(jwk, ACCESS_ALGORITHM)
      if (key instanceof Uint8Array || key.type !== 'public') throw new Error()
      keys.set(value.kid, key)
      publicJwks.push(jwk)
    }
    return { keys, jwks: { keys: publicJwks } }
  } catch {
    throw new Error('Invalid public JWT key set')
  }
}

export async function loadSigningKeys(config: JwtConfig) {
  try {
    const publicKeys = await loadPublicKeys(JSON.parse(config.publicKeys) as unknown)
    const privateKey = await importPKCS8(config.privateKey, ACCESS_ALGORITHM)
    const publicKey = publicKeys.keys.get(config.keyId)
    if (!publicKey || privateKey.type !== 'private' || (privateKey.algorithm as EcKeyAlgorithm).namedCurve !== 'P-256') throw new Error()
    // Fail at startup if the active public key does not match the private key.
    const probe = await new SignJWT({}).setProtectedHeader({ alg: ACCESS_ALGORITHM }).sign(privateKey)
    await jwtVerify(probe, publicKey, { algorithms: [ACCESS_ALGORITHM] })
    return { privateKey, ...publicKeys }
  } catch {
    throw new Error('Invalid JWT signing keys')
  }
}
