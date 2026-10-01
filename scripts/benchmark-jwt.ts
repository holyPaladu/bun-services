import { generateKeyPair } from 'jose'
import { createJoseAccessTokenSigner } from '@/infrastructure/security/jwt/jose-access-token.signer'
import { createLocalAccessTokenVerifier } from '@/infrastructure/security/jwt/jose-access-token.verifier'
import { createSystemClock } from '@/infrastructure/security/system-clock'

// Ephemeral test keys only; no key material is printed or persisted.
const { privateKey, publicKey } = await generateKeyPair('ES256')
const policy = { issuer: 'https://benchmark.invalid', audience: 'benchmark', accessTtl: 600, clockTolerance: 5, clock: createSystemClock() }
const signer = createJoseAccessTokenSigner({ ...policy, privateKey, keyId: 'benchmark' })
const verifier = createLocalAccessTokenVerifier(policy, new Map([['benchmark', publicKey]]))
const identity = { accountId: crypto.randomUUID(), sessionId: crypto.randomUUID() }
const { token } = await signer.sign(identity)
for (let i = 0; i < 100; i++) await verifier.verify((await signer.sign(identity)).token)
const count = 1000
let start = performance.now()
for (let i = 0; i < count; i++) await signer.sign(identity)
const signMs = (performance.now() - start) / count
start = performance.now()
for (let i = 0; i < count; i++) await verifier.verify(token)
console.log(JSON.stringify({ runtime: Bun.version, algorithm: 'ES256', count, signMs, verifyMs: (performance.now() - start) / count }))
