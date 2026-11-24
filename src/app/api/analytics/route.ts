import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/database";
import { FREE_SERVICE_ALLOWANCE, PERU_SERVICE_REFERENCE_USD, serviceAllowance } from "@/lib/whatsapp-pricing";
import { getSession } from "@/lib/auth";

function dateParam(value: string | null, fallback: Date) {
  if (!value) return fallback.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

export async function GET(request: NextRequest) {
  const user = await getSession(request);
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "El dashboard global está disponible solo para administradores." }, { status: 403 });
  const to = dateParam(request.nextUrl.searchParams.get("to"), new Date());
  const from = dateParam(request.nextUrl.searchParams.get("from"), new Date(Date.now() - 29 * 86400000));
  if (new Date(from) > new Date(to)) return NextResponse.json({ error: "La fecha inicial debe ser anterior a la final." }, { status: 400 });
  const sql = db();
  const businessPhone = (process.env.YCLOUD_WHATSAPP_NUMBER || "").replace(/\D/g, "");
  const [contacts, summary, funnel, delivery, actions, usage, communication, sales, sync, leadSources, activeWindows, windowLeads, pricing] = await Promise.all([
    sql`SELECT COUNT(*) FILTER (WHERE created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS "newContacts", COUNT(*)::int AS "totalContacts" FROM contacts`,
    sql`SELECT
      COUNT(*) FILTER (WHERE updated_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS managed,
      COUNT(*) FILTER (WHERE last_outbound_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS responded,
      COUNT(*) FILTER (WHERE lead_level IN ('POTENTIAL','HOT','PAYMENT_PENDING') AND updated_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS potential,
      COUNT(*) FILTER (WHERE lead_level='HOT' AND updated_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS hot,
      COUNT(*) FILTER (WHERE lead_level='WON')::int AS "wonStages"
      FROM conversations`,
    sql`WITH stages(label, position) AS (
      VALUES ('NEW', 1), ('INTERESTED', 2), ('POTENTIAL', 3), ('HOT', 4),
             ('PAYMENT_PENDING', 5), ('WON', 6), ('LOST', 7)
    )
    SELECT stages.label, COALESCE(COUNT(conversation.id), 0)::int AS value
    FROM stages
    LEFT JOIN conversations conversation ON conversation.lead_level = stages.label
      AND conversation.created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
    GROUP BY stages.label, stages.position
    ORDER BY stages.position`,
    sql`WITH statuses(label, position) AS (
      VALUES ('ACCEPTED', 1), ('SENT', 2), ('DELIVERED', 3), ('READ', 4), ('FAILED', 5)
    )
    SELECT statuses.label, COALESCE(COUNT(message.id), 0)::int AS value
    FROM statuses
    LEFT JOIN messages message ON message.status = statuses.label::message_status
      AND message.direction='OUTBOUND'
      AND message.created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
    GROUP BY statuses.label, statuses.position
    ORDER BY statuses.position`,
    sql`SELECT COUNT(*) FILTER (WHERE unread.count>0)::int AS unread,
      COUNT(*) FILTER (WHERE conversation.inbox_state='PENDING_REPLY')::int AS pending,
      COUNT(*) FILTER (WHERE conversation.lead_level IN ('HOT','PAYMENT_PENDING'))::int AS followups
      FROM conversations conversation
      LEFT JOIN LATERAL (SELECT COUNT(*) AS count FROM messages message
        WHERE message.conversation_id=conversation.id AND message.direction='INBOUND'
          AND message.created_at>COALESCE(conversation.operator_last_seen_at,to_timestamp(0))) unread ON TRUE`,
    sql`SELECT COALESCE(SUM(input_tokens),0)::int AS input, COALESCE(SUM(output_tokens),0)::int AS output, COALESCE(SUM(cost_usd),0)::float AS cost, COUNT(*)::int AS requests,
      (SELECT COUNT(*) FROM messages WHERE sender='AI' AND direction='OUTBOUND' AND created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS replies FROM ai_usage WHERE created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz`,
    sql`WITH active AS (
      SELECT DISTINCT conversation_id FROM messages WHERE created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
    ), first_outbound AS (
      SELECT conversation_id, MIN(created_at) AS sent_at FROM messages WHERE direction='OUTBOUND' AND created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz GROUP BY conversation_id
    ), first_customer_reply AS (
      SELECT outbound.conversation_id, MIN(message.created_at) AS replied_at FROM first_outbound outbound JOIN messages message ON message.conversation_id=outbound.conversation_id AND message.direction='INBOUND' AND message.created_at > outbound.sent_at GROUP BY outbound.conversation_id
    ), first_agent_reply AS (
      SELECT inbound.conversation_id, AVG(EXTRACT(EPOCH FROM (outbound.sent_at - inbound.received_at))) AS seconds FROM (
        SELECT conversation_id, MIN(created_at) AS received_at FROM messages WHERE direction='INBOUND' AND created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz GROUP BY conversation_id
      ) inbound JOIN LATERAL (
        SELECT created_at AS sent_at FROM messages WHERE conversation_id=inbound.conversation_id AND direction='OUTBOUND' AND created_at > inbound.received_at ORDER BY created_at LIMIT 1
      ) outbound ON TRUE GROUP BY inbound.conversation_id
    ) SELECT
      (SELECT COUNT(*) FROM messages WHERE created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS "totalMessages",
      (SELECT COUNT(*) FROM active)::int AS "activeClients",
      COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (reply.replied_at - sent.sent_at))) FROM first_outbound sent JOIN first_customer_reply reply USING (conversation_id)),0)::float AS "customerFirstReplySeconds",
      COALESCE((SELECT AVG(seconds) FROM first_agent_reply),0)::float AS "agentFirstReplySeconds",
      COALESCE((SELECT COUNT(*) FROM first_customer_reply)::float / NULLIF((SELECT COUNT(*) FROM first_outbound),0),0)::float AS "customerReplyRate"`,
    sql`SELECT
      COUNT(*) FILTER (WHERE status='PAID' AND paid_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS won,
      COALESCE(SUM(total_pen) FILTER (WHERE status='PAID' AND paid_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz),0)::float AS "revenuePen",
      COUNT(*) FILTER (WHERE status='PAID' AND closed_by='AI' AND paid_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS "aiSales",
      COUNT(*) FILTER (WHERE status='PAID' AND closed_by='HUMAN' AND paid_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS "humanSales",
      COUNT(*) FILTER (WHERE status='PAID' AND closed_by='UNKNOWN' AND paid_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS "unattributedSales",
      COALESCE(SUM(total_pen) FILTER (WHERE status='PAID' AND closed_by='AI' AND paid_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz),0)::float AS "aiRevenuePen",
      COALESCE(SUM(total_pen) FILTER (WHERE status='PAID' AND closed_by='HUMAN' AND paid_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz),0)::float AS "humanRevenuePen",
      COUNT(*) FILTER (WHERE status='PENDING' AND created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS "pendingOrders"
      FROM sales_orders`,
    sql`SELECT MAX(received_at) AS "lastWebhookAt",
      COUNT(*) FILTER (WHERE event_type='whatsapp.inbound_message.received' AND received_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS "inboundEvents",
      COUNT(*) FILTER (WHERE processing_error IS NOT NULL AND received_at >= now()-interval '24 hours')::int AS "errorsLast24h"
      FROM webhook_events`,
    sql`SELECT COUNT(*) FILTER (WHERE entry_source='META_AD' AND referral_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS ads,
      COUNT(*) FILTER (WHERE entry_source='META_POST' AND referral_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS posts,
      COUNT(*) FILTER (WHERE entry_source='META_ENTRY_UNSPECIFIED' AND free_entry_confirmed_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz)::int AS unspecified
      FROM conversations`,
    sql`SELECT COUNT(*) FILTER (WHERE free_entry_expires_at>now())::int AS active,
      COUNT(*) FILTER (WHERE free_entry_expires_at>now() AND free_entry_expires_at<=now()+interval '24 hours')::int AS expiringSoon,
      COUNT(*) FILTER (WHERE free_entry_expires_at>now() AND free_entry_confirmed_at IS NOT NULL)::int AS confirmed
      FROM conversations`,
    sql`SELECT conversation.id::text AS id,COALESCE(contact.display_name,contact.whatsapp_phone) AS name,
      conversation.entry_source AS source,conversation.referral_headline AS headline,
      conversation.free_entry_expires_at AS "expiresAt",conversation.free_entry_confirmed_at IS NOT NULL AS confirmed
      FROM conversations conversation JOIN contacts contact ON contact.id=conversation.contact_id
      WHERE conversation.free_entry_expires_at>now()
      ORDER BY conversation.free_entry_expires_at ASC LIMIT 8`,
    sql`SELECT COUNT(*) FILTER (WHERE pricing_type='free_customer_service' AND pricing_category='service')::int AS "freeService",
      COUNT(*) FILTER (WHERE pricing_type='regular' AND pricing_category='service' AND amount>0)::int AS "paidService",
      COUNT(*) FILTER (WHERE pricing_type='regular' AND (amount IS NULL OR amount=0))::int AS unpriced,
      COUNT(*) FILTER (WHERE pricing_type='free_entry_point')::int AS "freeEntryMessages",
      COUNT(*) FILTER (WHERE pricing_type IS NULL OR pricing_category IS NULL)::int AS "unclassified",
      COUNT(*) FILTER (WHERE pricing_type='regular' AND amount>0 AND (currency IS NULL OR currency NOT IN ('USD','PEN')))::int AS "otherCurrencyCount",
      COALESCE(SUM(amount) FILTER (WHERE pricing_type='regular' AND currency='USD'),0)::float AS "costUsd",
      COALESCE(SUM(amount) FILTER (WHERE pricing_type='regular' AND currency='PEN'),0)::float AS "costPen",
      COALESCE(SUM(amount) FILTER (WHERE pricing_type='regular' AND pricing_category='service' AND currency='USD'),0)::float AS "serviceCostUsd"
      FROM whatsapp_message_pricing WHERE business_phone=${businessPhone}
        AND delivered_at >= (date_trunc('month',now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima')
        AND delivered_at < ((date_trunc('month',now() AT TIME ZONE 'America/Lima')+interval '1 month') AT TIME ZONE 'America/Lima')`,
  ]);
  const exchangeRate = Number(process.env.USD_TO_PEN_EXCHANGE_RATE ?? 3.3665);
  const activity = communication[0];
  const usageTotals = usage[0];
  // El costo se calcula al consultar con las tarifas actuales: así también cuentan las respuestas anteriores a configurar las tarifas.
  const inputRate = Number(process.env.GOOGLE_AI_INPUT_COST_PER_MILLION ?? 0);
  const outputRate = Number(process.env.GOOGLE_AI_OUTPUT_COST_PER_MILLION ?? 0);
  const costUsd = Number(usageTotals.input) * inputRate / 1_000_000 + Number(usageTotals.output) * outputRate / 1_000_000;
  return NextResponse.json({
    range: { from, to },
    summary: { ...contacts[0], ...summary[0], ...sales[0] },
    funnel,
    delivery,
    actions: actions[0],
    usage: { ...usageTotals, costUsd, costPen: costUsd * exchangeRate, exchangeRate, ratesConfigured: inputRate > 0 && outputRate > 0 },
    synchronization: { database: "ok", ycloudConfigured: Boolean(process.env.YCLOUD_API_KEY && process.env.YCLOUD_WHATSAPP_NUMBER && process.env.YCLOUD_WEBHOOK_SECRET), ...sync[0] },
    whatsapp: {
      allowance: { limit: FREE_SERVICE_ALLOWANCE, ...serviceAllowance(Number(pricing[0].freeService)) },
      pricing: pricing[0], sources: leadSources[0], windows: activeWindows[0], leads: windowLeads,
      businessPhoneLastFour: businessPhone.slice(-4), referenceServiceRatePeruUsd: PERU_SERVICE_REFERENCE_USD,
      timezone: "America/Lima",
    },
    communication: { ...activity, averageMessagesPerClient: Number(activity.activeClients) ? Number(activity.totalMessages) / Number(activity.activeClients) : 0 },
  });
}
