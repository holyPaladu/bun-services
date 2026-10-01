import Elysia from "elysia"
import { systemModels } from "@/presentation/http/schemas/system.schema"
import type { loadSigningKeys } from "@/infrastructure/security/jwt/keys"

interface SystemModuleDeps {
  signingKeys: Awaited<ReturnType<typeof loadSigningKeys>>
}

export const systemModule = ({ signingKeys }: SystemModuleDeps) => {
  return new Elysia({ name: 'system-module', prefix: '/system', tags: ['System'] })
    .model(systemModels)
    .get('/health', () => ({ status: 'ok' as const }), { response: { 200: 'healthResponse' } })
    .group('/security', app => app
      .get('/.well-known/jwks.json', ({ set }) => {
        set.headers['cache-control'] = 'public, max-age=60, must-revalidate'
        return structuredClone(signingKeys.jwks)
      }, {
        response: { 200: 'wellKnownJwksResponse' },
        detail: {
          summary: 'Public JWT verification keys (JWKS)',
          description: 'Public ES256 keys for access token verification. Authentication is not required.',
          security: [],
        },
      })
    )
}
