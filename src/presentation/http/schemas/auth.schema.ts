import { t } from 'elysia'

export const authModels = {
  registerBody: t.Object({
    email: t.String({ format: 'email', minLength: 4, maxLength: 256 }),
    password: t.String({ minLength: 8, maxLength: 128 }),
  }),
  registerResponse: t.Object({
    message: t.String(),
  }),
}
