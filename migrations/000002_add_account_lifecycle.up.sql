ALTER TABLE accounts
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD CONSTRAINT accounts_status_check
    CHECK (status IN ('active', 'suspended'));

CREATE FUNCTION set_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION set_accounts_updated_at();
