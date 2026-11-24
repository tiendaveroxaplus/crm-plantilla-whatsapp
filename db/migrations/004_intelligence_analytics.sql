ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_level text NOT NULL DEFAULT 'NEW' CHECK (lead_level IN ('NEW','INTERESTED','POTENTIAL','HOT','PAYMENT_PENDING','WON','LOST'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS interest_product text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_score integer NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_classified_at timestamptz;
CREATE INDEX IF NOT EXISTS conversations_lead_level_idx ON conversations(lead_level, updated_at DESC);
CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL, provider text NOT NULL, model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0, output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,8) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage(created_at DESC);
