"use client";
import { useEffect, useMemo, useState } from "react";

const labels: Record<string, string> = { NEW: "Nuevos", INTERESTED: "Interesados", POTENTIAL: "Potenciales", HOT: "Leads calientes", PAYMENT_PENDING: "Pago pendiente", WON: "Vendidos", LOST: "Perdidos" };
const dateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const rangeTimestamp = (date: string, endOfDay = false) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).toISOString();
};
const pen = (value: number) => `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function rangeFor(preset: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (preset === "yesterday") { const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1); return { from: dateInput(yesterday), to: dateInput(yesterday) }; }
  const days = Number(preset); const from = new Date(today); from.setDate(from.getDate() - Math.max(0, days - 1)); return { from: dateInput(from), to: dateInput(today) };
}
function formatDuration(seconds: number) {
  if (!seconds) return "Sin datos";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

export default function MetricsDashboard() {
  const [preset, setPreset] = useState("30");
  const [range, setRange] = useState({ from: "", to: "" });
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => { setRange(rangeFor("30")); setReady(true); }, []);
  const query = useMemo(() => ready ? { from: rangeTimestamp(range.from), to: rangeTimestamp(range.to, true) } : null, [range, ready]);
  useEffect(() => {
    if (!query) return;
    let live = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      fetch(`/api/analytics?from=${encodeURIComponent(query.from)}&to=${encodeURIComponent(query.to)}`, { cache: "no-store" })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar las métricas."); return body; })
        .then((body) => { if (live) { setData(body); setError(""); } })
        .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : "No se pudieron cargar las métricas."); });
    };
    load();
    const timer = window.setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel("crm-updates"); channel.onmessage = () => load(); } catch { /* sin soporte */ }
    return () => { live = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", load); channel?.close(); };
  }, [query]);
  const selectPreset = (value: string) => { setPreset(value); if (value !== "custom") setRange(rangeFor(value)); };
  if (!ready || (!data && !error)) return <main className="dashboard"><p>Cargando métricas…</p></main>;
  if (error && !data) return <main className="dashboard"><p className="send-error">{error}</p></main>;
  const max = Math.max(1, ...data.funnel.map((x: any) => x.value)); const c = data.communication;
  return <main className="dashboard">
    {error && <p className="send-error" role="alert">No se pudieron actualizar las métricas; se muestran los últimos datos cargados. {error}</p>}
    <header className="page-head"><div><p className="eyebrow">INTELIGENCIA COMERCIAL</p><h1>Panel de ventas</h1><span>Leads, ventas y atención: lo justo para priorizar y cerrar más.</span></div><div className="period-control" aria-label="Periodo del dashboard"><div className="period-options">{[["1","Hoy"],["yesterday","Ayer"],["7","7 días"],["30","30 días"],["90","90 días"],["custom","Personalizar"]].map(([value,label]) => <button type="button" key={value} className={preset === value ? "active" : ""} aria-pressed={preset === value} onClick={() => selectPreset(value)}>{label}</button>)}</div>{preset === "custom" && <div className="period-custom"><label>Desde<input type="date" value={range.from} max={range.to} onChange={(e) => { if (e.target.value) setRange((old) => ({ ...old, from: e.target.value })); }} /></label><label>Hasta<input type="date" value={range.to} min={range.from} onChange={(e) => { if (e.target.value) setRange((old) => ({ ...old, to: e.target.value })); }} /></label></div>}</div></header>
    <WhatsAppOverview data={data.whatsapp} exchangeRate={Number(data.usage.exchangeRate)} />
    <section className="kpis"><Card label="Contactos nuevos" value={data.summary.newContacts} help="Personas que escribieron por primera vez en el periodo." /><Card label="Gestionados" value={data.summary.managed} help="Conversaciones con actividad reciente del equipo o la IA." /><Card label="Leads potenciales" value={data.summary.potential} help="Oportunidades con interés alto o pago pendiente." /><Card label="Ventas pagadas" value={data.summary.won} help="Pedidos cuyo pago se registró en el periodo; una etiqueta no cuenta como venta." /></section>
    <section className="kpis commercial-kpis"><Card label="Ingresos confirmados" value={pen(data.summary.revenuePen)} help="Suma de pedidos pagados en el periodo, en soles." /><Card label="Cerradas por IA" value={`${data.summary.aiSales} · ${pen(data.summary.aiRevenuePen)}`} help="Atribución elegida al registrar el pedido, no inferida del último mensaje." /><Card label="Cerradas por asesor" value={`${data.summary.humanSales} · ${pen(data.summary.humanRevenuePen)}`} help="Ventas pagadas atribuidas al asesor humano." /><Card label="Pendientes de pago" value={data.summary.pendingOrders} help={`${data.summary.unattributedSales} venta(s) pagada(s) aún sin atribuir.`} /></section>
    <section className="kpis commercial-kpis"><Card label="Mensajes por cliente" value={Number(c.averageMessagesPerClient).toFixed(1)} help="Promedio de mensajes intercambiados por cliente activo." /><Card label="Respuesta inicial del cliente" value={formatDuration(Number(c.customerFirstReplySeconds))} help="Tiempo medio desde el primer mensaje enviado hasta que el cliente contesta." /><Card label="Velocidad de primera atención" value={formatDuration(Number(c.agentFirstReplySeconds))} help="Tiempo medio hasta la primera respuesta del asesor o IA." /><Card label="Clientes que responden" value={`${Math.round(Number(c.customerReplyRate) * 100)}%`} help="Porcentaje que respondió tras el primer contacto enviado." /></section>
    <section className="dash-grid"><article className="panel funnel"><h2>Embudo comercial</h2><p className="panel-legend">Leads que escribieron por primera vez en el periodo elegido y la etapa en la que están hoy. Si no entró nadie nuevo, verás 0.</p>{data.funnel.map((x: any) => <div className="funnel-row" key={x.label}><span>{labels[x.label] ?? x.label}</span><b>{x.value}</b><i style={{ width: `${Math.max(5, x.value / max * 100)}%` }} /></div>)}</article><article className="panel"><h2>Pendientes ahora</h2><p className="panel-legend">Estado en vivo: no cambia con el filtro de fechas.</p><div className="action"><b>{data.actions.unread}</b><span>Mensajes sin leer</span></div><div className="action"><b>{data.actions.pending}</b><span>Conversaciones por responder</span></div><div className="action"><b>{data.actions.followups}</b><span>Leads calientes o con pago pendiente</span></div></article><article className="panel"><h2>Asistente de IA</h2><p className="panel-legend">Lo que respondió la IA y lo que consumió en el periodo.</p><div className="usage"><b>{data.usage.replies}</b><span>respuestas enviadas por la IA</span></div><div className="usage"><b>{Number(data.usage.requests)}</b><span>consultas a Gemini (las demás respuestas salen de reglas y no consumen tokens)</span></div><div className="usage"><b>{(Number(data.usage.input) + Number(data.usage.output)).toLocaleString("es-PE")}</b><span>tokens · {Number(data.usage.input).toLocaleString("es-PE")} de entrada y {Number(data.usage.output).toLocaleString("es-PE")} de salida</span></div>{data.usage.ratesConfigured ? <div className="usage"><b>S/ {Number(data.usage.costPen).toFixed(4)}</b><span>costo estimado · US$ {Number(data.usage.costUsd).toFixed(4)} con las tarifas de Gemini configuradas</span></div> : <p className="wa-footnote">Costo no calculado: faltan las tarifas de Gemini. Define GOOGLE_AI_INPUT_COST_PER_MILLION y GOOGLE_AI_OUTPUT_COST_PER_MILLION en EasyPanel.</p>}
    </article><article className="panel"><h2>Entrega de mensajes</h2><p className="panel-legend">Estados reportados por WhatsApp: enviado, entregado, leído o fallido.</p>{data.delivery.length ? data.delivery.map((x: any) => <div className="statline" key={x.label}><span>{x.label}</span><b>{x.value}</b></div>) : <p className="empty">Aún no hay entregas dentro del periodo.</p>}</article></section>
  </main>;
}
function Card({ label, value, help }: { label: string; value: string | number; help: string }) { return <article className="kpi"><span>{label}</span><strong>{value ?? 0}</strong><small>{help}</small></article>; }

function WhatsAppOverview({ data, exchangeRate }: { data: any; exchangeRate: number }) {
  const sourceName: Record<string, string> = { META_AD: "Anuncio Click-to-WhatsApp", META_POST: "Publicación Meta", META_ENTRY_UNSPECIFIED: "Entrada Meta sin detalle" };
  const allowance = data.allowance;
  const costUsd = Number(data.pricing.costUsd);
  const costPen = Number(data.pricing.costPen) + costUsd * exchangeRate;
  return <section className="whatsapp-overview" aria-label="Origen y costos de WhatsApp"><div className="whatsapp-overview-head"><div><p className="eyebrow">WHATSAPP BUSINESS PLATFORM</p><h2>Origen de leads y consumo</h2><span>Entradas desde Meta y precios finales reportados por YCloud.</span></div><span className="wa-month-badge">Consumo del mes actual (no depende del filtro) · Perú · número ••••{data.businessPhoneLastFour || "—"}</span></div>
    <div className="wa-kpi-grid"><article className="wa-kpi wa-quota"><div><span>Servicio gratuito usado</span><b>{allowance.used} / {allowance.limit}</b></div><div className="wa-progress" role="progressbar" aria-label="Mensajes de servicio gratuitos usados" aria-valuenow={allowance.used} aria-valuemin={0} aria-valuemax={allowance.limit}><i style={{ width: `${allowance.percent}%` }}/></div><small>{allowance.remaining} disponibles · {allowance.percent}% consumido</small></article><article className="wa-kpi"><span>Mensajes con costo</span><b>{data.pricing.paidService}</b><small>{Number(data.pricing.unpriced) ? `${data.pricing.unpriced} mensaje(s) entregado(s) llegaron sin precio informado por YCloud: se cuentan sin costo.` : "Mensajes entregados con cargo informado por YCloud."}</small></article><article className="wa-kpi"><span>Costo observado de WhatsApp</span><b>{pen(costPen)}</b><small>US$ {costUsd.toFixed(4)} + S/ {Number(data.pricing.costPen).toFixed(4)} · estimación en soles.</small></article><article className="wa-kpi"><span>Ventanas Meta activas</span><b>{data.windows.active}</b><small>{data.windows.expiringSoon} vencen en 24 h · {data.windows.confirmed} confirmadas por YCloud.</small></article></div>
    {allowance.percent >= 80 && <div className={`wa-quota-alert ${allowance.remaining === 0 ? "is-exhausted" : ""}`} role="status">{allowance.remaining === 0 ? `La franquicia de servicio observada llegó a 1.000. El siguiente mensaje de servicio a Perú puede costar cerca de US$ ${data.referenceServiceRatePeruUsd.toFixed(2)}; confirma el cargo real con YCloud.` : `Atención: ya se utilizó el ${allowance.percent}% de la franquicia de mensajes de servicio observada este mes.`}</div>}
    <div className="wa-detail-grid"><article className="wa-detail"><h3>De dónde llegaron</h3><p>Leads atribuidos dentro del periodo seleccionado.</p><div className="wa-source-row"><span>Anuncio Click-to-WhatsApp</span><b>{data.sources.ads}</b></div><div className="wa-source-row"><span>Publicación Meta</span><b>{data.sources.posts}</b></div><div className="wa-source-row"><span>Entrada gratuita sin detalle</span><b>{data.sources.unspecified}</b></div><p className="wa-footnote">Un botón de página sin identificador de origen no se atribuye falsamente a una campaña.</p></article><article className="wa-detail"><h3>Seguimiento de la ventana</h3><p>La ventana estimada dura 7 días desde la primera respuesta. Fuera de las 24 h de atención, usa plantillas aprobadas.</p>{data.leads.length ? <div className="wa-window-list">{data.leads.map((lead: any) => <a key={lead.id} href={`/?conversation=${encodeURIComponent(lead.id)}`}><span><b>{lead.name}</b><small>{sourceName[lead.source] || "Origen no identificado"}{lead.headline ? ` · ${lead.headline}` : ""}</small></span><em>{lead.confirmed ? "Confirmada" : "Estimada"}<small>Vence {new Date(lead.expiresAt).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</small></em></a>)}</div> : <p className="wa-empty">No hay ventanas activas registradas todavía.</p>}</article></div>
    <p className="wa-disclaimer">La franquicia de 1.000 mensajes de servicio es mensual por número empresarial; el contador refleja eventos entregados observados por este CRM, no la factura completa. Las entradas gratuitas no consumen esa franquicia. Tarifa de referencia para servicio a Perú: US$ {data.referenceServiceRatePeruUsd.toFixed(2)}; el costo mostrado utiliza el precio final de YCloud, que puede variar por destino, categoría y proveedor. {data.pricing.unclassified ? `${data.pricing.unclassified} mensaje(s) entregado(s) sin datos tarifarios. ` : ""}{data.pricing.otherCurrencyCount ? `${data.pricing.otherCurrencyCount} cargo(s) en otra moneda no incluidos en la conversión a soles.` : ""}</p>
  </section>;
}
