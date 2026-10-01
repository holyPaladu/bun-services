import { Elysia } from 'elysia'
import { DomainError } from '@/domain/error/domain.error'
import { AuthError } from '@/domain/error/auth.error'

export const errorPlugin = new Elysia({ name: 'error-plugins' })
  .onError({ as: 'global' }, ({ code, error, set }) => {
    set.headers['cache-control'] = 'no-store'
    if (error instanceof AuthError) {
      set.status = 401
      set.headers['www-authenticate'] = 'Bearer'
      return { type: 'authentication', code: 'UNAUTHORIZED', message: 'Authentication failed' }
    }
    if (error instanceof DomainError) {
      set.status = error.statusCode
      return { type: 'domain', code: error.code, message: error.message }
    }
    if (code === 'VALIDATION' || code === 'PARSE') {
      set.status = code === 'PARSE' ? 400 : 422
      // Validation messages can contain submitted credentials. Do not echo them.
      return { type: 'validation', message: 'Request validation failed' }
    }
    if (code === 'NOT_FOUND') {
      set.status = 404
      return { message: 'Not found' }
    }
    set.status = 500
    return { type: 'internal', message: 'Internal server error' }
  })
