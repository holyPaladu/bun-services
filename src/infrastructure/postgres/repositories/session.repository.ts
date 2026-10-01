import { AccountMapper, type AccountRow } from '@/infrastructure/postgres/mappers/account.mapper'
import type { DatabaseClient } from '@/infrastructure/postgres/postgres'
import type { Session, SessionRepository } from '@/application/ports/session.repository'

type SessionRow = {
  id: string
  account_id: string
  audience: string
  created_at: Date
  expires_at: Date
  revoked_at: Date | null
}

const toSession = (row: SessionRow): Session => ({
  id: row.id, 
  accountId: row.account_id, 
  audience: row.audience,
  createdAt: row.created_at, 
  expiresAt: row.expires_at,
})

export const createSessionRepository = (sql: DatabaseClient): SessionRepository => ({
  async create(session, tokenHash) {
    await sql.begin(async tx => {
      await tx`INSERT INTO auth_sessions (id, account_id, audience, created_at, expires_at)
        VALUES (${session.id}, ${session.accountId}, ${session.audience}, ${session.createdAt}, ${session.expiresAt})`
      await tx`INSERT INTO refresh_tokens (token_hash, session_id, created_at)
        VALUES (${tokenHash}, ${session.id}, ${session.createdAt})`
    })
  },

  async rotate(input, issue) {
    return sql.begin(async tx => {
      // Every writer locks the session first. Read token state AFTER acquiring this lock:
      // under READ COMMITTED, a waiter sees the previous rotation's committed consumed_at.
      const [session] = await tx<SessionRow[]>`
        SELECT s.* FROM auth_sessions s
        WHERE s.id = (SELECT session_id FROM refresh_tokens WHERE token_hash = ${input.tokenHash})
        FOR UPDATE OF s`
      if (!session || session.revoked_at || session.expires_at <= input.now || session.audience !== input.audience) return null
      const [token] = await tx<{ consumed_at: Date | null }[]>`
        SELECT consumed_at FROM refresh_tokens WHERE token_hash = ${input.tokenHash}`
      if (!token) return null
      if (token.consumed_at) {
        await tx`UPDATE auth_sessions SET revoked_at = ${input.now} WHERE id = ${session.id}`
        // Return normally to COMMIT revocation; throwing here would roll it back.
        return null
      }
      const [account] = await tx<AccountRow[]>`SELECT * FROM accounts WHERE id = ${session.account_id} FOR SHARE`
      if (!account) return null
      const result = await issue(toSession(session), AccountMapper.toDomain(account))
      await tx`UPDATE refresh_tokens SET consumed_at = ${input.now} WHERE token_hash = ${input.tokenHash}`
      await tx`INSERT INTO refresh_tokens (token_hash, session_id, created_at, rotated_from)
        VALUES (${input.nextTokenHash}, ${session.id}, ${input.now}, ${input.tokenHash})`
      return result
    })
  },

  async revoke(tokenHash, now) {
    await sql`UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ${now})
      WHERE id = (SELECT session_id FROM refresh_tokens WHERE token_hash = ${tokenHash})`
  },
})
