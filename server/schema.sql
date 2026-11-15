-- 360 Panorama Viewer Cloudflare D1 Database Schema

CREATE TABLE IF NOT EXISTS paypal_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  paypal_id TEXT UNIQUE,
  plan_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT NOT NULL,
  approval_url TEXT NOT NULL DEFAULT '',
  paid_through TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  status_time TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS paypal_one_open_subscription ON paypal_subscriptions(user_id)
  WHERE status NOT IN ('CANCELLED', 'EXPIRED');

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  credits_balance INTEGER NOT NULL DEFAULT 4,
  credits_total INTEGER NOT NULL DEFAULT 4,
  api_calls_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_sessions_expiry ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  checkout_session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  amount_cents INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'paid',
  checkout_session_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);

-- Public-by-link panoramas; image bytes live in the private PANORAMA_SHARES KV namespace.
CREATE TABLE IF NOT EXISTS panorama_shares (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, width INTEGER NOT NULL,
  height INTEGER NOT NULL, size INTEGER NOT NULL, allow_download INTEGER NOT NULL,
  created_at INTEGER NOT NULL, revoked_at INTEGER, ready INTEGER NOT NULL DEFAULT 0, stored_bytes INTEGER NOT NULL DEFAULT 20971520
);
CREATE INDEX IF NOT EXISTS panorama_shares_owner ON panorama_shares(owner_id, created_at);

CREATE TABLE IF NOT EXISTS panorama_works (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, prompt TEXT NOT NULL, model TEXT NOT NULL,
 resolution TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, mime TEXT NOT NULL,
 parts INTEGER NOT NULL, created_at INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0,
 deleted_at INTEGER, stored_bytes INTEGER NOT NULL DEFAULT 67108864
);
CREATE INDEX IF NOT EXISTS panorama_works_owner ON panorama_works(owner_id, created_at);

CREATE TABLE IF NOT EXISTS risk_counters (key TEXT PRIMARY KEY, used INTEGER NOT NULL, expires_at INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS risk_counters_expiry ON risk_counters(expires_at);

CREATE TABLE IF NOT EXISTS generation_leases (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, expires_at INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS generation_leases_expiry ON generation_leases(expires_at);

-- Durable asynchronous panorama quality reviews. Image payloads remain in PANORAMA_SHARES KV.
CREATE TABLE IF NOT EXISTS panorama_quality_reviews (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  cost INTEGER NOT NULL,
  issues TEXT NOT NULL DEFAULT '[]',
  explanation TEXT NOT NULL DEFAULT '',
  review_model TEXT NOT NULL DEFAULT '',
  review_attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER,
  payload_ready INTEGER NOT NULL DEFAULT 0,
  candidate_mime TEXT NOT NULL DEFAULT '',
  candidate_parts INTEGER NOT NULL DEFAULT 0,
  reference_parts TEXT NOT NULL DEFAULT '[]',
  refunded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS panorama_quality_reviews_due
  ON panorama_quality_reviews(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS panorama_quality_reviews_owner
  ON panorama_quality_reviews(owner_id, created_at);

-- Marketing consent is created only with registration; existing users are not opted in.
CREATE TABLE IF NOT EXISTS marketing_consent (
  user_id TEXT PRIMARY KEY, email TEXT NOT NULL, opted_in INTEGER NOT NULL DEFAULT 0,
  consented_at INTEGER NOT NULL, activity_at INTEGER NOT NULL, unsubscribe_id TEXT NOT NULL UNIQUE,
  unsubscribed_at INTEGER, reminder_claimed_at INTEGER
);
