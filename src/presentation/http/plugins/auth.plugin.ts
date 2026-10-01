import { Elysia } from 'elysia'
import type { AccessTokenVerifier } from '@/application/ports/access-token.verifier'
import { AuthError } from '@/domain/error/auth.error'

export const authPlugin = (verifier: AccessTokenVerifier) =>
  new Elysia({ name: 'user-authentication' })
    .derive({ as: 'scoped' }, async ({ request }) => {
      const authorization = request.headers.get('authorization')
      const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i)
      if (!authorization || authorization.length > 4103 || !match) throw AuthError.invalidAccessToken()
      return { auth: await verifier.verify(match[1]) }
    })
