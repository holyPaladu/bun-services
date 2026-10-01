# Authentication security

## Repository analysis and preserved boundaries

The repository contains one auth service, not yet an implemented fleet of services. Runtime: Bun 1.4.0; Elysia 1.4.30; jose 6.2.12; TypeScript 7.0.2. PostgreSQL uses Bun.SQL and ordered up/down migrations. The original login route returned placeholders. Registration, AccountEntity, Argon2id, error/response plugins and SQL account storage already existed. The generic unused JwtRepository has been replaced.

Domain ← application ← infrastructure/presentation. Application ports use application/domain types only. Infrastructure implements ports. Each HTTP module assembles its own repositories, adapters and use cases, following the original module composition convention. auth.module.ts owns authentication composition; app.ts connects modules and initializes the key set shared by authentication and the public JWKS route. index.ts loads config and starts the listener. No crypto singleton, per-request PEM import, framework import in application, or shared HMAC secret.

## Chosen approach / rejected alternatives / why

ES256 with P-256, PKCS8 private PEM and public JWK set. Only Auth Service receives the private key. Public consumers receive an AccessTokenVerifier; its interface has no signing capability. WebCrypto public keys have verify usage only. This does not protect a host if someone mistakenly deploys signing secrets there.

Ed25519/EdDSA is also supported and suitable for a homogeneous stack. ES256 leaves a convenient interoperability path to heterogeneous consumers and standard KMS/HSM offerings; compatibility must be checked with the actual provider before adoption. RS256 works but has larger keys/signatures and no demonstrated legacy requirement here. HS256 is rejected because every verifier could mint tokens. Neither custom crypto nor a JWT refresh token is needed.

Actual generate/sign/verify tests pass for EdDSA, ES256 and RS256 in Bun 1.4.0 + jose 6.2.12. Re-run after runtime/dependency updates. `bun scripts/benchmark-jwt.ts` uses ephemeral keys and measures the implemented ES256 adapters with keys already imported. On the development machine: 1000 sequential operations, approximately 0.047 ms/sign and 0.085 ms/verify. This excludes HTTP, database, load/concurrency and network latency; it is not a throughput SLA or an algorithm comparison.

Sources: [jose runtime support](https://github.com/panva/jose), [jose algorithm requirements](https://github.com/panva/jose/issues/210), [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html), [OAuth security BCP refresh rotation](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14).

## Claims and token separation

| Field | Created by | Verified by / purpose |
| --- | --- | --- |
| header.alg = ES256 | Signer constant | Verifier allow-list, EC P-256 public keys only |
| header.typ = at+jwt | Signer constant | Exact user access type; service/refresh/reset/email tokens rejected |
| header.kid | Deployment config | Known unique public key ID; required, constrained string |
| sub | Login/refresh, account UUID | Required UUID, mapped to accountId |
| iss | Trusted server config | Exact configured HTTPS issuer URI; not fetched from token |
| aud | Trusted server config, session audience | Exactly one string naming target service; arrays rejected |
| iat | Injected Clock | Integer time, not in future beyond tolerance, maximum age checked |
| exp | iat + configured TTL | Required integer expiry; exp > iat and bounded lifetime |
| jti | CSPRNG UUID | Required UUID, mapped to tokenId for correlation; not a replay database |
| sid | Session UUID | Required UUID, mapped to sessionId; not checked in DB on each API request |
| nbf | Not issued currently | If supplied, jose checks not-before and adapter checks integer/order |

Roles, scopes and permissions are not issued because the current account model has no authorization policy. Do not infer authorization from authentication. Raw JWT payload is not passed into use cases.

Default TTL 600 seconds (configurable 300–900), clock tolerance 5 seconds (maximum 30). Keep hosts synchronized. Effective acceptance may extend through the tolerance interval.

Current audience is `auth-service`, for `/api/auth/me`. A token for `orders-service` cannot be accepted by `admin-service`, even under the same issuer and keys. Clients cannot choose audience in login/refresh input; unexpected body fields are rejected. Session audience cannot change during refresh. Before adding issuance for orders/admin, implement explicit server-side entitlement policy and separate target issuance/exchange. Never turn an audience allow-list into an authorization grant.

## Request flow

```text
Login → account/password/status check → create session identity
      → sign access → store session + refresh hash atomically → client
Client → Authorization: Bearer access → target service → public-key verify → AuthContext

Refresh → hash opaque credential → lock session → read token state
        → validate expiry/audience/revocation → read account inside same transaction
        → sign access → consume old hash + insert new hash → commit → client
Reuse → commit session revocation → 401
Logout → revoke session by current or historical refresh hash → 204
```

Endpoints:

- POST `/api/auth/register`: `{ email, password }`; existing registration behavior, no automatic login.
- POST `/api/auth/login`: `{ email, password }`.
- POST `/api/auth/refresh`: `{ refreshToken }`.
- POST `/api/auth/logout`: `{ refreshToken }`; idempotent for a valid-shaped credential.
- GET `/api/auth/me`: bearer access token; returns accountId/sessionId without a DB read.
- GET `/system/security/.well-known/jwks.json`: public unwrapped JSON `{ keys: [...] }`.

Token responses retain the API success envelope:

```json
{"success":true,"data":{"accessToken":"...","accessTokenExpiresIn":600,"refreshToken":"...","refreshTokenExpiresAt":"2026-10-31T00:00:00.000Z","tokenType":"Bearer"}}
```

ExpiresIn is now seconds, not the placeholder Date in the old unused login response. Refresh expiry is an absolute ISO timestamp. Token responses and errors carry Cache-Control: no-store. Authentication errors expose the same generic 401 and WWW-Authenticate: Bearer, without jose internals. Malformed HTTP bodies receive 400/422 without echoing secrets.

This is a JSON token API for trusted clients/native clients/BFFs. No implicit cookie authentication is introduced. Browser integration should keep refresh credentials in a BFF or use a separately designed Secure/HttpOnly/SameSite cookie flow with CSRF controls; do not persist them in localStorage. Apply exact CORS allow-lists when cross-origin access is actually introduced.

## Refresh storage and transaction semantics

Opaque refresh: 32 cryptographically random bytes, canonical base64url (43 chars), SHA-256 hash in storage. SHA-256 is appropriate for high-entropy random credentials; password hashing remains Argon2id. No refresh JWT signing key, token contents or refresh verification is distributed to consumer services.

`auth_sessions`: id, account_id, audience, created_at, expires_at, revoked_at.
`refresh_tokens`: token_hash, session_id, created_at, consumed_at, rotated_from. Expiration/revocation inherited from the session. No unnecessary device metadata/PII.

Sessions expire absolutely after 30 days by default. Every refresh checks account active/not deleted. Session row locks serialize refresh and logout; token consumed state is read after acquiring the lock under READ COMMITTED. Account is read/locked in the same transaction so a single-connection pool works and status cannot change during issuance. Throwing on signing/account failure rolls back. Reuse returns normally from the transaction to commit revocation, then the application raises 401. UNIQUE constraints enforce one active refresh per session and one successor per hash.

A concurrent duplicate refresh is treated as reuse: one request can return tokens, then the other revokes their session. Clients must serialize refresh and must not automatically retry a lost refresh response. A response lost after commit requires login again. No grace window is implemented, because it weakens strict theft detection and requires a different credential recovery design.

Keep consumed tokens until session expiration for reuse detection. Schedule bounded cleanup batches (maintenance tooling, not every request):

```sql
DELETE FROM auth_sessions WHERE id IN (
  SELECT id FROM auth_sessions
  WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
  ORDER BY expires_at LIMIT 1000
);
```

Cascades remove refresh history. Monitor session/token growth; no background scheduler is added to this small service.

## Key storage, startup and JWKS

Required Auth Service variables:

```dotenv
JWT_PRIVATE_KEY=<PKCS8 PEM from secret storage; real newlines or literal \n>
JWT_PUBLIC_JWKS=<JSON public keys, active and retiring>
JWT_KEY_ID=auth-2026-01
JWT_ISSUER=https://auth.internal.example
JWT_AUDIENCE=auth-service
JWT_ACCESS_TTL=600
JWT_CLOCK_TOLERANCE=5
REFRESH_TOKEN_TTL=2592000
```

Database/PORT variables remain as in `.env.example`. Empty template key values intentionally fail startup. PEM is imported once; public key set is parsed/imported once; startup signs/verifies a probe to check the active key pair. Invalid/missing key, kid, curve, private parameters in JWKS, duplicate kid, issuer or TTL stops startup before listen. Configuration errors are sanitized; never print the entire env/config object.

Compose injects JWT variables explicitly, using empty defaults when they are absent so maintenance commands such as stop remain available. The application validates required JWT settings at startup before opening the HTTP listener. Production secret injection must come from deployment tooling with restrictive access; avoid CLI arguments, shell history, CI logs and images containing private material. `.pem`, `.key`, `secrets/` and env files are excluded; never commit a private JWK JSON under an arbitrary filename either. Avoid `docker compose config` in logs because resolved secrets can appear there. The public JWKS response is built from allow-listed fields only.

Consumer services may import `createRemoteAccessTokenVerifier(policy, trustedUrl)` directly without loading Auth Service config or private keys:

```ts
const verifier = createRemoteAccessTokenVerifier({
  issuer: 'https://auth.internal.example',
  audience: 'orders-service',
  accessTtl: 600,
  clockTolerance: 5,
  clock: createSystemClock(),
}, 'https://auth.internal.example/system/security/.well-known/jwks.json')
```

Provision this URL from trusted deployment configuration (for example consumer-only `JWT_JWKS_URL`), never `iss`, `jku`, `x5u`, request parameters or untrusted discovery. HTTPS only, no credentials/query/fragment, no redirects, 2s fetch timeout, 64KiB body bound, at most 10 keys, 5 minute cache, 30 second unknown-key cooldown. Network egress/DNS/TLS remain deployment trust boundaries; allow-list the actual Auth host at ingress/egress.

During Auth outage a fresh cached key works. Cold or expired caches fail closed; there is no unlimited stale-key fallback. Unknown kid causes refresh only after cooldown. HTTP JWKS Cache-Control max-age is 60s; jose's local cache is independently 300s. Emergency removal can take up to cache lifetime unless consumers are restarted/refreshed.

Local public-key config is a supported alternative: call loadPublicKeys and createLocalAccessTokenVerifier. It removes request-time network dependence but requires coordinated consumer deployments for rotation. Auth itself uses this local mode. Consumers should not import app.ts or loadJwtConfig.

## Rotation lifecycle

1. Generate a new key pair in controlled secret storage, with a new unique kid.
2. Publish both old and new PUBLIC keys everywhere while continuing to sign with old key. Reload/redeploy Auth replicas consistently (configuration is immutable after startup).
3. Wait for JWKS propagation: at least the longest consumer/proxy cache interval (here allow 300 + 60 seconds conservatively) and verify availability on consumers. Local-key consumers need their config deployed first.
4. Switch Auth signing key + JWT_KEY_ID atomically; keep both public keys in JWKS. During rolling deployment both active versions remain trusted.
5. Record the LAST issuance with the old key across all replicas. Keep its public key for at least the maximum access TTL ever issued under that key + maximum clock tolerance. Use 900 + 30 seconds conservatively with current bounds.
6. Remove old public key and old private secret. Avoid reusing kid. Consumer cache expiry bounds retirement visibility.

Do not lower verifier max TTL before previously issued longer tokens expire. If a private key is compromised, waiting out the normal overlap is unsafe: remove it immediately, rotate and force consumer cache invalidation/restarts. Existing legitimate tokens under it will also fail. Revoke sessions as required by the incident scope.

## Safe key generation

These commands are instructions only; no production private key is generated or stored in the repository by this implementation. Run in a protected directory outside the checkout on the intended secret-management host. Use a new empty directory so commands do not overwrite an existing key.

```bash
umask 077
mkdir auth-key-2026-01
cd auth-key-2026-01
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
```

From the service directory, export ONLY the public JWK:

```bash
bun scripts/export-public-jwk.ts /secure/path/auth-key-2026-01/public.pem auth-2026-01 > /secure/path/auth-key-2026-01/public-jwks.json
```

Import private.pem into your secret manager and inject JWT_PRIVATE_KEY without printing it. Use the public JSON for JWT_PUBLIC_JWKS. The helper only accepts a public SPKI key and outputs public fields. For overlap combine old/new public entries into one keys array.

## Service-to-service decisions

| Approach | Suitable use / limitation |
| --- | --- |
| User forwarding | Explicit delegated user action, target audience correct, least privilege; no universal forwarding |
| Separate service JWT | Short-lived service identity and scope; needs authenticated issuance and credential lifecycle |
| OAuth2 Client Credentials | Preferred next step for machine issuance via established trusted issuer; authorization still required |
| mTLS | Transport peer identity, deployment/mesh certificate operations; does not express user permissions |
| mTLS + service JWT | Useful when both authenticated workload identity and scoped application actions are needed |

No internal RPC/service credentials exist in this repository, so no speculative client-credentials endpoint or accepting service-token middleware has been added. Current verifier rejects every `service+jwt`. When service APIs arrive, provide a separate ServiceTokenVerifier/AuthContext and issuer flow with exact `typ=service+jwt`, service allow-list subject, exact target aud, bounded short TTL and explicit scope policy (prefer a separate signing key set/issuer namespace as well). Do not extend the user verifier to accept both types. Workload mTLS can then be added at mesh/ingress without changing application user ports.

## Threat analysis

| Threat | Impact | Mitigation / remaining limit |
| --- | --- | --- |
| Stolen access | Impersonation until expiry | TLS, 10 min TTL, exact target aud; bearer replay remains possible |
| Stolen refresh | New access/session takeover | 256-bit randomness, hashes only, rotation, family revocation on reuse; theft unnoticed until reuse/expiry is possible |
| Compromised consumer | Its data and received credentials exposed | No private key, audience isolation; a verifier can still leak/abuse valid tokens it receives |
| Public key disclosure | No signing ability | Public by design, protect integrity of distribution |
| Private key disclosure | Arbitrary forged user access | Restricted secrets, emergency rotation, remove kid and invalidate caches |
| Algorithm confusion | Forgery/verification bypass | ES256 allow-list, P-256 public-only keys |
| alg=none | Unsigned access | jose signature verification plus allow-list |
| Wrong audience | Cross-service escalation | Exact single aud; server-controlled issuance |
| Wrong issuer | Untrusted identity | Exact configured iss, independent of token-provided URLs |
| Token substitution | Refresh/service/reset used as user | Exact at+jwt, incompatible user claims and key policy |
| Access replay | Duplicate authenticated actions | TTL, TLS; jti is correlation only; sensitive business operations need idempotency/step-up |
| Refresh reuse/races | Session fork | Serialized transaction, consumed history, committed family revoke |
| Old key after rotation | Old/forged tokens accepted | Exp/max-age checks, planned retirement and bounded caches |
| JWKS substitution/SSRF | Attacker keys/network access | Fixed HTTPS URL, no redirects/token URLs, egress policy, strict public schema |
| Refresh brute force | Credential guessing | 256-bit entropy, canonical input length, ingress rate limits |
| Credential/password brute force | Account attack/Argon2 resource exhaustion | Generic login errors, dummy hash; distributed ingress limits required |
| Token logging | Reusable credentials leak | No token/header/body logging; generic errors; request IDs or verified jti only |
| Database read breach | Stored session data exposed | No plaintext refresh, high-entropy hashes; DB write compromise remains trusted-state compromise |

## Deployment prerequisites and remaining risks

Apply migrations before starting the updated service; Docker Compose already orders the migrate job before API. Terminate TLS at trusted ingress, firewall direct access to the Bun listener, and enforce shared rate limits for login/register/refresh by client/network and account where appropriate. Do not trust arbitrary X-Forwarded-For. The repository has no gateway/Redis/mesh config: distributed rate limiting and TLS are deployment requirements, not implemented features. Native Bun listener body size is limited to 16KiB. Do not expose the development Postgres published port externally in production. Treat Swagger `/docs` exposure according to your deployment policy.

Revoking a session, suspending/deleting an account or logging out does NOT instantly revoke stateless access already issued. It remains usable up to expiry + skew. Add a deny-list/introspection/event-distributed account policy only where immediate revocation is necessary. These mechanisms change the no-DB-per-request availability model.

Potential next steps: Secret Manager/Vault/KMS signer adapter; automated rotation and monitoring; trusted gateway/rate limiting; established OAuth2/OIDC issuer rather than hand-written protocol endpoints; workload mTLS; centralized authorization and audited scope grants. Add security metrics using bounded reason codes/request IDs without raw errors, credentials or request bodies. This implementation does not claim OIDC/OAuth protocol compliance merely because it uses at+jwt.

## Validation

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
```

No lint configuration existed, so none is invented. Without TEST_DATABASE_URL, DB tests are explicitly skipped. Full validation requires a disposable PostgreSQL database whose user can create/drop schemas:

```bash
TEST_DATABASE_URL=postgres://test_user:test_password@127.0.0.1:55439/auth_security_test bun test
```

Tests create a unique schema, apply migrations and remove only that schema. Never set this variable to a production URL. Coverage includes all requested JWT cases, startup configuration, remote cache/cooldown/timeout, public-only JWKS, HTTP boundary, real PostgreSQL expiry/revocation/rotation/reuse/concurrency, rollback, single-connection pool and account status. The migration rollback test acts only inside this disposable schema.

## Files

Created:

- src/application/ports/{access-token.signer,access-token.verifier,clock,refresh-token.repository,session.repository}.ts
- src/domain/error/auth.error.ts
- src/application/usecases/{login-account,refresh-session,logout-session}.ts
- src/infrastructure/config/jwt.config.ts
- src/infrastructure/security/{opaque-refresh-token,system-clock}.ts
- src/infrastructure/security/jwt/{keys,jose-access-token.signer,jose-access-token.verifier}.ts
- src/infrastructure/postgres/repositories/session.repository.ts
- src/presentation/http/plugins/auth.plugin.ts
- migrations/000003_create_sessions.{up,down}.sql
- tests/{fixtures,jwt.test,remote-jwks.test,security-boundaries.test,auth.integration.test}.ts
- scripts/{export-public-jwk,benchmark-jwt}.ts
- docs/security.md

Modified:

- src/application/ports/account.repository.ts
- src/infrastructure/postgres/repositories/account.repository.ts
- src/infrastructure/config/env.ts
- src/presentation/http/modules/auth.module.ts
- src/presentation/http/schemas/auth.schema.ts
- src/presentation/http/plugins/{error,response}.plugin.ts
- src/{app,index}.ts
- package.json, bun.lock, tsconfig.json
- .env.example, compose.yml, .gitignore, .dockerignore, README.md

Removed: src/application/ports/jwt.repository.ts (unused generic sign/verify contract).
