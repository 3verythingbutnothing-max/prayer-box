-- Cognito is the sole password authority. No password/verifier/token goes here.
CREATE TABLE auth_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  age_band TEXT NOT NULL DEFAULT 'adult' CHECK(age_band IN ('adult','teen')),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  claim_id TEXT UNIQUE,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE auth_registrations (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  age_band TEXT NOT NULL CHECK(age_band IN ('adult','teen')),
  invite_id TEXT NOT NULL UNIQUE REFERENCES auth_invites(id),
  user_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('pending','provider_write','reconcile','complete')),
  lease_token TEXT,
  lease_until INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE TABLE auth_identities (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  provider_pool TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  provider_username TEXT NOT NULL,
  age_band TEXT NOT NULL CHECK(age_band IN ('adult','teen')),
  recovery_lock TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(provider_pool,provider_subject),
  UNIQUE(provider_pool,provider_username)
);
CREATE TABLE auth_recovery_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  code_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('pending','provider_write','reconcile','complete')),
  lease_token TEXT,
  lease_until INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE UNIQUE INDEX one_pending_recovery ON auth_recovery_attempts(user_id) WHERE state IN ('pending','provider_write','reconcile');
CREATE TABLE auth_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash)=64),
  state TEXT NOT NULL DEFAULT 'available' CHECK(state IN ('available','reserved','used','revoked')),
  attempt_id TEXT REFERENCES auth_recovery_attempts(id),
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX auth_codes_owner ON auth_recovery_codes(user_id,state);
-- Staff identities require MFA; ordinary registration never creates these roles.
CREATE TABLE auth_staff_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('admin','reviewer')),
  revoked_at INTEGER
);
