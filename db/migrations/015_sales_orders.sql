-- Pedidos confirmados por el equipo. Las etiquetas y la etapa no son ingresos.
-- Migración aditiva: no altera ni elimina conversaciones, contactos o mensajes.
CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  request_id uuid NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  total_pen numeric(14,2) NOT NULL CHECK (total_pen > 0),
  status text NOT NULL CHECK (status IN ('PENDING','PAID','CANCELLED')),
  closed_by text NOT NULL DEFAULT 'UNKNOWN' CHECK (closed_by IN ('AI','HUMAN','UNKNOWN')),
  paid_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_orders_paid_at_check CHECK ((status = 'PAID') = (paid_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_request_idx ON sales_orders(conversation_id, request_id);
CREATE INDEX IF NOT EXISTS sales_orders_conversation_idx ON sales_orders(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_orders_paid_idx ON sales_orders(paid_at DESC) WHERE status = 'PAID';
