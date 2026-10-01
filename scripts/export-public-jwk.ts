import { exportJWK, importSPKI } from 'jose'

const [publicKeyPath, kid] = Bun.argv.slice(2)
if (!publicKeyPath || !kid || !/^[A-Za-z0-9_-]{1,80}$/.test(kid)) {
  throw new Error('Usage: bun scripts/export-public-jwk.ts public.pem kid')
}
const key = await importSPKI(await Bun.file(publicKeyPath).text(), 'ES256')
const { kty, crv, x, y } = await exportJWK(key)
if (key.type !== 'public' || crv !== 'P-256') throw new Error('Expected P-256 public key')
console.log(JSON.stringify({ keys: [{ kty, crv, x, y, kid, alg: 'ES256', use: 'sig', key_ops: ['verify'] }] }))
