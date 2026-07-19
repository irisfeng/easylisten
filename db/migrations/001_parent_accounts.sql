PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parent_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  consent_version TEXT,
  consented_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER,
  is_signup INTEGER NOT NULL DEFAULT 0,
  consent_version TEXT,
  request_ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_codes_email_created
  ON login_codes(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_codes_ip_created
  ON login_codes(request_ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS listener_profiles (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL UNIQUE REFERENCES parent_users(id) ON DELETE CASCADE,
  age_band TEXT NOT NULL CHECK (age_band IN ('6-9', '10-12', '13-16')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_preferences (
  parent_user_id TEXT PRIMARY KEY REFERENCES parent_users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
