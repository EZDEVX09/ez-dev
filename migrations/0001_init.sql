-- EZ DEV platform schema (shared by EZ DEV, EZ APP, EZ SITE, EZ DEFENDER)

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  created_at    INTEGER NOT NULL
);

-- Session tokens are stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app        TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- One-time codes that hand a signed-in EZ DEV session to a subsidiary app.
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash  TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin     TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,
  period  TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind, period)
);

-- EZ APP and EZ SITE projects
CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product         TEXT NOT NULL CHECK (product IN ('app', 'site')),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE,
  published       INTEGER NOT NULL DEFAULT 0,
  preview_key     TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, product, updated_at);

CREATE TABLE IF NOT EXISTS versions (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  n          INTEGER NOT NULL,
  files      TEXT NOT NULL,
  prompt     TEXT NOT NULL,
  summary    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, n)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, id);

-- EZ DEFENDER
CREATE TABLE IF NOT EXISTS sites (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain       TEXT NOT NULL,
  token        TEXT NOT NULL,
  verified_at  INTEGER,
  monitor      INTEGER NOT NULL DEFAULT 0,
  last_grade   TEXT,
  last_scan_at INTEGER,
  created_at   INTEGER NOT NULL,
  UNIQUE (user_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_sites_monitor ON sites(monitor, last_scan_at);

CREATE TABLE IF NOT EXISTS scans (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id    TEXT REFERENCES sites(id) ON DELETE SET NULL,
  url        TEXT NOT NULL,
  grade      TEXT NOT NULL,
  score      INTEGER NOT NULL,
  deep       INTEGER NOT NULL DEFAULT 0,
  results    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scans_user ON scans(user_id, created_at);

CREATE TABLE IF NOT EXISTS alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id    TEXT REFERENCES sites(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, read, created_at);
