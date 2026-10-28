-- Preserve existing group settings while extending the bounded icon palette.
-- No table refers to group_settings; its primary key continues to reference boxes.
CREATE TABLE group_settings_next (
  box_id TEXT PRIMARY KEY REFERENCES boxes(id) ON DELETE CASCADE,
  website TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'heart' CHECK (icon IN ('heart','people','box','sun','note','shield','cross','prayer-hands')),
  version INTEGER NOT NULL DEFAULT 1,
  mutation_token TEXT,
  archived_at INTEGER,
  updated_at INTEGER NOT NULL,
  deletion_proposal TEXT,
  color TEXT NOT NULL DEFAULT 'lavender' CHECK (color IN ('lavender','sky','sage','peach','sunrise'))
);
INSERT INTO group_settings_next(box_id,website,icon,version,mutation_token,archived_at,updated_at,deletion_proposal)
  SELECT box_id,website,icon,version,mutation_token,archived_at,updated_at,deletion_proposal FROM group_settings;
DROP TABLE group_settings;
ALTER TABLE group_settings_next RENAME TO group_settings;
