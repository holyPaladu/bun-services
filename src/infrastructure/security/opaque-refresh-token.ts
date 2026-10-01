import type { RefreshTokenRepository } from '@/application/ports/refresh-token.repository'
import { AuthError } from '@/domain/error/auth.error'

export const createOpaqueRefreshToken = (): RefreshTokenRepository => ({
  generate: () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
  createId: () => crypto.randomUUID(),
  async hash(token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token, 'base64url').toString('base64url') !== token) {
      throw AuthError.invalidRefreshToken()
    }
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    return Buffer.from(hash).toString('hex')
  },
})
