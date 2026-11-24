-- Permite reconciliar estados de YCloud que llegaron antes de guardar el mensaje saliente.
CREATE INDEX IF NOT EXISTS webhook_events_message_id_idx ON webhook_events
  ((payload->'whatsappMessage'->>'id'), received_at DESC)
  WHERE event_type='whatsapp.message.updated';
