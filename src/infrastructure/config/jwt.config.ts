import { Value } from '@sinclair/typebox/value'
import { t, type Static } from 'elysia'

const schema = t.Object({
  privateKey: t.String({ minLength: 1 }),
  publicKeys: t.String({ minLength: 1 }),
  keyId: t.String({ pattern: '^[A-Za-z0-9_-]{1,80}$' }),
  issuer: t.String({ minLength: 1, maxLength: 256 }),
  audience: t.String({ pattern: '^[A-Za-z0-9:_-]{1,100}$' }),
  accessTtl: t.Integer({ minimum: 300, maximum: 900, default: 600 }),
  clockTolerance: t.Integer({ minimum: 0, maximum: 30, default: 5 }),
  refreshTtl: t.Integer({ minimum: 3600, maximum: 2592000, default: 2592000 }),
})

export type JwtConfig = Static<typeof schema>

export const loadJwtConfig = (source: Readonly<Record<string, string | undefined>>): JwtConfig => {
  try {
    const config = Value.Parse(schema, {
      privateKey: source.JWT_PRIVATE_KEY?.replaceAll('\\n', '\n').trim(),
      publicKeys: source.JWT_PUBLIC_JWKS,
      keyId: source.JWT_KEY_ID,
      issuer: source.JWT_ISSUER,
      audience: source.JWT_AUDIENCE,
      accessTtl: source.JWT_ACCESS_TTL,
      clockTolerance: source.JWT_CLOCK_TOLERANCE,
      refreshTtl: source.REFRESH_TOKEN_TTL,
    })
    const issuer = new URL(config.issuer)
    if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) throw new Error()
    return config
  } catch {
    // TypeBox errors may contain input values, including the private key.
    throw new Error('Invalid JWT configuration')
  }
}
