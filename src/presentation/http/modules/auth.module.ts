import { Elysia } from 'elysia'
import { DatabaseClient } from "@/infrastructure/postgres/postgres";
import { authModels } from "@/presentation/http/schemas/auth.schema";
import { createAccountRepository } from "@/infrastructure/postgres/repositories/account.repository";
import { createBunHash } from "@/infrastructure/security/bun.hash";
import { registerAccountUseCase } from "@/application/usecases/register-account";

interface AuthModuleDeps {
  client: DatabaseClient
}

export const authModule = ({ client }: AuthModuleDeps) => {
  const accountRepository = createAccountRepository(client)
  const bunHash = createBunHash()

  const register = registerAccountUseCase(accountRepository, bunHash)

  return new Elysia({ name: 'auth-module', prefix: 'auth', tags: ['Auth'] })
    .model(authModels)
    .post(
      '/register',
      async ({ body, status }) => {
        await register(body)
        return status(201, { message: 'Successfully registered' })
      },
      {
        body: 'registerBody',
        response: { 201: 'registerResponse' }
      }
    )
}