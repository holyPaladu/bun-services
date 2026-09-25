import { SQL } from "bun"

export type DatabaseClient = SQL
export type DatabaseConfig = {
  url: string
  max: number
  idleTimeout: number
  connectionTimeout: number
  maxLifetime: number
  prepare: boolean
}

export const createDatabase = async (config: DatabaseConfig): Promise<DatabaseClient> => {
  return new SQL({
    url: config.url,

    // pool
    max: config.max,
    idleTimeout: config.idleTimeout,
    connectionTimeout: config.connectionTimeout,
    maxLifetime: config.maxLifetime,

    // prepared statements
    prepare: config.prepare,
  })
}