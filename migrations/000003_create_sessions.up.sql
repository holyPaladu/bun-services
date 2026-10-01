CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_account_idx ON auth_sessions(account_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE refresh_tokens (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  rotated_from TEXT REFERENCES refresh_tokens(token_hash),
  UNIQUE (rotated_from)
);
CREATE INDEX refresh_tokens_session_idx ON refresh_tokens(session_id);
CREATE UNIQUE INDEX refresh_tokens_one_active_idx ON refresh_tokens(session_id) WHERE consumed_at IS NULL;
