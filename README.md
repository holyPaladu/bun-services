# Auth Service — Bun / Elysia / PostgreSQL

Clean architecture authentication with ES256 access tokens, public JWKS and opaque rotating refresh sessions. Consumer services need only public keys.

Read [security architecture, threat analysis, environment, key generation, rotation and deployment requirements](docs/security.md) before deployment.

## Local startup

1. `bun install --frozen-lockfile`
2. Copy `.env.example` to `.env`; set database credentials and URL.
3. Provision a P-256 key pair using the instructions in `docs/security.md`. Set JWT_PRIVATE_KEY, JWT_PUBLIC_JWKS, JWT_KEY_ID, JWT_ISSUER and JWT_AUDIENCE. Empty key placeholders intentionally prevent startup.
4. `docker compose build api`
5. `docker compose up -d` — migrations run before API starts.

The Compose database URL uses host `postgres`. For `bun run dev` on the host, use `127.0.0.1:5433` instead. `bun run dev` starts watch mode. API docs: `/docs`. Production requires trusted TLS ingress and shared auth rate limits; the local Compose file does not supply these.

## API

- POST `/api/auth/register` — email/password.
- POST `/api/auth/login` — email/password → access/refresh pair.
- POST `/api/auth/refresh` — refreshToken → rotated pair.
- POST `/api/auth/logout` — refreshToken → session revoked.
- GET `/api/auth/me` — Authorization: Bearer access token.
- GET `/system/security/.well-known/jwks.json` — public keys only.

Audience is fixed by server config (currently auth-service), never selected by the client. Access expires after 10 minutes by default. Logout/reuse revokes refresh sessions; stateless access expires naturally. Clients must serialize refresh calls and reauthenticate if a refresh response is lost.

## Validation

```bash
bun run typecheck
bun test
bun run build
```

Full PostgreSQL integration tests require TEST_DATABASE_URL pointing to a disposable database; otherwise those tests are reported skipped. See `docs/security.md`. No lint command is configured.

## Migrations

```bash
docker compose run --rm migrate
```

Create the next migration pair:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/migrations:/migrations" \
  migrate/migrate:v4.19.1 \
  create -ext sql -dir /migrations -seq -digits 6 add_your_change
```

## API documentation authentication

Open `/docs`, call `/api/auth/login` and copy `data.accessToken`. Select the
`bearerAuth` authorization scheme and paste the token without the `Bearer ` prefix.
The documentation client adds `Authorization: Bearer <token>` for `/api/auth/me`.
Refresh and logout receive `refreshToken` in the JSON body.

The public `/system/security/.well-known/jwks.json` route appears under System;
it returns JSON directly and requires no authentication. OpenAPI JSON is at `/docs/json`.
