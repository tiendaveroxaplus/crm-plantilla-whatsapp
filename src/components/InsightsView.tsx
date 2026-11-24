"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import AppSidebar from "@/components/AppSidebar";

type Topic = { tema: string; menciones: number; ejemplo: string };
type Action = { conversationId: string; name: string; motivo: string; accion: string };
type Analysis = { resumen: string; pedidos: Topic[]; preguntas: Topic[]; objeciones: Topic[]; productos: Topic[]; oportunidades: Action[]; sinRespuesta: Action[]; recomendaciones: string[] };
type Stats = { messages: number; conversations: number; newContacts: number; adLeads: number; unanswered: number; paidSales: number; revenuePen: number };
type Slot = { slot: string; label: string; status: "FUTURE" | "CURRENT" | "DONE"; from: string; to: string; liveStats: Stats | null; insight: { analysis: Analysis; stats: Stats; generatedAt: string; messageCount: number } | null };
type Overview = { day: string; today: string; slots: Slot[] };

const statusLabel = { FUTURE: "Por llegar", CURRENT: "En curso", DONE: "Finalizado" } as const;
const pen = (value: number) => `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shiftDay = (day: string, delta: number) => new Date(Date.parse(`${day}T12:00:00-05:00`) + delta * 86400000).toISOString().slice(0, 10);

function TopicList({ title, items }: { title: string; items: Topic[] }) {
  if (!items.length) return null;
  return <div className="ins-block"><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}><b>{item.tema}</b> <span className="ins-count">×{item.menciones}</span>{item.ejemplo && <small>“{item.ejemplo}”</small>}</li>)}</ul></div>;
}

export default function InsightsView() {
  const [day, setDay] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [busySlot, setBusySlot] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const autoTried = useRef<Record<string, boolean>>({});

  const load = useCallback(async (target: string) => {
    const response = await fetch(`/api/insights${target ? `?day=${target}` : ""}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "No se pudo cargar el análisis.");
    setData(body as Overview);
    return body as Overview;
  }, []);

  const generate = useCallback(async (targetDay: string, slot: string, force: boolean) => {
    setBusySlot(slot); setError("");
    try {
      const response = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day: targetDay, slot, force }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo generar el análisis.");
      setData(body as Overview);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo generar el análisis."); }
    finally { setBusySlot(""); }
  }, []);

  useEffect(() => {
    let live = true;
    load(day).then(async (overview) => {
      if (!live) return;
      if (!day) setDay(overview.day);
      // Genera solos los cortes que ya empezaron y todavía no tienen análisis (uno a la vez, una sola vez por apertura).
      for (const slot of overview.slots) {
        const key = `${overview.day}-${slot.slot}`;
        if (live && slot.status !== "FUTURE" && !slot.insight && (slot.liveStats?.messages ?? 0) > 0 && !autoTried.current[key]) {
          autoTried.current[key] = true;
          await generate(overview.day, slot.slot, false);
        }
      }
    }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : "No se pudo cargar el análisis."); });
    return () => { live = false; };
  }, [day, load, generate]);

  async function createTask(item: Action, slotLabel: string) {
    setNotice(""); setError("");
    const response = await fetch(`/api/conversations/${item.conversationId}/workspace`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "task", note: `Análisis IA (${slotLabel}): ${item.accion || item.motivo}`.slice(0, 500), dueAt: new Date(Date.now() + 3600_000).toISOString(), priority: "HIGH" }) });
    if (!response.ok) { setError((await response.json().catch(() => ({}))).error || "No se pudo crear el seguimiento."); return; }
    setNotice(`Seguimiento creado para ${item.name}. Lo verás en Seguimientos.`);
    try { new BroadcastChannel("crm-updates").postMessage("tasks"); } catch { /* sin soporte */ }
  }

  const current = data?.day ?? day;
  const isToday = data ? data.day === data.today : true;

  return <main className="app-shell"><AppSidebar />
    <section className="crm-page">
      <header className="module-head"><div><p>INTELIGENCIA</p><h1>Análisis IA</h1><span>Lo que piden tus clientes, sus preguntas y objeciones, y a quién atender: en tres cortes del día.</span></div>
        <div className="ins-nav"><button onClick={() => setDay(shiftDay(current, -1))} aria-label="Día anterior">←</button><b>{current ? new Date(`${current}T12:00:00-05:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }) : "…"}</b><button disabled={isToday} onClick={() => setDay(shiftDay(current, 1))} aria-label="Día siguiente">→</button></div></header>
      {error && <p className="send-error" role="alert">{error}</p>}
      {notice && <p className="contact-feedback" role="status">{notice}</p>}
      {!data && !error && <p>Cargando análisis…</p>}
      <div className="ins-grid">
        {data?.slots.map((slot) => {
          const stats = slot.insight?.stats ?? slot.liveStats;
          const analysis = slot.insight?.analysis;
          return <article key={slot.slot} className={`ins-card ${slot.status.toLowerCase()}`}>
            <header><div><h2>{slot.label}</h2><span className={`ins-status ${slot.status.toLowerCase()}`}>{statusLabel[slot.status]}</span></div>
              {slot.status !== "FUTURE" && <button disabled={busySlot === slot.slot} onClick={() => void generate(data.day, slot.slot, true)}>{busySlot === slot.slot ? "Analizando…" : slot.insight ? "Actualizar" : "Analizar"}</button>}</header>
            {stats && <div className="ins-stats"><span><b>{stats.messages}</b> mensajes</span><span><b>{stats.conversations}</b> chats</span><span><b>{stats.adLeads}</b> de anuncios</span><span className={stats.unanswered ? "warn" : ""}><b>{stats.unanswered}</b> sin responder</span><span><b>{stats.paidSales}</b> ventas · {pen(stats.revenuePen)}</span></div>}
            {slot.status === "FUTURE" && <p className="ins-empty">Este corte empieza a las {new Date(slot.from).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" })}.</p>}
            {slot.status !== "FUTURE" && !analysis && <p className="ins-empty">{busySlot === slot.slot ? "La IA está analizando los mensajes…" : (stats?.messages ?? 0) === 0 ? "No hubo mensajes de clientes en este corte." : "Sin análisis todavía."}</p>}
            {analysis && <>
              <p className="ins-summary">{analysis.resumen}</p>
              <TopicList title="Lo que más piden" items={analysis.pedidos} />
              <TopicList title="Preguntas frecuentes" items={analysis.preguntas} />
              <TopicList title="Objeciones y dudas" items={analysis.objeciones} />
              <TopicList title="Productos mencionados" items={analysis.productos} />
              {analysis.oportunidades.length > 0 && <div className="ins-block"><h4>Oportunidades para accionar</h4>{analysis.oportunidades.map((item, index) => <div className="ins-action" key={index}><div><b>{item.name}</b><small>{item.motivo}</small>{item.accion && <small className="next">→ {item.accion}</small>}</div><div className="ins-buttons"><a href={`/?conversation=${encodeURIComponent(item.conversationId)}`}>Abrir chat</a><button onClick={() => void createTask(item, slot.label)}>Crear seguimiento</button></div></div>)}</div>}
              {analysis.sinRespuesta.length > 0 && <div className="ins-block"><h4>Quedaron sin respuesta</h4>{analysis.sinRespuesta.map((item, index) => <div className="ins-action" key={index}><div><b>{item.name}</b><small>{item.motivo}</small>{item.accion && <small className="next">→ {item.accion}</small>}</div><div className="ins-buttons"><a href={`/?conversation=${encodeURIComponent(item.conversationId)}`}>Abrir chat</a><button onClick={() => void createTask(item, slot.label)}>Crear seguimiento</button></div></div>)}</div>}
              {analysis.recomendaciones.length > 0 && <div className="ins-block"><h4>Recomendaciones</h4><ul>{analysis.recomendaciones.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
              <small className="ins-foot">Analizado {new Date(slot.insight!.generatedAt).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })} · {slot.insight!.messageCount} mensajes</small>
            </>}
          </article>;
        })}
      </div>
    </section></main>;
}
