import { openapi } from '@elysia/openapi'

export const openApiPlugin = openapi({
  path: '/docs',
  // JWKS is a JSON API route; the default filter hides every path containing a dot.
  exclude: { staticFile: false },
  documentation: {
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste the accessToken returned by login, without the Bearer prefix.',
        },
      },
    },
    info: {
      title: 'Auth Service API',
      version: '1.0.0',
      description: 'API documentation for Auth Service',
    },
    tags: [
      {
        name: 'Auth',
        description: 'Authentication endpoints',
      },
      {
        name: 'System',
        description: 'System endpoints',
      },
    ],
  },
})
