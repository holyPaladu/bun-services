import { AccountEntity } from "@/domain/entities/account.entity";

interface CreateAccountData {
  email: string;
  passwordHash: string;
}

export interface AccountRepository {
  findById(id: string): Promise<AccountEntity | null>
  findByEmail(email: string): Promise<AccountEntity | null>
  create(data: CreateAccountData): Promise<AccountEntity>
}