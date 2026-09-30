-- Stripe billing and transactional email

ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE users ADD COLUMN alert_emails INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN subscription_status TEXT;
ALTER TABLE users ADD COLUMN current_period_end INTEGER;
ALTER TABLE users ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- Processed Stripe webhook events (idempotency)
CREATE TABLE IF NOT EXISTS stripe_events (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One-time tokens for email verification and password reset (stored hashed)
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id, kind);

-- Delivery log (no message bodies)
CREATE TABLE IF NOT EXISTS email_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,
  template   TEXT NOT NULL,
  status     TEXT NOT NULL,
  provider_id TEXT,
  created_at INTEGER NOT NULL
);
