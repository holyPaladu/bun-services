import {
  Elysia,
  ElysiaCustomStatusResponse,
} from 'elysia'

export const successEnvelope = new Elysia({ name: 'success-envelope' })
  .mapResponse({ as: 'scoped' }, ({ response, set }) => {
    const status = typeof set.status === 'number' ? set.status : 200
    if (status >= 400) return

    if (
      response == null ||
      typeof response !== 'object' ||
      response instanceof Response ||
      response instanceof ElysiaCustomStatusResponse
    ) return

    return new Response(JSON.stringify({ success: true, data: response }), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })