import { createApp } from '@/app'
import { loadEnv, type Env } from '@/infrastructure/config/env'
import { createDatabase } from '@/infrastructure/postgres/postgres'
import { registerGracefulShutdown } from '@/shared/lifecycle/graceful-shutdown'

const env: Env = loadEnv()
const database = await createDatabase({ ...env.database })
const app = createApp({ client: database })

app.listen(env.port, ({ hostname, port }): void => {
  console.log(`Listening on ${hostname}:${port}`)
})

registerGracefulShutdown({
  onShutdown: async (): Promise<void> => {
    await app.stop()
    await database.close()
  }
})
