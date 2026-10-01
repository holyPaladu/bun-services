import { afterAll, expect, test } from 'bun:test'
import { SQL } from 'bun'
import type { OpenAPIV3_1 } from 'openapi-types'
import { createApp } from '@/app'
import { keyFixture } from './fixtures'

// SQL connects lazily; documentation requests must work without database access.
const client = new SQL('postgres://unused:unused@127.0.0.1:1/unused')
const fixture = await keyFixture()
const app = await createApp({ client, jwt: fixture.config })
afterAll(() => client.close())

test('OpenAPI documents Bearer auth only for protected routes and includes JWKS', async () => {
  const response = await app.handle(new Request('http://localhost/docs/json'))
  expect(response.status).toBe(200)
  const spec = await response.json() as OpenAPIV3_1.Document
  expect(spec.components?.securitySchemes?.bearerAuth).toMatchObject({
    type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
  })
  expect(spec.security).toBeUndefined()
  expect(spec.paths?.['/api/auth/me']?.get?.security).toEqual([{ bearerAuth: [] }])
  for (const path of ['/api/auth/register', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout']) {
    const operation = spec.paths?.[path]?.post
    expect(operation).toBeDefined()
    expect(operation?.security ?? []).toEqual([])
  }
  const jwks = spec.paths?.['/system/security/.well-known/jwks.json']?.get
  expect(jwks).toBeDefined()
  expect(jwks?.security).toEqual([])
  expect(jwks?.tags).toContain('System')
  expect(jwks?.responses?.['200']).toBeDefined()
})
