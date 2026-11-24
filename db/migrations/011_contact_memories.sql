-- Hitos comerciales persistentes por contacto. No sustituye ni borra mensajes existentes.
CREATE TABLE IF NOT EXISTS contact_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('PRODUCT_INTEREST','PURCHASE_INTENT','PURCHASE_COMPLETED')),
  subject text NOT NULL,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, kind, subject)
);
CREATE INDEX IF NOT EXISTS contact_memories_recent_idx ON contact_memories(contact_id, last_seen_at DESC);
