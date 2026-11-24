import { db } from "@/lib/database";
import { createGeminiReply, isAiTestPhone } from "@/lib/ai";
import { persistAiUsage, persistOutboundMessage, recordAgentMilestones } from "@/lib/conversations";
import { sendYcloudImage, sendYcloudText } from "@/lib/ycloud";
import { requestedProductAsset } from "@/lib/product-intent";
import { escalationFollowup } from "@/lib/escalation-followup";
import { isFreshCommercialIntent, isIndependentQuestion } from "@/lib/agent-context";

type ClaimedJob = { conversationId: string; generation: number; handledThrough: string };

async function claimJob(): Promise<ClaimedJob | null> {
  return db().begin(async (tx) => {
    const rows = await tx`SELECT conversation_id AS "conversationId", generation, handled_through AS "handledThrough"
      FROM ai_response_jobs WHERE
      (status='PENDING' AND due_at <= now()) OR
      (status='PROCESSING' AND claimed_at < now() - interval '2 minutes')
      ORDER BY due_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!rows.length) return null;
    const job = rows[0];
    await tx`UPDATE ai_response_jobs SET status='PROCESSING', claimed_at=now(), attempts=attempts+1, updated_at=now()
      WHERE conversation_id=${job.conversationId}`;
    return { conversationId: String(job.conversationId), generation: Number(job.generation), handledThrough: new Date(job.handledThrough).toISOString() };
  });
}

async function stillCurrent(job: ClaimedJob) {
  const rows = await db()`SELECT job.generation, job.status, conversation.automation_mode AS mode,
    contact.whatsapp_phone AS phone FROM ai_response_jobs job
    JOIN conversations conversation ON conversation.id=job.conversation_id
    JOIN contacts contact ON contact.id=conversation.contact_id WHERE job.conversation_id=${job.conversationId}`;
  return rows[0] && Number(rows[0].generation) === job.generation && rows[0].status === "PROCESSING" &&
    ["AI", "ESCALATED"].includes(String(rows[0].mode)) && isAiTestPhone(String(rows[0].phone))
      ? { phone: String(rows[0].phone), mode: String(rows[0].mode) } : null;
}

// Espera (como máximo maxMs) a que WhatsApp confirme la entrega o el fallo de un mensaje enviado.
async function waitForDelivery(ycloudId: string, maxMs: number) {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const rows = await db()`SELECT status FROM messages WHERE ycloud_message_id=${ycloudId} LIMIT 1`;
    const status = String(rows[0]?.status ?? "");
    if (["DELIVERED", "READ", "FAILED"].includes(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return "TIMEOUT";
}

async function finish(job: ClaimedJob, lastInbound: Date) {
  await db()`UPDATE ai_response_jobs SET status='IDLE', claimed_at=NULL, handled_through=${lastInbound.toISOString()},
    last_error=NULL, updated_at=now() WHERE conversation_id=${job.conversationId} AND generation=${job.generation} AND status='PROCESSING'`;
}

async function handoffToAdvisor(job: ClaimedJob, lastInbound: Date, reason: "COMPLAINT" | "UNANSWERED" | "AUDIO_UNCLEAR" | "PROCESSING_ERROR") {
  const notes = {
    COMPLAINT: "Reclamo del cliente: revisar la conversación y responder por este chat.",
    UNANSWERED: "Consulta sin información aprobada: un asesor debe confirmar y responder por este chat.",
    AUDIO_UNCLEAR: "Audio no comprendido tras un nuevo intento: revisar y contactar al cliente.",
    PROCESSING_ERROR: "La IA no pudo procesar el mensaje tras varios intentos: revisar y responder al cliente.",
  };
  return db().begin(async (tx) => {
    const updated = await tx`UPDATE conversations SET automation_mode='ESCALATED', inbox_state='PENDING_REPLY', updated_at=now()
      WHERE id=${job.conversationId} AND automation_mode='AI' RETURNING id`;
    if (!updated.length) return false;
    await tx`UPDATE ai_response_jobs SET generation=generation+1, status='IDLE', claimed_at=NULL,
      handled_through=GREATEST(handled_through,${lastInbound.toISOString()}::timestamptz), updated_at=now()
      WHERE conversation_id=${job.conversationId} AND generation=${job.generation}`;
    await tx`INSERT INTO follow_up_tasks(conversation_id,due_at,priority,note)
      VALUES (${job.conversationId},now(),'HIGH',${notes[reason]})`;
    await tx`INSERT INTO crm_audit_log(conversation_id,action,details,actor_name)
      VALUES (${job.conversationId},'AI_HANDOFF',${JSON.stringify({ reason })}::jsonb,'Asistente IA')`;
    return true;
  });
}

export async function processNextAiJob() {
  const job = await claimJob();
  if (!job) return false;
  let sentAny = false;
  let handledAt: Date | null = null;
  let imageError: string | null = null;
  try {
    const current = await stillCurrent(job);
    if (!current) { await finish(job, new Date(job.handledThrough)); return true; }
    const phone = current.phone;
    const inbound = await db()`SELECT id::text AS id, body, content_type AS "contentType", media_url AS "mediaUrl",
      provider_payload AS "providerPayload", created_at AS "createdAt" FROM messages
      WHERE conversation_id=${job.conversationId} AND direction='INBOUND' AND created_at > ${job.handledThrough}::timestamptz
      ORDER BY created_at ASC, id ASC LIMIT 21`;
    if (!inbound.length) { await finish(job, new Date(job.handledThrough)); return true; }
    const hasMore = inbound.length > 20;
    if (hasMore) inbound.pop();
    const latest = inbound[inbound.length - 1];
    const lastInbound = new Date(latest.createdAt);
    handledAt = lastInbound;
    const batch = inbound.map((item) => String(item.body ?? "")).join("\n");
    const catalogTitles = current.mode === "ESCALATED" ? await db()`SELECT title FROM knowledge_entries WHERE status='APPROVED' AND category='PRODUCTO'` : [];
    const hasIncomingMedia = inbound.some((item) => ["audio", "image"].includes(String(item.contentType)));
    const newCommercialTopic = current.mode === "ESCALATED" &&
      (hasIncomingMedia || isFreshCommercialIntent(batch, catalogTitles.map((item) => String(item.title))) || isIndependentQuestion(batch));
    if (current.mode === "ESCALATED" && !newCommercialTopic) {
      const previous = await db()`SELECT body FROM messages WHERE conversation_id=${job.conversationId}
        AND sender='AI' AND content_type='text' ORDER BY created_at DESC LIMIT 10`;
      const previousReply = String(previous[0]?.body ?? "");
      const body = escalationFollowup(batch, previous.some((item) => /número de pedido/i.test(String(item.body ?? ""))), previousReply);
      if (body && (await stillCurrent(job))?.mode === "ESCALATED") {
        const sent = await sendYcloudText({ to: phone, body });
        sentAny = true;
        await persistOutboundMessage({ conversationId: job.conversationId, ycloudMessageId: sent.id, body, sender: "AI", payload: sent.payload });
      }
      await finish(job, lastInbound);
      if (hasMore) await db()`UPDATE ai_response_jobs SET status='PENDING', due_at=now()+interval '2 seconds', updated_at=now()
        WHERE conversation_id=${job.conversationId} AND generation=${job.generation} AND status='IDLE'`;
      return true;
    }
    const media = inbound.filter((item) => ["audio", "image"].includes(String(item.contentType))).slice(-2)
      .map((item) => ({ id: String(item.id), url: String(item.mediaUrl ?? ""), type: String(item.contentType), mimeType: String(item.providerPayload?.whatsappInboundMessage?.[item.contentType]?.mime_type ?? "") }));
    // "¿Esto tienes?" puede llegar después de la foto, en un lote distinto.
    if (!media.some((item) => item.type === "image") && /\b(esto tienes|tienen esto|esta foto|esta imagen|este producto)\b/i.test(batch)) {
      const previousImage = await db()`SELECT media_url AS "mediaUrl", provider_payload AS "providerPayload" FROM messages
        WHERE conversation_id=${job.conversationId} AND direction='INBOUND' AND content_type='image'
          AND created_at > now()-interval '10 minutes' ORDER BY created_at DESC LIMIT 1`;
      if (previousImage[0]) media.push({ id: "", url: String(previousImage[0].mediaUrl ?? ""), type: "image",
        mimeType: String(previousImage[0].providerPayload?.whatsappInboundMessage?.image?.mime_type ?? "") });
    }
    const priorAi = await db()`SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id=${job.conversationId} AND sender='AI'`;
    const reply = await createGeminiReply({ customerMessage: batch, conversationId: job.conversationId,
      media, firstReply: Number(priorAi[0].count) === 0, serviceCaseOpen: current.mode === "ESCALATED" });
    if (reply.usedModel) await persistAiUsage({ conversationId: job.conversationId, model: reply.model, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens });
    if (!await stillCurrent(job)) return true;
    if (reply.interestProduct || reply.purchaseIntent) await recordAgentMilestones({ conversationId: job.conversationId,
      sourceMessageId: String(latest.id), interestProduct: reply.interestProduct, purchaseIntent: reply.purchaseIntent });
    if (reply.handoffReason) {
      if (current.mode === "AI" && !await handoffToAdvisor(job, lastInbound, reply.handoffReason)) return true;
      const body = reply.messages.join(" ").trim();
      const sent = await sendYcloudText({ to: phone, body });
      sentAny = true;
      await persistOutboundMessage({ conversationId: job.conversationId, ycloudMessageId: sent.id, body, sender: "AI", payload: sent.payload });
      if (current.mode === "ESCALATED") await finish(job, lastInbound);
      return true;
    }
    if (reply.imageRequested) {
      if (!await stillCurrent(job)) return true;
      const previousText = await db()`SELECT body FROM messages WHERE conversation_id=${job.conversationId}
        AND sender='AI' AND content_type='text' ORDER BY created_at DESC LIMIT 1`;
      const explicitImageRequest = requestedProductAsset(batch, String(previousText[0]?.body ?? ""));
      const recentImage = reply.productTitle ? await db()`SELECT id FROM messages WHERE conversation_id=${job.conversationId}
        AND sender='AI' AND content_type='image' AND body=${`Imagen de ${reply.productTitle}`}
        AND status IS DISTINCT FROM 'FAILED' AND created_at > now()-interval '30 minutes' LIMIT 1` : [];
      const sendImage = explicitImageRequest || !recentImage.length;
      const detail = reply.messages.join(" ").trim();
      if (detail && await stillCurrent(job)) {
        const sent = await sendYcloudText({ to: phone, body: detail });
        sentAny = true;
        await persistOutboundMessage({ conversationId: job.conversationId, ycloudMessageId: sent.id, body: detail, sender: "AI", payload: sent.payload });
      }
      if (sendImage) await new Promise((resolve) => setTimeout(resolve, 1200));
      const products = reply.productTitle ? await db()`SELECT media_url AS "mediaUrl" FROM knowledge_entries
        WHERE status='APPROVED' AND title=${reply.productTitle} AND media_url IS NOT NULL LIMIT 1` : [];
      const mediaUrl = String(products[0]?.mediaUrl ?? "");
      if (sendImage && !mediaUrl) imageError = "No se encontró una imagen aprobada para el producto solicitado.";
      else if (sendImage && await stillCurrent(job)) {
          let outbound: Awaited<ReturnType<typeof sendYcloudImage>> | null = null;
          try {
            const appUrl = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
            const link = new URL(mediaUrl, appUrl ? `${appUrl}/` : undefined);
            if (link.protocol !== "https:") throw new Error("La imagen requiere una URL pública HTTPS.");
            if (mediaUrl.startsWith("/")) {
              const check = await fetch(link, { method: "HEAD", signal: AbortSignal.timeout(8000) });
              if (!check.ok || !check.headers.get("content-type")?.startsWith("image/"))
                throw new Error(`La imagen pública no está disponible (HTTP ${check.status}).`);
            }
            outbound = await sendYcloudImage({ to: phone, link: link.toString(), caption: reply.productTitle ?? undefined });
          } catch (error) {
            imageError = error instanceof Error ? error.message : "No se pudo enviar la imagen.";
          }
          if (outbound) {
            sentAny = true;
            await persistOutboundMessage({ conversationId: job.conversationId, ycloudMessageId: outbound.id,
              body: `Imagen de ${reply.productTitle}`, sender: "AI", contentType: "image", mediaUrl, payload: outbound.payload });
            // La foto tarda más que el texto en entregarse: se espera su entrega antes de seguir para que el cliente la reciba en orden.
            let imageStatus = await waitForDelivery(outbound.id, 25000);
            if (imageStatus === "FAILED" && await stillCurrent(job)) {
              // WhatsApp a veces no alcanza a descargar la foto a tiempo: se reintenta una vez.
              try {
                const retry = await sendYcloudImage({ to: phone, link: new URL(mediaUrl, `${(process.env.APP_BASE_URL ?? "").replace(/\/$/, "")}/`).toString(), caption: reply.productTitle ?? undefined });
                await persistOutboundMessage({ conversationId: job.conversationId, ycloudMessageId: retry.id,
                  body: `Imagen de ${reply.productTitle}`, sender: "AI", contentType: "image", mediaUrl, payload: retry.payload });
                imageStatus = await waitForDelivery(retry.id, 20000);
              } catch { /* Se informa abajo con el cierre de error. */ }
              if (imageStatus === "FAILED") imageError = "WhatsApp no pudo descargar la imagen (reintentada una vez).";
            }
          }
      }
      // Cierre suave y sin repetir la misma pregunta de cantidad/distrito.
      const recentAi = await db()`SELECT body FROM messages WHERE conversation_id=${job.conversationId}
        AND sender='AI' AND content_type='text' ORDER BY created_at DESC LIMIT 8`;
      const askedQuantity = recentAi.some((item) => /cu[aá]ntos|en qu[eé] distrito/i.test(String(item.body ?? "")));
      const closing = imageError
        ? "No pude adjuntar la imagen ahora 🙏 ¿Quieres que un asesor la revise contigo?"
        : reply.purchaseIntent
          ? (askedQuantity ? "¿Quieres que un asesor te confirme disponibilidad y entrega? 😊" : "¡Perfecto! 💛 Para avanzar, cuéntame: ¿cuántos quieres y en qué distrito te encuentras? Un asesor confirmará disponibilidad, pago y entrega 📦")
          : "¿Qué te parece? 😊 Si quieres, te cuento de otros productos o te ayudo con tu pedido cuando gustes 💛";
      if (await stillCurrent(job)) {
        if (sendImage) await new Promise((resolve) => setTimeout(resolve, 1200));
        const sent = await sendYcloudText({ to: phone, body: closing });
        sentAny = true;
        await persistOutboundMessage({ conversationId: job.conversationId, ycloudMessageId: sent.id, body: closing, sender: "AI", payload: sent.payload });
      }
    } else {
      const previous = await db()`SELECT body, created_at AS "createdAt" FROM messages WHERE conversation_id=${job.conversationId} AND sender='AI'
        AND content_type='text' ORDER BY created_at DESC LIMIT 1`;
      const candidate = reply.messages.join(" ").trim();
      const previousAt = new Date(previous[0]?.createdAt ?? 0);
      const repeatedRecently = candidate === String(previous[0]?.body ?? "").trim() && Date.now() - previousAt.getTime() < 5 * 60_000;
      if (candidate && previousAt < lastInbound && !repeatedRecently && await stillCurrent(job)) {
        const sent = await sendYcloudText({ to: phone, body: candidate });
        sentAny = true;
        await persistOutboundMessage({ conversationId: job.conversationId, ycloudMessageId: sent.id, body: candidate, sender: "AI", payload: sent.payload });
      }
    }
    await finish(job, lastInbound);
    if (hasMore) await db()`UPDATE ai_response_jobs SET status='PENDING', due_at=now()+interval '2 seconds', updated_at=now()
      WHERE conversation_id=${job.conversationId} AND generation=${job.generation} AND status='IDLE'`;
    if (imageError) await db()`UPDATE ai_response_jobs SET last_error=${imageError.slice(0, 300)}
      WHERE conversation_id=${job.conversationId} AND generation=${job.generation}`;
    if (sentAny) await db()`UPDATE ai_response_jobs SET handled_through=GREATEST(handled_through,${lastInbound.toISOString()}::timestamptz)
      WHERE conversation_id=${job.conversationId} AND generation>${job.generation}`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Error desconocido";
    const handledIso = handledAt?.toISOString() ?? job.handledThrough;
    const failedJob = await db()`UPDATE ai_response_jobs SET status=CASE WHEN ${sentAny} OR attempts >= 3 THEN 'IDLE' ELSE 'PENDING' END,
      due_at=now()+interval '30 seconds', claimed_at=NULL,
      handled_through=CASE WHEN ${sentAny} THEN GREATEST(handled_through,${handledIso}::timestamptz) ELSE handled_through END,
      last_error=${reason.slice(0, 300)}, updated_at=now()
      WHERE conversation_id=${job.conversationId} AND generation=${job.generation} AND status='PROCESSING'
      RETURNING attempts`;
    if (sentAny && handledAt) await db()`UPDATE ai_response_jobs SET handled_through=GREATEST(handled_through,${handledAt.toISOString()}::timestamptz)
      WHERE conversation_id=${job.conversationId} AND generation>${job.generation}`;
    console.error("[ai-job] Falló la respuesta:", reason.slice(0, 300));
    if (!sentAny && Number(failedJob[0]?.attempts ?? 0) >= 3 && await handoffToAdvisor(job, new Date(handledIso), "PROCESSING_ERROR")) {
      try {
        const rows = await db()`SELECT contact.whatsapp_phone AS phone FROM conversations conversation
          JOIN contacts contact ON contact.id=conversation.contact_id WHERE conversation.id=${job.conversationId}`;
        const fallbackPhone = String(rows[0]?.phone ?? "");
        if (isAiTestPhone(fallbackPhone)) {
          const body = "No pude procesar tu consulta con seguridad. He señalado este chat para que un asesor te responda. ¿Puedes dejarme algún detalle adicional?";
          const sent = await sendYcloudText({ to: fallbackPhone, body });
          await persistOutboundMessage({ conversationId: job.conversationId, ycloudMessageId: sent.id, body, sender: "AI", payload: sent.payload });
        }
      } catch (handoffError) {
        console.error("[ai-job] No se pudo notificar la derivación:", handoffError instanceof Error ? handoffError.message.slice(0, 200) : "error desconocido");
      }
    }
  }
  return true;
}
