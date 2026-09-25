import { t, type Static } from 'elysia'
import { Value } from '@sinclair/typebox/value'

const envSchema = t.Object({
  port: t.Number({
    default: 3000,
    minimum: 1,
    maximum: 65_535,
    multipleOf: 1
  }),
  database: t.Object({
    url: t.String({
      minLength: 1,
      format: 'uri',
      pattern: '^postgres(?:ql)?://'
    }),
    max: t.Number({
      default: 10,
      minimum: 1,
      multipleOf: 1
    }),
    idleTimeout: t.Number({
      default: 30,
      minimum: 0,
      multipleOf: 1
    }),
    connectionTimeout: t.Number({
      default: 10,
      minimum: 0,
      multipleOf: 1
    }),
    maxLifetime: t.Number({
      default: 3600,
      minimum: 0,
      multipleOf: 1
    }),
    prepare: t.Boolean({
      default: true
    })
  })
})

type EnvSource = Readonly<Record<string, string | undefined>>
export type Env = Static<typeof envSchema>

const optionalEnv = (
  value: string | undefined
): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ?? undefined
}

export const loadEnv = (source: EnvSource = Bun.env): Env =>
  Value.Parse(envSchema, {
    port: optionalEnv(source.PORT),
    database: {
      url: optionalEnv(source.DATABASE_URL),
      max: optionalEnv(source.DATABASE_MAX),
      idleTimeout: optionalEnv(
        source.DATABASE_IDLE_TIMEOUT
      ),
      connectionTimeout: optionalEnv(
        source.DATABASE_CONNECT_TIMEOUT
      ),
      maxLifetime: optionalEnv(
        source.DATABASE_MAX_LIFETIME
      ),
      prepare: optionalEnv(
        source.DATABASE_PREPARE
      )
    }
  })
