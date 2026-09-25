DROP TRIGGER accounts_set_updated_at ON accounts;
DROP FUNCTION set_accounts_updated_at();

ALTER TABLE accounts
  DROP CONSTRAINT accounts_status_check,
  DROP COLUMN deleted_at,
  DROP COLUMN status;
