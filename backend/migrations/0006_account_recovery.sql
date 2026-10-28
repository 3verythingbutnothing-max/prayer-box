-- Verified contacts are enrolled by a trusted identity flow, never this public reset API.
CREATE TABLE recovery_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL CHECK(channel IN ('email','phone')),
  destination TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  revoked_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id,channel)
);
CREATE TABLE account_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  password_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE recovery_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  contact_id TEXT REFERENCES recovery_contacts(id),
  contact_version INTEGER,
  session_epoch INTEGER,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK(state IN ('pending','ready','failed','consumed')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  consume_token TEXT
);
CREATE INDEX recovery_challenges_expiry ON recovery_challenges(expires_at);
CREATE INDEX recovery_challenges_user ON recovery_challenges(user_id,created_at);
