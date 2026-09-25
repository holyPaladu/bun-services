import { openapi } from '@elysia/openapi'

export const openApiPlugin = openapi({
  path: '/docs',
  documentation: {
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