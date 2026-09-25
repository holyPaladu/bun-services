import {
  AccountEntity,
  AccountStatus,
} from '@/domain/entities/account.entity'

export type AccountRow = {
  id: string
  email: string
  password_hash: string
  status: AccountStatus
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export const AccountMapper = {
  toDomain(row: AccountRow) {
    return AccountEntity.restore({
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    })
  },
}