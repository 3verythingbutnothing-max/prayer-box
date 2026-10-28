-- Connections only control prayer-event invitations. They never grant prayer,
-- profile friendship, or organization membership permissions.
CREATE TABLE prayer_connections (
  id TEXT PRIMARY KEY,
  relation_key TEXT NOT NULL UNIQUE,
  person_id TEXT NOT NULL REFERENCES users(id),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('person','group')),
  target_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','active','disconnected','declined')),
  requested_by TEXT NOT NULL,
  disconnected_by TEXT,
  source TEXT NOT NULL CHECK(source IN ('manual','platform')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mutation_token TEXT,
  record TEXT NOT NULL CHECK(json_valid(record))
);
CREATE INDEX prayer_connections_person ON prayer_connections(person_id,status);
CREATE INDEX prayer_connections_target ON prayer_connections(target_kind,target_id,status);
CREATE TABLE prayer_events (
  id TEXT PRIMARY KEY,
  host_kind TEXT NOT NULL CHECK(host_kind IN ('person','group')),
  host_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL,
  starts_at TEXT NOT NULL,
  cancelled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mutation_token TEXT,
  record TEXT NOT NULL CHECK(json_valid(record))
);
CREATE INDEX prayer_events_upcoming ON prayer_events(cancelled_at,starts_at,id);
CREATE INDEX prayer_events_host ON prayer_events(host_kind,host_id);
CREATE TABLE prayer_event_shares (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES prayer_events(id),
  host_kind TEXT NOT NULL CHECK(host_kind IN ('person','group')),
  host_id TEXT NOT NULL,
  via_share_id TEXT REFERENCES prayer_event_shares(id),
  shared_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  mutation_token TEXT,
  record TEXT NOT NULL CHECK(json_valid(record))
);
CREATE UNIQUE INDEX one_active_event_share ON prayer_event_shares(event_id,host_kind,host_id) WHERE revoked_at IS NULL;
CREATE TABLE prayer_event_dismissals (
  event_id TEXT NOT NULL REFERENCES prayer_events(id),
  viewer_id TEXT NOT NULL REFERENCES users(id),
  dismissed_at INTEGER NOT NULL,
  PRIMARY KEY(event_id,viewer_id)
);
CREATE TABLE prayer_event_actions (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
