-- Resumen de cada conversación y análisis de la IA por cortes del día (mañana, tarde, noche).
-- Aditiva: no modifica tablas existentes.

CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  summary text NOT NULL,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_step text,
  interest text,
  message_count integer NOT NULL DEFAULT 0,
  model text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  slot text NOT NULL CHECK (slot IN ('MORNING', 'AFTERNOON', 'NIGHT')),
  from_at timestamptz NOT NULL,
  to_at timestamptz NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, slot)
);
CREATE INDEX IF NOT EXISTS ai_insights_day_idx ON ai_insights(day DESC);
