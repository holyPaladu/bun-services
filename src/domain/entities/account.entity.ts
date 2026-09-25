export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

type AccountProps = {
  id: string
  email: string
  passwordHash: string
  status: AccountStatus
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export class AccountEntity {
  private constructor(
    private readonly props: AccountProps,
  ) {}

  static restore(props: AccountProps) {
    return new AccountEntity(props)
  }

  get id() {
    return this.props.id
  }

  get email() {
    return this.props.email
  }

  get passwordHash() {
    return this.props.passwordHash
  }

  get status() {
    return this.props.status
  }

  get createdAt() {
    return this.props.createdAt
  }

  get updatedAt() {
    return this.props.updatedAt
  }

  get deletedAt() {
    return this.props.deletedAt
  }

  get isActive() {
    return this.props.status === AccountStatus.ACTIVE
  }

  suspend() {
    if (this.props.status === AccountStatus.SUSPENDED) {
      return
    }

    this.props.status = AccountStatus.SUSPENDED
  }

  activate() {
    this.props.status = AccountStatus.ACTIVE
  }
}