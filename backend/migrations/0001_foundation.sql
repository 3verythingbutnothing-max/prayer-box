-- Empty application schema. Synthetic fixtures live in seed.sql and are local-only.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','suspended','deleted')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('everyone','friends','private')),
  session_epoch INTEGER NOT NULL DEFAULT 0 CHECK (session_epoch >= 0),
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  csrf_hash TEXT NOT NULL CHECK (length(csrf_hash) = 64),
  user_id TEXT NOT NULL REFERENCES users(id),
  session_epoch INTEGER NOT NULL,
  assurance TEXT NOT NULL DEFAULT 'basic' CHECK (assurance IN ('basic','mfa')),
  authenticated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE boxes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('personal','organization')),
  owner_id TEXT NOT NULL REFERENCES users(id),
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('everyone','friends','private')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  authority_verified_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_personal_box ON boxes(owner_id) WHERE kind = 'personal';
CREATE TABLE memberships (
  box_id TEXT NOT NULL REFERENCES boxes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','invited','approved','declined','revoked')),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  approved_by TEXT REFERENCES users(id),
  approved_at INTEGER,
  revoked_at INTEGER,
  official_reply INTEGER NOT NULL DEFAULT 0 CHECK (official_reply IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (box_id,user_id),
  CHECK (status != 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND revoked_at IS NULL))
);
CREATE TABLE friendships (
  user_a TEXT NOT NULL REFERENCES users(id),
  user_b TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','removed')),
  PRIMARY KEY (user_a,user_b),
  CHECK (user_a < user_b)
);
CREATE TABLE box_circle (
  box_id TEXT NOT NULL REFERENCES boxes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','removed')),
  PRIMARY KEY (box_id,user_id)
);
CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id,blocked_id),
  CHECK (blocker_id != blocked_id)
);
CREATE TABLE box_blocks (
  box_id TEXT NOT NULL REFERENCES boxes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (box_id,user_id)
);
CREATE TABLE authored_sources (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES authored_sources(id),
  box_id TEXT NOT NULL REFERENCES boxes(id),
  audience TEXT NOT NULL CHECK (audience IN ('everyone','friends','private')),
  author_ceiling TEXT NOT NULL CHECK (author_ceiling IN ('everyone','friends','private')),
  box_ceiling TEXT NOT NULL CHECK (box_ceiling IN ('everyone','friends','private')),
  anonymous INTEGER NOT NULL CHECK (anonymous IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','deleted')),
  history_policy TEXT NOT NULL CHECK (history_policy IN ('personal','at_delivery','retained')),
  history_notice_version TEXT,
  -- This conservative local-fixture policy withholds the whole group copy on conflict.
  -- Real organization intake remains disabled until its disclosure/policy is approved.
  group_block_policy TEXT CHECK (group_block_policy = 'hold_on_conflict'),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (id,box_id),
  CHECK (history_policy = 'personal' OR (history_notice_version IS NOT NULL AND group_block_policy IS NOT NULL))
);
CREATE INDEX deliveries_box ON deliveries(box_id,created_at);
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id),
  kind TEXT NOT NULL CHECK (kind IN ('request','update','testimony')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','deleted')),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (id,delivery_id)
);
CREATE UNIQUE INDEX one_original_post ON posts(delivery_id) WHERE kind = 'request';
CREATE TABLE replies (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  parent_id TEXT,
  actor_id TEXT NOT NULL REFERENCES users(id),
  identity_mode TEXT NOT NULL CHECK (identity_mode IN ('personal','anonymous','organization')),
  body TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','deleted')),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (id,post_id,delivery_id),
  FOREIGN KEY (post_id,delivery_id) REFERENCES posts(id,delivery_id),
  FOREIGN KEY (parent_id,post_id,delivery_id) REFERENCES replies(id,post_id,delivery_id)
);
CREATE INDEX replies_post ON replies(post_id,created_at);
CREATE TABLE acknowledgments (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id),
  kind TEXT NOT NULL CHECK (kind IN ('platform','box_welcome')),
  template_version TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (delivery_id,kind)
);
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN ('bug','feature','other')),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','needs_manual_review','resolved','deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  feedback_id TEXT REFERENCES feedback(id),
  delivery_id TEXT,
  post_id TEXT,
  revision INTEGER,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'quarantined' CHECK (state IN ('quarantined','needs_manual_review','approved','rejected','deleted')),
  normalized_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (post_id,delivery_id) REFERENCES posts(id,delivery_id),
  CHECK ((feedback_id IS NOT NULL AND delivery_id IS NULL AND post_id IS NULL AND revision IS NULL)
    OR (feedback_id IS NULL AND delivery_id IS NOT NULL AND post_id IS NOT NULL AND revision IS NOT NULL)),
  CHECK (state != 'approved' OR normalized_key IS NOT NULL)
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('feedback_triage','notification','media_screen')),
  resource_id TEXT NOT NULL,
  recipient_id TEXT REFERENCES users(id),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','completed','needs_manual_review','dead_letter','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token TEXT,
  lease_until INTEGER,
  next_attempt_at INTEGER NOT NULL,
  dispatch_token TEXT,
  dispatch_until INTEGER,
  next_dispatch_at INTEGER NOT NULL,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX jobs_ready ON jobs(state,next_dispatch_at,next_attempt_at);
CREATE TABLE review_cases (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('feedback_triage','media_review','job_failure')),
  subject_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'needs_manual_review' CHECK (state IN ('needs_manual_review','assigned','resolved')),
  reason_code TEXT NOT NULL,
  assigned_to TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (kind,subject_id)
);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('feedback_received','media_review_needed')),
  resource_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  UNIQUE (recipient_id,kind,resource_id)
);
CREATE INDEX notifications_recipient ON notifications(recipient_id,created_at);
CREATE TABLE rate_buckets (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (key,window_start)
);
CREATE TABLE idempotency (
  owner_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id,key)
);
