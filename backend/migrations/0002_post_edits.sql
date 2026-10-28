-- Append-only edit history. Published content remains unchanged until a reviewer
-- approves the exact immutable proposal against its expected base revision.
ALTER TABLE posts ADD COLUMN edited_at INTEGER CHECK(edited_at IS NULL OR edited_at >= created_at);
ALTER TABLE replies ADD COLUMN edited_at INTEGER CHECK(edited_at IS NULL OR edited_at >= created_at);
CREATE TABLE post_edits (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  expected_revision INTEGER NOT NULL CHECK(expected_revision >= 1),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','cancelled')),
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  cancelled_at INTEGER,
  CHECK((state = 'cancelled') = (cancelled_at IS NOT NULL)),
  FOREIGN KEY(post_id,delivery_id) REFERENCES posts(id,delivery_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX one_pending_post_edit ON post_edits(post_id,expected_revision) WHERE state='pending';
CREATE INDEX post_edits_manual_review ON post_edits(state,submitted_at);

CREATE TRIGGER post_edits_immutable BEFORE UPDATE OF post_id,delivery_id,owner_id,expected_revision,title,body,submitted_at ON post_edits
BEGIN
  SELECT RAISE(ABORT,'post_edit_immutable');
END;

CREATE TRIGGER post_edits_terminal BEFORE UPDATE OF state ON post_edits
WHEN OLD.state != 'pending' AND NEW.state != OLD.state
BEGIN
  SELECT RAISE(ABORT,'post_edit_terminal');
END;
CREATE TRIGGER post_edits_cancellation_time BEFORE UPDATE OF cancelled_at ON post_edits
WHEN OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NOT OLD.cancelled_at
BEGIN
  SELECT RAISE(ABORT,'post_edit_cancellation_immutable');
END;
