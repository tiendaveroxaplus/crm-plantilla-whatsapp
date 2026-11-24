"use client";
import { useEffect, useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import { formatLeft } from "@/lib/lead-score";

type Data = {
  totals: { leads: number; neverAnswered: number; revenuePen: number; sales: number };
  temperature: Record<string, number>; windows: { open: number; closing: number; closed: number };
  ads: Array<{ headline: string; sourceId: string | null; source: string; leads: number; hot: number; sales: number; revenuePen: number }>;
  attend: Array<{ id: string; name: string; city?: string | null; level: string; reason: string; headline?: string | null; msLeft: number; closing: boolean; waitingReply: boolean }>;
};
const pen = (value: number) => `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const levelName: Record<string, string> = { HOT: "Listo para comprar", POTENTIAL: "Potencial", INTERESTED: "Interesado", NEW: "Nuevo", PAYMENT_PENDING: "Pago pendiente" };
const rows: Array<[string, string, string]> = [["HOT", "Listos para comprar", "t-hot"], ["POTENTIAL", "Potenciales", ""], ["INTERESTED", "Interesados", "t-int"], ["NEW", "Nuevos", "t-new"]];

export default function CampaignsView() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState<Data>();
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      const to = new Date(); const from = new Date(Date.now() - (Number(days) - 1) * 86400000); from.setHours(0, 0, 0, 0);
      fetch(`/api/campaigns?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { cache: "no-store" })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "No se pudo cargar."); return body as Data; })
        .then((body) => { if (live) { setData(body); setError(""); } })
        .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : "No se pudo cargar."); });
    };
    load(); const timer = window.setInterval(load, 30000);
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel("crm-updates"); channel.onmessage = () => load(); } catch { /* sin soporte */ }
    return () => { live = false; window.clearInterval(timer); channel?.close(); };
  }, [days]);
  const max = Math.max(1, ...Object.values(data?.temperature ?? { x: 1 }));
  return <main className="app-shell"><AppSidebar />
    <section className="crm-page">
      <header className="module-head"><div><p>FACEBOOK E INSTAGRAM</p><h1>Campañas Meta</h1><span>Quién llegó de tus anuncios, qué tan listo está para comprar y a quién atender antes de que se cierre su ventana de 24 h.</span></div>
        <select value={days} onChange={(event) => setDays(event.target.value)} aria-label="Periodo" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "#fff", font: "inherit" }}><option value="1">Hoy</option><option value="7">7 días</option><option value="30">30 días</option><option value="90">90 días</option></select></header>
      {error && <p className="send-error" role="alert">{error}</p>}
      {!data && !error && <p>Cargando campañas…</p>}
      {data && <>
        <div className="camp-grid">
          <article className="camp-card"><span>Leads de anuncios</span><b>{data.totals.leads}</b><small>Personas que escribieron desde un anuncio o publicación de Meta.</small></article>
          <article className="camp-card warn"><span>Sin respuesta aún</span><b>{data.totals.neverAnswered}</b><small>Nadie les ha contestado todavía: son los que más se enfrían.</small></article>
          <article className="camp-card"><span>Ventana de 24 h abierta</span><b>{data.windows.open + data.windows.closing}</b><small>{data.windows.closing} cierran en menos de 4 h. Dentro de la ventana se puede escribir libremente.</small></article>
          <article className="camp-card"><span>Ventas de la campaña</span><b>{data.totals.sales}</b><small>{pen(data.totals.revenuePen)} en pedidos pagados de estos leads.</small></article>
        </div>
        <div className="camp-two">
          <section className="camp-panel"><h2>Atender ahora</h2><p>Leads con interés y ventana abierta, ordenados por urgencia. Entra y responde antes de que venza.</p>
            {data.attend.length ? data.attend.map((lead) => <a key={lead.id} className="attend-item" href={`/?conversation=${encodeURIComponent(lead.id)}`}><span><b>{lead.name}</b>{lead.city ? ` · ${lead.city}` : ""}<small>{lead.reason}{lead.headline ? ` · ${lead.headline}` : ""}</small></span><span style={{ textAlign: "right" }}><span className={`badge ${lead.level === "HOT" || lead.level === "PAYMENT_PENDING" ? "hot" : ""}`}>{levelName[lead.level] ?? lead.level}</span><small>{lead.waitingReply ? <span className="badge wait">Espera respuesta</span> : null} {lead.closing ? "⏱ " : ""}quedan {formatLeft(lead.msLeft)}</small></span></a>) : <p className="empty">No hay leads con interés y ventana abierta ahora.</p>}
          </section>
          <section className="camp-panel"><h2>Temperatura de los leads</h2><p>Calculada con lo que escribieron (precio, catálogo, entrega, zona, intención de compra).</p>
            {rows.map(([key, label, cls]) => <div key={key} className={`temp-row ${cls}`}><span>{label}</span><b>{data.temperature[key] ?? 0}</b><i style={{ width: `${Math.max(4, (data.temperature[key] ?? 0) / max * 100)}%` }} /></div>)}
            <div className="camp-note">Es una sugerencia para priorizar. No cambia la etapa de nadie ni lo que responde la IA; la etapa oficial la sigues moviendo tú en Oportunidades.</div>
          </section>
        </div>
        <section className="camp-panel"><h2>Rendimiento por anuncio</h2><p>Agrupado por el título del anuncio que reporta WhatsApp. Si un lead no trae referencia de anuncio no se atribuye a ninguno.</p>
          <div className="camp-row head"><span>Anuncio</span><b>Leads</b><b>Calientes</b><b>Ventas</b></div>
          {data.ads.length ? data.ads.map((ad) => <div key={`${ad.sourceId}-${ad.headline}`} className="camp-row"><span>{ad.headline}<small>{ad.source === "META_POST" ? "Publicación" : "Anuncio"}{ad.revenuePen ? ` · ${pen(ad.revenuePen)}` : ""}</small></span><b>{ad.leads}</b><b>{ad.hot}</b><b>{ad.sales}</b></div>) : <p className="empty">Aún no llegan leads con origen de anuncio en este periodo.</p>}
        </section>
      </>}
    </section></main>;
}
