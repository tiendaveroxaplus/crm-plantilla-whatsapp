ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS media_url text;
CREATE INDEX IF NOT EXISTS messages_direction_created_idx ON messages(direction, created_at DESC);
