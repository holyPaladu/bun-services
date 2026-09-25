import type { HashRepository } from '@/application/ports/hash.repository'

export const createBunHash = (): HashRepository => ({
  async hash(password) {
    return Bun.password.hash(password, {
      algorithm: 'argon2id',
    })
  },

  async verify(password, hash) {
    return Bun.password.verify(password, hash)
  },
})