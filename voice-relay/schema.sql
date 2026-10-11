CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL, acknowledged_at INTEGER);
CREATE INDEX IF NOT EXISTS commands_pending ON commands(acknowledged_at, created_at);
