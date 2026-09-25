import { DomainError } from './domain.error'

export type AccountErrorCode =
  | 'ACCOUNT_ALREADY_EXISTS'
  | 'ACCOUNT_NOT_FOUND'

export class AccountError extends DomainError {
  private constructor(
    message: string,
    code: AccountErrorCode,
    statusCode: number,
  ) {
    super(message, code, statusCode)
  }

  static alreadyExists() {
    return new AccountError(
      'Account already exists',
      'ACCOUNT_ALREADY_EXISTS',
      409,
    )
  }

  static notFound() {
    return new AccountError(
      'Account not found',
      'ACCOUNT_NOT_FOUND',
      404
    )
  }
}
