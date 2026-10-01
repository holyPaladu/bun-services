import { t } from 'elysia'

export const systemModels = {
  healthResponse: t.Object({ status: t.Literal('ok') }),
  wellKnownJwksResponse: t.Object({
    keys: t.Array(t.Object({
      kty: t.Literal('EC'),
      kid: t.String(),
      use: t.Literal('sig'),
      alg: t.Literal('ES256'),
      crv: t.Literal('P-256'),
      x: t.String(),
      y: t.String(),
      key_ops: t.Tuple([t.Literal('verify')]),
    }, { additionalProperties: false })),
  }, { additionalProperties: false }),
}
