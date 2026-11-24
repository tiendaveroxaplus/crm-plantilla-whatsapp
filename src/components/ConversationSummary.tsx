"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Summary = { summary: string; keyPoints: string[]; nextStep: string; interest: string; updatedAt: string };
type State = { summary: Summary | null; stale: boolean; totalMessages: number };
const interestLabel: Record<string, string> = { alto: "Interés alto", medio: "Interés medio", bajo: "Interés bajo", sin_dato: "Sin dato" };

// Resumen de la conversación hecho por la IA: lo importante sin leer todo el historial.
export default function ConversationSummary({ conversationId }: { conversationId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autoTried = useRef(false);

  const generate = useCallback(async (force: boolean) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/conversations/${conversationId}/summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo generar el resumen.");
      setState(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo generar el resumen."); }
    finally { setBusy(false); }
  }, [conversationId]);

  useEffect(() => {
    let live = true;
    fetch(`/api/conversations/${conversationId}/summary`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: State | null) => {
        if (!live || !data) return;
        setState(data);
        // Se genera sola la primera vez o cuando hay varios mensajes nuevos; una sola vez por apertura.
        if (data.stale && !autoTried.current) { autoTried.current = true; void generate(false); }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [conversationId, generate]);

  const summary = state?.summary;
  return <section className="chat-summary" aria-label="Resumen de la conversación">
    <header><p>RESUMEN IA</p><button disabled={busy} onClick={() => void generate(true)}>{busy ? "Resumiendo…" : "Actualizar"}</button></header>
    {summary ? <>
      <div className="summary-meta"><span className={`summary-interest ${summary.interest}`}>{interestLabel[summary.interest] ?? "Sin dato"}</span><small>{new Date(summary.updatedAt).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}{state?.stale ? " · hay mensajes nuevos" : ""}</small></div>
      <p className="summary-text">{summary.summary}</p>
      {summary.keyPoints.length > 0 && <ul>{summary.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>}
      {summary.nextStep && <p className="summary-next"><b>Siguiente paso:</b> {summary.nextStep}</p>}
    </> : <p className="summary-empty">{busy ? "La IA está resumiendo la conversación…" : (state?.totalMessages ?? 0) < 2 ? "Aún hay muy pocos mensajes para resumir." : "Sin resumen todavía."}</p>}
    {error && <p className="summary-error" role="alert">{error}</p>}
  </section>;
}
