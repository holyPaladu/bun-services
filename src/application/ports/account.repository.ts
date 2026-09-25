import { AccountEntity } from "@/domain/entities/account.entity";

interface CreateAccountData {
  email: string;
  passwordHash: string;
}

export interface AccountRepository {
  findByEmail(email: string): Promise<AccountEntity | null>
  create(data: CreateAccountData): Promise<AccountEntity>
}