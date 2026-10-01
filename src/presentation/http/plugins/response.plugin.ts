import { Elysia, ElysiaCustomStatusResponse } from 'elysia'

export const successEnvelope = new Elysia({ name: 'success-envelope' })
  .mapResponse({ as: 'scoped' }, ({ response, set }) => {
    const status = typeof set.status === 'number' ? set.status : 200
    if (status >= 400 || response == null || typeof response !== 'object' ||
        response instanceof Response || response instanceof ElysiaCustomStatusResponse) return
    const headers = new Headers({ 'content-type': 'application/json' })
    for (const [name, value] of Object.entries(set.headers)) {
      if (value === undefined) continue
      if (Array.isArray(value)) value.forEach(item => headers.append(name, item))
      else headers.set(name, String(value))
    }
    return new Response(JSON.stringify({ success: true, data: response }), { status, headers })
  })
