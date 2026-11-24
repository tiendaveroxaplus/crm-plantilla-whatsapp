CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE inbox_state AS ENUM ('UNREAD', 'PENDING_REPLY', 'IN_PROGRESS', 'RESPONDED', 'CLOSED');
CREATE TYPE message_direction AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE message_sender AS ENUM ('CUSTOMER', 'AI', 'HUMAN', 'SYSTEM');
CREATE TYPE message_status AS ENUM ('ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'ADVISOR')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_phone text UNIQUE NOT NULL,
  display_name text,
  city text,
  profile jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  inbox_state inbox_state NOT NULL DEFAULT 'UNREAD',
  pipeline_stage text NOT NULL DEFAULT 'NUEVO_LEAD',
  automation_mode text NOT NULL DEFAULT 'AI' CHECK (automation_mode IN ('AI', 'HUMAN', 'PAUSED')),
  assigned_user_id uuid REFERENCES users(id),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  operator_last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_inbox_idx ON conversations(inbox_state, updated_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  ycloud_message_id text UNIQUE,
  direction message_direction NOT NULL,
  sender message_sender NOT NULL,
  content_type text NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  status message_status,
  provider_payload jsonb NOT NULL DEFAULT '{}',
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);

CREATE TABLE webhook_events (
  provider_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE TABLE tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, color text NOT NULL DEFAULT '#64748b');
CREATE TABLE conversation_tags (conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE, tag_id uuid REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(conversation_id, tag_id));
CREATE TABLE follow_up_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, assigned_user_id uuid REFERENCES users(id), due_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE','CANCELLED')), note text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE knowledge_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, category text NOT NULL, content text NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','ARCHIVED')), version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Cada webhook se inserta primero aquí. La llave primaria evita procesar dos veces
-- las entregas duplicadas antes de que el worker haga cualquier acción externa.
