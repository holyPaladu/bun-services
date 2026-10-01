import type { AccountEntity } from '@/domain/entities/account.entity'

export type Session = Readonly<{
  id: string
  accountId: string
  audience: string
  createdAt: Date
  expiresAt: Date
}>

export interface SessionRepository {
  create(session: Session, tokenHash: string): Promise<void>
  // Serialize rotation by session. Reuse MUST commit family revocation before returning null.
  // issue runs in the transaction: a failed issuance must not consume the credential.
  rotate<T>(
    input: {
      tokenHash: string
      nextTokenHash: string
      audience: string
      now: Date
    }, 
    issue: (session: Session, account: AccountEntity) => Promise<T>
  ): Promise<T | null>
  
  revoke(tokenHash: string, now: Date): Promise<void>
}
