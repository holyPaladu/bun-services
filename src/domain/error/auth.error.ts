import { DomainError } from './domain.error'

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_ACCESS_TOKEN'
  | 'EXPIRED_ACCESS_TOKEN'
  | 'INVALID_REFRESH_TOKEN'

export class AuthError extends DomainError {
  private constructor(code: AuthErrorCode) {
    super('Authentication failed', code, 401)
  }

  static invalidCredentials() {
    return new AuthError('INVALID_CREDENTIALS')
  }

  static invalidAccessToken() {
    return new AuthError('INVALID_ACCESS_TOKEN')
  }

  static expiredAccessToken() {
    return new AuthError('EXPIRED_ACCESS_TOKEN')
  }

  static invalidRefreshToken() {
    return new AuthError('INVALID_REFRESH_TOKEN')
  }
}
