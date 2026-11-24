CREATE TABLE IF NOT EXISTS ai_response_jobs (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','IDLE')),
  due_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  handled_through timestamptz NOT NULL DEFAULT to_timestamp(0),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_response_jobs_due_idx ON ai_response_jobs(status, due_at);

-- La presentación transparente solicitada por el propietario prevalece sobre el texto semilla antiguo.
UPDATE knowledge_entries
SET content = replace(content, 'No decir que eres inteligencia artificial.', 'Preséntate como asistente de IA del negocio al iniciar la conversación.'),
    version = version + 1, updated_at = now()
WHERE category = 'FORMA_DE_HABLAR' AND content LIKE '%No decir que eres inteligencia artificial.%';
