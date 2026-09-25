import { Elysia } from "elysia"
import { DatabaseClient } from "@/infrastructure/postgres/postgres";
// import { Env } from "@/infrastructure/config/env";
import { authModule } from "@/presentation/http/modules/auth.module";
import { errorPlugin } from "@/presentation/http/plugins/error.plugin";
import { openApiPlugin } from '@/presentation/http/plugins/openapi.plugin'
import { successEnvelope } from "@/presentation/http/plugins/response.plugin";

interface AppModuleDeps {
  client: DatabaseClient
  // env: Env
}

export const createApp =  ({ client }: AppModuleDeps) => {
  const authRoutes = authModule({ client })

  return new Elysia({ name: 'app-module' })
    .use(errorPlugin)
    .use(openApiPlugin)
    .group('/api', app => app
      .use(successEnvelope)
      .use(authRoutes)
    )
}