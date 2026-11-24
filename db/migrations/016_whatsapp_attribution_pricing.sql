-- Atribución y precios observados a partir de webhooks nuevos; no se modifica el historial.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS referral_source_id text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS referral_headline text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS referral_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS free_entry_started_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS free_entry_expires_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS free_entry_confirmed_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS free_entry_trigger_message_id text;
CREATE INDEX IF NOT EXISTS conversations_referral_idx ON conversations(referral_at DESC) WHERE referral_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversations_free_entry_idx ON conversations(free_entry_expires_at) WHERE free_entry_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_message_pricing (
  provider_message_id text PRIMARY KEY,
  business_phone text NOT NULL,
  recipient_phone text,
  conversation_id uuid REFERENCES conversations(id),
  pricing_category text,
  pricing_type text,
  amount numeric(14,6),
  currency text,
  final_status text NOT NULL CHECK (final_status IN ('DELIVERED','READ')),
  delivered_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_pricing_phone_month_idx ON whatsapp_message_pricing(business_phone,delivered_at DESC);
