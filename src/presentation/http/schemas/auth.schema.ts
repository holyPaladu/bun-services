import { t } from 'elysia'

const credentials = t.Object({
  email: t.String({ format: 'email', minLength: 4, maxLength: 256 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
}, { additionalProperties: false })

export const authModels = {
  registerBody: credentials,
  registerResponse: t.Object({ message: t.String() }),
  loginBody: credentials,
  loginResponse: t.Object({
    accessToken: t.String(),
    accessTokenExpiresIn: t.Integer(),
    refreshToken: t.String(),
    refreshTokenExpiresAt: t.String(),
    tokenType: t.Literal('Bearer'),
  }),
  refreshBody: t.Object({
    refreshToken: t.String({ minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' }),
  }, { additionalProperties: false }),
  meResponse: t.Object({
    accountId: t.String({ format: 'uuid' }),
    sessionId: t.String({ format: 'uuid' }),
  }),
}
