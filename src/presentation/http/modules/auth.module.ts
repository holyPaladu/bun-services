import { Elysia } from 'elysia'
import type { DatabaseClient } from '@/infrastructure/postgres/postgres'
import type { JwtConfig } from '@/infrastructure/config/jwt.config'
import { createAccountRepository } from '@/infrastructure/postgres/repositories/account.repository'
import { createSessionRepository } from '@/infrastructure/postgres/repositories/session.repository'
import { createBunHash } from '@/infrastructure/security/bun.hash'
import { createSystemClock } from '@/infrastructure/security/system-clock'
import { createOpaqueRefreshToken } from '@/infrastructure/security/opaque-refresh-token'
import type { loadSigningKeys } from '@/infrastructure/security/jwt/keys'
import { createJoseAccessTokenSigner } from '@/infrastructure/security/jwt/jose-access-token.signer'
import { createLocalAccessTokenVerifier } from '@/infrastructure/security/jwt/jose-access-token.verifier'
import { registerAccountUseCase } from '@/application/usecases/register-account'
import { loginAccountUseCase } from '@/application/usecases/login-account'
import { refreshSessionUseCase } from '@/application/usecases/refresh-session'
import { logoutSessionUseCase } from '@/application/usecases/logout-session'
import { authModels } from '@/presentation/http/schemas/auth.schema'
import { authPlugin } from '@/presentation/http/plugins/auth.plugin'

interface AuthModuleDeps {
  client: DatabaseClient
  jwt: JwtConfig
  signingKeys: Awaited<ReturnType<typeof loadSigningKeys>>
}

export const authModule = async ({ client, jwt, signingKeys }: AuthModuleDeps) => {
  const { privateKey, keys } = signingKeys
  const clock = createSystemClock()
  const tokens = createOpaqueRefreshToken()
  const hasher = createBunHash()
  const accounts = createAccountRepository(client)
  const sessions = createSessionRepository(client)
  const signer = createJoseAccessTokenSigner({ ...jwt, privateKey, clock })
  const verifier = createLocalAccessTokenVerifier({ ...jwt, clock }, keys)
  const deps = { accounts, sessions, signer, tokens, clock, audience: jwt.audience }
  const dummyPasswordHash = await hasher.hash(tokens.generate())

  const register = registerAccountUseCase(accounts, hasher)
  const login = loginAccountUseCase({ ...deps, hasher, dummyPasswordHash, refreshTtl: jwt.refreshTtl })
  const refresh = refreshSessionUseCase(deps)
  const logout = logoutSessionUseCase(sessions, tokens, clock)

  return new Elysia({ name: 'auth-module', prefix: '/auth', tags: ['Auth'] })
    .model(authModels)
    .onRequest(({ set }) => {
      set.headers['cache-control'] = 'no-store'
      set.headers.pragma = 'no-cache'
    })
    .post('/register', async ({ body, status }) => {
      await register(body)
      return status(201, { message: 'Successfully registered' })
    }, { body: 'registerBody', response: { 201: 'registerResponse' } })
    .post('/login', ({ body }) => login(body), {
      body: 'loginBody', response: { 200: 'loginResponse' },
    })
    .post('/refresh', ({ body }) => refresh(body.refreshToken), {
      body: 'refreshBody', response: { 200: 'loginResponse' },
    })
    .post('/logout', async ({ body, status }) => {
      await logout(body.refreshToken)
      return status(204)
    }, { body: 'refreshBody' })
    .group('', app => app
      .use(authPlugin(verifier))
      .get('/me', ({ auth }) => ({ accountId: auth.accountId, sessionId: auth.sessionId }), {
        detail: {
          summary: 'Current authenticated account',
          security: [{ bearerAuth: [] }],
        },
        response: { 200: 'meResponse' },
      })
    )
}
