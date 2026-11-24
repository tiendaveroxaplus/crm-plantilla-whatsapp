-- Capacidades operativas del CRM. Todas las sentencias preservan los datos existentes.
CREATE TABLE IF NOT EXISTS conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT 'Asesor',
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_notes_conversation_idx ON conversation_notes(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  actor_name text NOT NULL DEFAULT 'Asesor',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_audit_log_conversation_idx ON crm_audit_log(conversation_id, created_at DESC);

ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL'
  CHECK (priority IN ('LOW','NORMAL','HIGH'));
ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE INDEX IF NOT EXISTS follow_up_tasks_due_idx ON follow_up_tasks(status, due_at);

CREATE INDEX IF NOT EXISTS contacts_name_phone_idx ON contacts(display_name, whatsapp_phone);
CREATE INDEX IF NOT EXISTS messages_body_search_idx ON messages USING gin (to_tsvector('spanish', COALESCE(body, '')));
