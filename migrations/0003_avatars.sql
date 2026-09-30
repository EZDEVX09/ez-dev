-- Profile pictures. Stored as small base64 images (the browser resizes to 256×256 before upload).
ALTER TABLE users ADD COLUMN avatar_version INTEGER;

CREATE TABLE IF NOT EXISTS avatars (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
