import { AccountRepository } from '@/application/ports/account.repository'
import { HashRepository } from "@/application/ports/hash.repository";
import { AccountEntity } from "@/domain/entities/account.entity";
import { AccountError } from '@/domain/error/account.error'

interface RegisterInput {
  email: string
  password: string
}

export function registerAccountUseCase(
  accounts: AccountRepository,
  hasher: HashRepository
) {
  return async function execute(input: RegisterInput): Promise<AccountEntity> {
    const existingAccount = await accounts.findByEmail(input.email)
    if (existingAccount) throw AccountError.alreadyExists()

    return accounts.create({
      email: input.email,
      passwordHash: await hasher.hash(input.password)
    })
  }
}
