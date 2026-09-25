import { Elysia } from "elysia";
import { DomainError } from '@/domain/error/domain.error'

export const errorPlugin = new Elysia({ name: "error-plugins" })
  .onError({ as: 'global' }, ({ code, error, set }) => {
    if (error instanceof DomainError) {
      set.status = error.statusCode
      return {
        type: 'domain',
        code: error.code,
        message: error.message,
      }
    }

    if (code !== 'VALIDATION') return

    set.status = 422
    return {
      type: 'validation',
      message: 'Request validation failed',
      details: error.all.map(({ path, message }) => ({
        field: path.replace(/^\//, '').replaceAll('/', '.'),
        message,
      })),
    }
  })
