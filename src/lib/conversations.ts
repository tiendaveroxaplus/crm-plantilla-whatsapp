import { db } from "@/lib/database";
import { classifyReferral, entryExpiry } from "@/lib/whatsapp-pricing";

type InboundMessage = { id: string; from: string; name?: string; text: string; contentType?: string; mediaUrl?: string | null; payload: unknown; referral?: { source_type?: unknown; source_id?: unknown; headline?: unknown } | null; sentAt?: string };
type OutboundUpdate = { id: string; status: "accepted" | "sent" | "delivered" | "read" | "failed"; payload: unknown; error?: string };

const statusMap = { accepted: "ACCEPTED", sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" } as const;

export async function registerWebhookEvent(id: string, type: string, payload: unknown) {
  const rows = await db()`INSERT INTO webhook_events (provider_event_id, event_type, payload) VALUES (${id}, ${type}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (provider_event_id) DO UPDATE SET received_at=now(), processing_error=NULL
    WHERE webhook_events.processed_at IS NULL RETURNING provider_event_id`;
  return rows.length === 1;
}

export async function markWebhookFailed(id: string, reason: string) {
  await db()`UPDATE webhook_events SET processing_error=${reason.slice(0, 300)} WHERE provider_event_id=${id} AND processed_at IS NULL`;
}

export async function markWebhookProcessed(id: string, processingError?: string) {
  await db()`UPDATE webhook_events SET processed_at = now(), processing_error = ${processingError ?? null} WHERE provider_event_id = ${id}`;
}

export async function recentWebhookDiagnostics() {
  const [events, totals] = await Promise.all([
    db()`SELECT event_type AS type, received_at AS "receivedAt", processed_at AS "processedAt", processing_error AS error FROM webhook_events ORDER BY received_at DESC LIMIT 20`,
    db()`SELECT COUNT(*)::int AS events, COUNT(*) FILTER (WHERE event_type = 'whatsapp.inbound_message.received')::int AS inbound FROM webhook_events`,
  ]);
  return { events, totals: totals[0] };
}

export async function persistInboundMessage(message: InboundMessage, allowAiReply = false) {
  const phone = message.from.replace(/^\+/, "");
  return db().begin(async (tx) => {
    const contacts = await tx`
      INSERT INTO contacts (whatsapp_phone, display_name)
      VALUES (${phone}, ${message.name ?? null})
      ON CONFLICT (whatsapp_phone) DO UPDATE SET display_name = CASE
        WHEN contacts.profile->>'name_manually_set' = 'true' THEN contacts.display_name
        ELSE COALESCE(EXCLUDED.display_name, contacts.display_name) END, updated_at = now()
      RETURNING id`;
    const contactId = contacts[0].id;
    const conversations = await tx`
      INSERT INTO conversations (contact_id, inbox_state, last_inbound_at)
      VALUES (${contactId}, 'UNREAD', now())
      ON CONFLICT (contact_id) DO UPDATE SET updated_at = conversations.updated_at
      RETURNING id, automation_mode`;
    const conversationId = conversations[0].id;
    const inserted = await tx`
      INSERT INTO messages (conversation_id, ycloud_message_id, direction, sender, content_type, body, media_url, provider_payload)
      VALUES (${conversationId}, ${message.id}, 'INBOUND', 'CUSTOMER', ${message.contentType ?? "text"}, ${message.text}, ${message.mediaUrl ?? null}, ${JSON.stringify(message.payload)}::jsonb)
      ON CONFLICT (ycloud_message_id) DO NOTHING RETURNING id`;
    if (inserted.length) {
      await tx`UPDATE conversations SET inbox_state = 'UNREAD', last_inbound_at = now(), updated_at = now() WHERE id = ${conversationId}`;
      const referral = classifyReferral(message.referral);
      if (referral) {
        const parsed = message.sentAt ? new Date(message.sentAt) : new Date();
        const referredAt = Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
        await tx`UPDATE conversations SET entry_source=${referral.source}, referral_source_id=${referral.sourceId},
          referral_headline=${referral.headline}, referral_at=${referredAt},
          free_entry_started_at=NULL,free_entry_expires_at=NULL,free_entry_confirmed_at=NULL,
          free_entry_trigger_message_id=NULL
          WHERE id=${conversationId} AND (free_entry_expires_at IS NULL OR free_entry_expires_at<now())`;
      }
    }
    if (inserted.length && allowAiReply && ["AI", "ESCALATED"].includes(conversations[0].automation_mode)) {
      await tx`INSERT INTO ai_response_jobs(conversation_id, due_at, handled_through)
        VALUES (${conversationId}, now() + interval '12 seconds',
          COALESCE((SELECT MAX(created_at) FROM messages
            WHERE conversation_id=${conversationId} AND direction='INBOUND' AND id<>${inserted[0].id}), to_timestamp(0)))
        ON CONFLICT (conversation_id) DO UPDATE SET generation=ai_response_jobs.generation+1,
          status='PENDING', due_at=EXCLUDED.due_at, attempts=0, last_error=NULL, updated_at=now()`;
    }
    return { conversationId: conversationId as string, inserted: inserted.length === 1 };
  });
}

// Mensajes enviados desde la app WhatsApp Business del celular (eventos "echoes"): se guardan para ver la conversación completa.
export async function persistBusinessAppMessage(message: { id: string; to: string; text: string; contentType: string; sentAt?: string; payload: unknown }) {
  const phone = message.to.replace(/^\+/, "");
  if (!phone) return { conversationId: null as string | null, inserted: false };
  const parsed = message.sentAt ? new Date(message.sentAt) : new Date();
  const when = Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() ? new Date() : parsed;
  return db().begin(async (tx) => {
    const contacts = await tx`INSERT INTO contacts (whatsapp_phone) VALUES (${phone})
      ON CONFLICT (whatsapp_phone) DO UPDATE SET updated_at = now() RETURNING id`;
    const conversations = await tx`INSERT INTO conversations (contact_id, inbox_state) VALUES (${contacts[0].id}, 'RESPONDED')
      ON CONFLICT (contact_id) DO UPDATE SET updated_at = conversations.updated_at RETURNING id`;
    const conversationId = conversations[0].id;
    const inserted = await tx`INSERT INTO messages (conversation_id, ycloud_message_id, direction, sender, content_type, body, status, provider_payload, created_at)
      VALUES (${conversationId}, ${message.id}, 'OUTBOUND', 'HUMAN', ${message.contentType}, ${message.text}, 'SENT', ${JSON.stringify(message.payload)}::text::jsonb, ${when.toISOString()})
      ON CONFLICT (ycloud_message_id) DO NOTHING RETURNING id`;
    if (inserted.length) await tx`UPDATE conversations SET last_outbound_at = GREATEST(COALESCE(last_outbound_at, to_timestamp(0)), ${when.toISOString()}::timestamptz),
      updated_at = now(), inbox_state = CASE WHEN inbox_state = 'PENDING_REPLY' THEN 'RESPONDED'::inbox_state ELSE inbox_state END WHERE id = ${conversationId}`;
    return { conversationId: String(conversationId), inserted: inserted.length === 1 };
  });
}

export async function getConversationAutomationMode(conversationId: string) {
  const rows = await db()`SELECT automation_mode AS "automationMode" FROM conversations WHERE id = ${conversationId} LIMIT 1`;
  return rows[0]?.automationMode as "AI" | "HUMAN" | "PAUSED" | "ESCALATED" | undefined;
}

export async function markConversationSeen(conversationId: string, throughMessageId?: string) {
  const seenAt = throughMessageId ? (await db()`SELECT created_at AS "createdAt" FROM messages
    WHERE id=${throughMessageId} AND conversation_id=${conversationId} AND direction='INBOUND' LIMIT 1`)[0]?.createdAt : new Date();
  if (!seenAt) return;
  await db()`UPDATE conversations SET operator_last_seen_at = GREATEST(
      COALESCE(operator_last_seen_at,to_timestamp(0)),${seenAt}::timestamptz),
    inbox_state = CASE WHEN inbox_state='UNREAD' THEN
      CASE WHEN (SELECT direction FROM messages WHERE conversation_id=${conversationId}
        ORDER BY created_at DESC,id DESC LIMIT 1)='INBOUND'
        THEN 'PENDING_REPLY'::inbox_state ELSE 'RESPONDED'::inbox_state END
      ELSE inbox_state END
    WHERE id = ${conversationId}`;
}

export async function persistAiUsage(input: { conversationId: string; model: string; inputTokens: number; outputTokens: number }) {
  const inputRate = Number(process.env.GOOGLE_AI_INPUT_COST_PER_MILLION ?? 0);
  const outputRate = Number(process.env.GOOGLE_AI_OUTPUT_COST_PER_MILLION ?? 0);
  const cost = input.inputTokens * inputRate / 1_000_000 + input.outputTokens * outputRate / 1_000_000;
  await db()`INSERT INTO ai_usage (conversation_id, provider, model, input_tokens, output_tokens, cost_usd) VALUES (${input.conversationId}, 'google', ${input.model}, ${input.inputTokens}, ${input.outputTokens}, ${cost})`;
}

export async function recordAgentMilestones(input: { conversationId: string; sourceMessageId: string; interestProduct?: string | null; purchaseIntent: boolean }) {
  await db().begin(async (tx) => {
    if (input.interestProduct) {
      await tx`UPDATE conversations SET interest_product=${input.interestProduct}, updated_at=now() WHERE id=${input.conversationId}`;
      await tx`INSERT INTO contact_memories(contact_id, conversation_id, kind, subject, source_message_id)
        SELECT contact_id, id, 'PRODUCT_INTEREST', ${input.interestProduct}, ${input.sourceMessageId}
        FROM conversations WHERE id=${input.conversationId}
        ON CONFLICT(contact_id, kind, subject) DO UPDATE SET last_seen_at=now(),
          conversation_id=EXCLUDED.conversation_id, source_message_id=EXCLUDED.source_message_id`;
    }
    if (input.purchaseIntent) {
      await tx`UPDATE conversations SET lead_level='HOT', updated_at=now()
        WHERE id=${input.conversationId} AND lead_level NOT IN ('WON','LOST')`;
      await tx`INSERT INTO contact_memories(contact_id, conversation_id, kind, subject, source_message_id)
        SELECT contact_id, id, 'PURCHASE_INTENT', ${input.interestProduct || "UNSPECIFIED"}, ${input.sourceMessageId}
        FROM conversations WHERE id=${input.conversationId}
        ON CONFLICT(contact_id, kind, subject) DO UPDATE SET last_seen_at=now(),
          conversation_id=EXCLUDED.conversation_id, source_message_id=EXCLUDED.source_message_id`;
    }
  });
}

export async function persistOutboundStatus(update: OutboundUpdate) {
  const status = statusMap[update.status];
  const rank = { ACCEPTED: 1, SENT: 2, DELIVERED: 3, READ: 4, FAILED: 5 }[status];
  await db()`UPDATE messages SET status=${status}, provider_payload=${JSON.stringify(update.payload)}::jsonb,
    error_detail=CASE WHEN ${status}::text='FAILED' THEN ${update.error ?? "Envío fallido"} ELSE NULL END,
    sent_at=CASE WHEN ${status}::text='SENT' THEN COALESCE(sent_at,now()) ELSE sent_at END,
    delivered_at=CASE WHEN ${status}::text='DELIVERED' THEN COALESCE(delivered_at,now()) ELSE delivered_at END,
    read_at=CASE WHEN ${status}::text='READ' THEN COALESCE(read_at,now()) ELSE read_at END
    WHERE ycloud_message_id=${update.id} AND (
      status IS NULL OR
      (${status}::text='FAILED' AND status IN ('ACCEPTED','SENT')) OR
      (${status}::text<>'FAILED' AND status<>'FAILED' AND
        CASE status WHEN 'ACCEPTED' THEN 1 WHEN 'SENT' THEN 2 WHEN 'DELIVERED' THEN 3 WHEN 'READ' THEN 4 ELSE 0 END < ${rank})
    )`;
  if (status === "FAILED") await db()`UPDATE conversations SET free_entry_started_at=NULL,
    free_entry_expires_at=NULL,free_entry_trigger_message_id=NULL
    WHERE free_entry_trigger_message_id=${update.id} AND free_entry_confirmed_at IS NULL`;
}

export async function recordWhatsappPricing(message: Record<string, unknown>) {
  const id = typeof message.id === "string" ? message.id : "";
  const status = typeof message.status === "string" ? message.status.toLowerCase() : "";
  if (!id || !["delivered", "read"].includes(status)) return;
  const businessPhone = String(message.from || process.env.YCLOUD_WHATSAPP_NUMBER || "").replace(/\D/g, "");
  if (!businessPhone) return;
  const recipient = typeof message.to === "string" ? message.to.replace(/\D/g, "") : null;
  const category = typeof message.pricingCategory === "string" ? message.pricingCategory : null;
  const pricingType = typeof message.pricingType === "string" ? message.pricingType : null;
  const numericPrice = typeof message.totalPrice === "number" ? message.totalPrice : null;
  const amount = numericPrice !== null && Number.isFinite(numericPrice) && numericPrice >= 0 ? numericPrice : null;
  const currency = typeof message.currency === "string" && /^[A-Z]{3}$/.test(message.currency) ? message.currency : null;
  const rawTime = typeof message.deliverTime === "string" ? message.deliverTime : typeof message.readTime === "string" ? message.readTime : null;
  const parsedTime = rawTime ? new Date(rawTime) : new Date();
  const deliveredAt = Number.isNaN(parsedTime.getTime()) ? new Date().toISOString() : parsedTime.toISOString();
  const rows = await db()`INSERT INTO whatsapp_message_pricing(provider_message_id,business_phone,recipient_phone,conversation_id,
    pricing_category,pricing_type,amount,currency,final_status,delivered_at)
    VALUES (${id},${businessPhone},${recipient},(SELECT conversation_id FROM messages WHERE ycloud_message_id=${id} LIMIT 1),
      ${category},${pricingType},${amount},${currency},${status.toUpperCase()},${deliveredAt})
    ON CONFLICT(provider_message_id) DO UPDATE SET business_phone=EXCLUDED.business_phone,
      recipient_phone=COALESCE(EXCLUDED.recipient_phone,whatsapp_message_pricing.recipient_phone),
      conversation_id=COALESCE(EXCLUDED.conversation_id,whatsapp_message_pricing.conversation_id),
      pricing_category=COALESCE(EXCLUDED.pricing_category,whatsapp_message_pricing.pricing_category),
      pricing_type=COALESCE(EXCLUDED.pricing_type,whatsapp_message_pricing.pricing_type),
      amount=COALESCE(EXCLUDED.amount,whatsapp_message_pricing.amount),
      currency=COALESCE(EXCLUDED.currency,whatsapp_message_pricing.currency),
      final_status=CASE WHEN whatsapp_message_pricing.final_status='READ' THEN 'READ' ELSE EXCLUDED.final_status END,
      delivered_at=LEAST(whatsapp_message_pricing.delivered_at,EXCLUDED.delivered_at),updated_at=now()
    RETURNING conversation_id AS "conversationId",pricing_type AS "pricingType"`;
  const conversationId = rows[0]?.conversationId;
  if (!conversationId) return;
  if (rows[0].pricingType === "free_entry_point") {
    const startedAt = typeof message.sendTime === "string" && !Number.isNaN(new Date(message.sendTime).getTime()) ? new Date(message.sendTime) : new Date(deliveredAt);
    await db()`UPDATE conversations SET entry_source=CASE WHEN entry_source='UNKNOWN' THEN 'META_ENTRY_UNSPECIFIED' ELSE entry_source END,
      free_entry_started_at=COALESCE(free_entry_started_at,${startedAt.toISOString()}::timestamptz),
      free_entry_expires_at=COALESCE(free_entry_expires_at,${entryExpiry(startedAt).toISOString()}::timestamptz),
      free_entry_confirmed_at=COALESCE(free_entry_confirmed_at,now()) WHERE id=${conversationId}`;
  } else {
    await db()`UPDATE conversations SET free_entry_started_at=NULL,free_entry_expires_at=NULL,
      free_entry_trigger_message_id=NULL WHERE id=${conversationId}
      AND free_entry_trigger_message_id=${id} AND free_entry_confirmed_at IS NULL`;
  }
}

export async function getConversationRecipient(conversationId: string) {
  const rows = await db()`SELECT contact.whatsapp_phone AS phone FROM conversations conversation JOIN contacts contact ON contact.id = conversation.contact_id WHERE conversation.id = ${conversationId} LIMIT 1`;
  return rows[0]?.phone as string | undefined;
}

export async function persistOutboundMessage(input: { conversationId: string; ycloudMessageId: string; body: string; sender: "HUMAN" | "AI"; payload: unknown; contentType?: string; mediaUrl?: string | null }) {
  await db().begin(async (tx) => {
    await tx`INSERT INTO messages (conversation_id, ycloud_message_id, direction, sender, content_type, body, media_url, status, provider_payload) VALUES (${input.conversationId}, ${input.ycloudMessageId}, 'OUTBOUND', ${input.sender}, ${input.contentType ?? "text"}, ${input.body}, ${input.mediaUrl ?? null}, 'ACCEPTED', ${JSON.stringify(input.payload)}::jsonb) ON CONFLICT (ycloud_message_id) DO NOTHING`;
    await tx`UPDATE conversations SET inbox_state = CASE WHEN automation_mode IN ('PAUSED','ESCALATED') THEN 'PENDING_REPLY'::inbox_state ELSE 'RESPONDED'::inbox_state END,
      last_outbound_at = now(), updated_at = now() WHERE id = ${input.conversationId}`;
    const startedAt = new Date();
    await tx`UPDATE conversations SET free_entry_started_at=${startedAt.toISOString()},
      free_entry_expires_at=${entryExpiry(startedAt).toISOString()},
      free_entry_trigger_message_id=${input.ycloudMessageId},free_entry_confirmed_at=NULL
      WHERE id=${input.conversationId} AND entry_source='META_AD'
        AND referral_at BETWEEN now()-interval '24 hours' AND now()
        AND (free_entry_expires_at IS NULL OR free_entry_expires_at<now())`;
  });
  // YCloud puede notificar el estado antes de que se guarde la respuesta del envío.
  const pending = await db()`SELECT payload->'whatsappMessage'->>'status' AS status,
    payload->'whatsappMessage'->>'errorMessage' AS error, payload
    FROM webhook_events WHERE event_type='whatsapp.message.updated'
      AND payload->'whatsappMessage'->>'id'=${input.ycloudMessageId}
    ORDER BY received_at ASC LIMIT 20`;
  for (const update of pending) if (["accepted", "sent", "delivered", "read", "failed"].includes(String(update.status)))
    await persistOutboundStatus({ id: input.ycloudMessageId, status: update.status as OutboundUpdate["status"],
      error: typeof update.error === "string" ? update.error : undefined, payload: update.payload });
  for (const update of pending) if (update.payload?.whatsappMessage) await recordWhatsappPricing(update.payload.whatsappMessage);
}

export async function listInbox(assignedUserId?: string) {
  return db()`
    SELECT
      conversation.id::text AS id,
      contact.id::text AS "contactId",
      COALESCE(contact.display_name, contact.whatsapp_phone) AS contact,
      '+' || contact.whatsapp_phone AS phone,
      contact.city,
      conversation.pipeline_stage AS stage,
      conversation.lead_level AS "leadLevel",
      conversation.last_inbound_at AS "lastInboundAt",
      conversation.entry_source AS "entrySource",
      conversation.referral_headline AS "referralHeadline",
      conversation.free_entry_expires_at AS "freeEntryExpiresAt",
      conversation.free_entry_confirmed_at AS "freeEntryConfirmedAt",
      conversation.automation_mode AS "automationMode",
      conversation.inbox_state AS state,
      owner.display_name AS owner,
      COALESCE(tags.items, ARRAY[]::text[]) AS tags,
      COALESCE(last_message.body, '') AS "lastMessage",
      conversation.updated_at AS "lastAt",
      COALESCE(unread.count, 0)::int AS unread
    FROM conversations conversation
    JOIN contacts contact ON contact.id = conversation.contact_id
    LEFT JOIN users owner ON owner.id = conversation.assigned_user_id
    LEFT JOIN LATERAL (
      SELECT message.body FROM messages message
      WHERE message.conversation_id = conversation.id
      ORDER BY message.created_at DESC LIMIT 1
    ) last_message ON TRUE
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(tag.name ORDER BY tag.name) AS items
      FROM conversation_tags conversation_tag JOIN tags tag ON tag.id = conversation_tag.tag_id
      WHERE conversation_tag.conversation_id = conversation.id
    ) tags ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS count FROM messages message
      WHERE message.conversation_id = conversation.id
        AND message.direction = 'INBOUND'
        AND message.created_at > COALESCE(conversation.operator_last_seen_at, to_timestamp(0))
    ) unread ON TRUE
    WHERE (${assignedUserId ?? null}::uuid IS NULL OR conversation.assigned_user_id=${assignedUserId ?? null}::uuid)
    ORDER BY conversation.updated_at DESC`;
}

export async function listConversationMessages(conversationId: string) {
  return db()`
    SELECT id::text AS id, direction, sender, body, content_type AS "contentType",
      CASE WHEN direction='INBOUND' AND content_type IN ('image','audio') AND media_url IS NOT NULL
        THEN '/api/media/' || id::text
        WHEN direction='INBOUND' THEN NULL ELSE media_url END AS "mediaUrl",
      status, error_detail AS "errorDetail", created_at AS "createdAt"
    FROM messages WHERE conversation_id = ${conversationId} ORDER BY created_at ASC, id ASC`;
}
