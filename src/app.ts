import { Elysia } from 'elysia'
import type { DatabaseClient } from '@/infrastructure/postgres/postgres'
import type { JwtConfig } from '@/infrastructure/config/jwt.config'
import { loadSigningKeys } from '@/infrastructure/security/jwt/keys'
import { authModule } from '@/presentation/http/modules/auth.module'
import { errorPlugin } from '@/presentation/http/plugins/error.plugin'
import { openApiPlugin } from '@/presentation/http/plugins/openapi.plugin'
import { successEnvelope } from '@/presentation/http/plugins/response.plugin'
import { systemModule } from '@/presentation/http/modules/system.module'

export const createApp = async ({ client, jwt }: { client: DatabaseClient; jwt: JwtConfig }) => {
  const signingKeys = await loadSigningKeys(jwt)
  const authRoutes = await authModule({ client, jwt, signingKeys })

  return new Elysia({ name: 'app-module', serve: { maxRequestBodySize: 16_384 } })
    .use(errorPlugin)
    .use(openApiPlugin)
    .use(systemModule({ signingKeys }))
    .group('/api', app => app.use(successEnvelope).use(authRoutes))
}
