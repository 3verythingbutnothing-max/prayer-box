-- Roles stay separate from the legacy owner marker and official-prayer permission.
ALTER TABLE memberships ADD COLUMN is_moderator INTEGER NOT NULL DEFAULT 0 CHECK (is_moderator IN (0,1));
ALTER TABLE memberships ADD COLUMN moderator_since INTEGER;
ALTER TABLE group_settings ADD COLUMN deletion_proposal TEXT;
CREATE TABLE group_notices (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES users(id),
  box_id TEXT NOT NULL REFERENCES boxes(id),
  group_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX group_notices_recipient ON group_notices(recipient_id,created_at DESC,id DESC);
-- Minimal immutable audit facts; never copy prayer text or anonymous identity into notices.
CREATE TABLE group_content_removals (
  id TEXT PRIMARY KEY,
  box_id TEXT NOT NULL REFERENCES boxes(id),
  delivery_id TEXT NOT NULL REFERENCES deliveries(id),
  post_id TEXT NOT NULL REFERENCES posts(id),
  reply_id TEXT REFERENCES replies(id),
  target_key TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_role TEXT NOT NULL CHECK(actor_role IN ('admin','moderator')),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK(reason IN ('harassment','hate','solicitation','privacy','trinitarian','other')),
  expected_revision INTEGER NOT NULL CHECK(expected_revision >= 1),
  created_at INTEGER NOT NULL,
  UNIQUE(box_id,target_key)
);
CREATE TRIGGER group_content_removal_immutable BEFORE UPDATE ON group_content_removals
BEGIN SELECT RAISE(ABORT,'group_removal_immutable'); END;
