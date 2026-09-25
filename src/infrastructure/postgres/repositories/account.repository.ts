import type { DatabaseClient } from '@/infrastructure/postgres/postgres'
import type { AccountRepository } from '@/application/ports/account.repository'
import {
  AccountMapper,
  type AccountRow,
} from '@/infrastructure/postgres/mappers/account.mapper'

export const createAccountRepository = (
  sql: DatabaseClient,
): AccountRepository => {
  return {
    async findByEmail(email) {
      const [row] = await sql<AccountRow[]>`
        SELECT
          id,
          email,
          password_hash,
      status,
      created_at,
      updated_at,
      deleted_at
      FROM accounts
      WHERE email = ${email}
        LIMIT 1
      `
      return row ? AccountMapper.toDomain(row) : null
    },

    async create(data) {
      const [row] = await sql<AccountRow[]>`
        INSERT INTO accounts (email, password_hash)
        VALUES (${data.email}, ${data.passwordHash})
        RETURNING
          id,
          email,
          password_hash,
          status,
          created_at,
          updated_at,
          deleted_at
      `
      return AccountMapper.toDomain(row)
    },
  }
}
