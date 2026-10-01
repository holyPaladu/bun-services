import type { AccountRepository } from '@/application/ports/account.repository'
import type { HashRepository } from '@/application/ports/hash.repository'
import type { AccessTokenSigner } from '@/application/ports/access-token.signer'
import type { RefreshTokenRepository } from '@/application/ports/refresh-token.repository'
import type { SessionRepository } from '@/application/ports/session.repository'
import type { Clock } from '@/application/ports/clock'
import { AuthError } from '@/domain/error/auth.error'

export type TokenPair = {
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken: string
  refreshTokenExpiresAt: string
  tokenType: 'Bearer'
}

export function loginAccountUseCase(deps: {
  accounts: AccountRepository
  hasher: HashRepository
  signer: AccessTokenSigner
  tokens: RefreshTokenRepository
  sessions: SessionRepository
  clock: Clock
  audience: string
  refreshTtl: number
  dummyPasswordHash: string
}) {
  return async (input: { email: string; password: string }): Promise<TokenPair> => {
    const account = await deps.accounts.findByEmail(input.email)
    // Always perform password verification, including for unknown accounts.
    const matches = await deps.hasher.verify(input.password, account?.passwordHash ?? deps.dummyPasswordHash)
    if (!account || !matches || !account.isActive || account.deletedAt) {
      throw AuthError.invalidCredentials()
    }
    const now = deps.clock.now()
    const session = {
      id: deps.tokens.createId(), 
      accountId: account.id, 
      audience: deps.audience,
      createdAt: now, 
      expiresAt: new Date(now.getTime() + deps.refreshTtl * 1000),
    }
    const refreshToken = deps.tokens.generate()
    const access = await deps.signer.sign({ accountId: account.id, sessionId: session.id })
    await deps.sessions.create(session, await deps.tokens.hash(refreshToken))
    return {
      accessToken: access.token, 
      accessTokenExpiresIn: access.expiresIn,
      refreshToken, 
      refreshTokenExpiresAt: session.expiresAt.toISOString(), 
      tokenType: 'Bearer',
    }
  }
}
