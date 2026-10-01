import type { RefreshTokenRepository } from '@/application/ports/refresh-token.repository'
import type { SessionRepository } from '@/application/ports/session.repository'
import type { Clock } from '@/application/ports/clock'

export function logoutSessionUseCase(sessions: SessionRepository, tokens: RefreshTokenRepository, clock: Clock) {
  return async (token: string): Promise<void> => {
    await sessions.revoke(await tokens.hash(token), clock.now())
  }
}
