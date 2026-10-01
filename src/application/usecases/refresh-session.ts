import type { AccessTokenSigner } from '@/application/ports/access-token.signer'
import type { RefreshTokenRepository } from '@/application/ports/refresh-token.repository'
import type { SessionRepository } from '@/application/ports/session.repository'
import type { Clock } from '@/application/ports/clock'
import type { TokenPair } from './login-account'
import { AuthError } from '@/domain/error/auth.error'

export function refreshSessionUseCase(deps: {
  signer: AccessTokenSigner
  tokens: RefreshTokenRepository
  sessions: SessionRepository
  clock: Clock
  audience: string
}) {
  return async (token: string): Promise<TokenPair> => {
    const next = deps.tokens.generate()
    const result = await deps.sessions.rotate(
      {
        tokenHash: await deps.tokens.hash(token), 
        nextTokenHash: await deps.tokens.hash(next),
        audience: deps.audience, 
        now: deps.clock.now(),
      }, 
      async (session, account) => {
        if (!account || !account.isActive || account.deletedAt) throw AuthError.invalidRefreshToken()
        const access = await deps.signer.sign({ accountId: session.accountId, sessionId: session.id })
        return {
          accessToken: access.token, 
          accessTokenExpiresIn: access.expiresIn,
          refreshToken: next, 
          refreshTokenExpiresAt: session.expiresAt.toISOString(), 
          tokenType: 'Bearer' as const,
        }
      }
    )
    if (!result) throw AuthError.invalidRefreshToken()
    return result
  }
}
