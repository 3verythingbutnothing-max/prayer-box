-- Group administration is separate from organization-wide prayer readership.
-- New groups remain unverified and cannot authorize new prayer intake yet.
ALTER TABLE memberships ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0,1));
ALTER TABLE memberships ADD COLUMN joined_at INTEGER;
ALTER TABLE memberships ADD COLUMN invited_by TEXT REFERENCES users(id);
ALTER TABLE memberships ADD COLUMN invited_at INTEGER;
UPDATE memberships SET is_admin = CASE WHEN role = 'owner' THEN 1 ELSE 0 END,
  joined_at = CASE WHEN status = 'approved' THEN approved_at ELSE NULL END;
CREATE TABLE group_settings (
  box_id TEXT PRIMARY KEY REFERENCES boxes(id) ON DELETE CASCADE,
  website TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'heart' CHECK (icon IN ('heart','people','box','sun','note','shield')),
  version INTEGER NOT NULL DEFAULT 1,
  mutation_token TEXT,
  archived_at INTEGER,
  updated_at INTEGER NOT NULL
);
INSERT INTO group_settings(box_id,updated_at) SELECT id,created_at FROM boxes WHERE kind = 'organization';
CREATE TABLE group_events (
  id TEXT PRIMARY KEY,
  box_id TEXT NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_id TEXT REFERENCES users(id),
  previous_version INTEGER NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
