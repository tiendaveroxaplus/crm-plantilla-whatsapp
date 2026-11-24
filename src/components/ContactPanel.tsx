"use client";

import ConversationSummary from "@/components/ConversationSummary";
import { useEffect, useState } from "react";
import type { ConversationPreview } from "@/lib/crm";

type Note = { id: string; body: string; createdAt: string };
type Task = { id: string; note: string; dueAt: string; status: string; priority: string };
type Memory = { kind: string; subject: string };
type Item = { name: string; quantity: number; unitPricePen: string; subtotalPen?: string };
type Order = { id: string; items: Item[]; totalPen: string; status: "PENDING" | "PAID" | "CANCELLED"; closedBy: "AI" | "HUMAN" | "UNKNOWN"; paidAt: string | null; createdAt: string; version: number };
const levels: Record<string, string> = { NEW: "Nuevo", INTERESTED: "Interesado", POTENTIAL: "Potencial", HOT: "Cliente listo", PAYMENT_PENDING: "Pago pendiente", WON: "Ganado", LOST: "Perdido" };
const orderStatus: Record<Order["status"], string> = { PENDING: "Pendiente de pago", PAID: "Pagado", CANCELLED: "Cancelado" };
const closerLabel: Record<Order["closedBy"], string> = { AI: "IA", HUMAN: "Asesor", UNKNOWN: "Sin atribuir" };
const memoryLabel: Record<string, string> = { PRODUCT_INTEREST: "Consultó", PURCHASE_INTENT: "Quiere comprar", PURCHASE_COMPLETED: "Compra confirmada" };
const sourceLabel: Record<string, string> = { META_AD: "Anuncio Click-to-WhatsApp", META_POST: "Publicación Meta", META_ENTRY_UNSPECIFIED: "Entrada Meta sin origen detallado", UNKNOWN: "Origen no identificado" };
const emptyItem = (): Item => ({ name: "", quantity: 1, unitPricePen: "" });
const currency = (value: number | string) => `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ContactPanel({ conversation, onChange, open, onClose, isAdmin, assignableUsers }: {
  conversation: ConversationPreview; onChange: () => void; open: boolean; onClose: () => void; isAdmin: boolean; assignableUsers: Array<{ id: string; name: string }>;
}) {
  const conversationId = conversation.id;
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [name, setName] = useState(conversation.contact);
  const [city, setCity] = useState(conversation.city || "");
  const [editingProfile, setEditingProfile] = useState(false);
  const [tag, setTag] = useState("");
  const [note, setNote] = useState("");
  const [task, setTask] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderRequestId, setOrderRequestId] = useState("");
  const [orderVersion, setOrderVersion] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [saleStatus, setSaleStatus] = useState<Order["status"]>("PENDING");
  const [closedBy, setClosedBy] = useState<Order["closedBy"]>("UNKNOWN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const [workspaceResponse, salesResponse] = await Promise.all([
        fetch(`/api/conversations/${conversationId}/workspace`, { cache: "no-store" }),
        fetch(`/api/conversations/${conversationId}/sales`, { cache: "no-store" }),
      ]);
      if (!workspaceResponse.ok || !salesResponse.ok) throw new Error("No se pudieron cargar los datos del contacto.");
      const [workspace, sales] = await Promise.all([workspaceResponse.json(), salesResponse.json()]);
      setNotes(workspace.notes ?? []);
      setTasks(workspace.tasks ?? []);
      setMemories(workspace.memories ?? []);
      setOrders(sales.orders ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron cargar los datos."); }
  }

  useEffect(() => {
    setName(conversation.contact); setCity(conversation.city || ""); setEditingProfile(false);
    setShowSaleForm(false); setEditingOrderId(null); setError(""); setNotice("");
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [conversationId]);

  async function postWorkspace(body: Record<string, unknown>) {
    const response = await fetch(`/api/conversations/${conversationId}/workspace`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo guardar el cambio.");
    await load(); onChange();
  }

  async function perform(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el cambio."); }
    finally { setBusy(false); }
  }

  function startOrder(order?: Order) {
    setEditingOrderId(order?.id ?? null);
    setOrderRequestId(order ? "" : window.crypto.randomUUID());
    setOrderVersion(order?.version ?? null);
    setItems(order?.items.map(item => ({ ...item })) ?? [emptyItem()]);
    setSaleStatus(order?.status ?? "PENDING");
    setClosedBy(order?.closedBy ?? "UNKNOWN");
    setShowSaleForm(true);
    setError("");
  }

  function changeItem(index: number, key: keyof Item, value: string | number) {
    setItems(previous => previous.map((item, position) => position === index ? { ...item, [key]: value } : item));
  }

  const total = items.reduce((sum, item) => sum + (Number(String(item.unitPricePen).replace(",", ".")) || 0) * item.quantity, 0);
  const openTasks = tasks.filter(item => item.status === "OPEN");

  return <aside className={`details contact-panel ${open ? "is-open" : ""}`} aria-label="Ficha del contacto">
    <div className="details-head"><p>CONTACTO</p><div><button onClick={() => { setName(conversation.contact); setCity(conversation.city || ""); setEditingProfile(value => !value); }}>{editingProfile ? "Cancelar" : "Editar"}</button><button className="contact-close" onClick={onClose} aria-label="Cerrar ficha">×</button></div></div>
    <div className="contact-card"><span className="large-avatar">{conversation.contact.slice(0, 1).toUpperCase()}</span><h2>{conversation.contact}</h2><p>{conversation.phone}</p></div>
    <ConversationSummary conversationId={conversationId} />
    <section className="contact-attribution"><p>ORIGEN WHATSAPP</p><strong>{sourceLabel[conversation.entrySource || "UNKNOWN"] || "Origen no identificado"}</strong>{conversation.referralHeadline && <small>{conversation.referralHeadline}</small>}{conversation.freeEntryExpiresAt && new Date(conversation.freeEntryExpiresAt).getTime() > Date.now() ? <span className="entry-window-active">Ventana gratuita {conversation.freeEntryConfirmedAt ? "confirmada" : "estimada"} · vence {new Date(conversation.freeEntryExpiresAt).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</span> : conversation.entrySource && conversation.entrySource !== "UNKNOWN" ? <span>Sin ventana gratuita activa</span> : null}</section>
    {editingProfile && <section className="contact-edit"><label>Nombre<input value={name} maxLength={140} onChange={event => setName(event.target.value)}/></label><label>Ciudad o distrito<input value={city} maxLength={100} onChange={event => setCity(event.target.value)}/></label><button disabled={busy || !name.trim()} onClick={() => void perform(async () => {
      const response = await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: conversation.contactId, name, city }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "No se pudo editar el contacto.");
      setEditingProfile(false); onChange();
    }, "Contacto actualizado.")}>Guardar perfil</button></section>}
    <dl><div><dt>Etapa</dt><dd><select className="stage" aria-label="Etapa comercial" value={conversation.leadLevel || "NEW"} disabled={busy} onChange={event => void perform(() => postWorkspace({ action: "update", leadLevel: event.target.value, stage: levels[event.target.value] }), "Etapa actualizada.")}>{Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></dd></div><div><dt>Responsable</dt><dd>{conversation.owner || "Sin asignar"}</dd></div><div><dt>Última actividad</dt><dd>{conversation.lastAt}</dd></div></dl>
    {isAdmin && <div className="owner-actions"><label>Asignar a<select aria-label="Responsable de la conversación" value="" disabled={busy} onChange={event => { if (event.target.value) void perform(() => postWorkspace({ action: "assign", assignedUserId: event.target.value }), "Responsable actualizado."); }}><option value="">{conversation.owner ? "Cambiar responsable…" : "Seleccionar responsable…"}</option>{assignableUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>{conversation.owner && <button disabled={busy} onClick={() => void perform(() => postWorkspace({ action: "unassign" }), "Asignación retirada.")}>Quitar asignación</button>}</div>}
    <div className="tag-block"><p>ETIQUETAS</p><div>{conversation.tags.length ? conversation.tags.map(value => <button className="tag-pill" key={value} title={`Quitar etiqueta ${value}`} disabled={busy} onClick={() => void perform(() => postWorkspace({ action: "tags", tags: conversation.tags.filter(item => item !== value) }), "Etiqueta retirada.")}>{value} ×</button>) : <span>Sin etiquetas</span>}</div><form className="tag-add-form" onSubmit={event => { event.preventDefault(); const value = tag.trim(); if (!value || conversation.tags.includes(value)) return; void perform(async () => { await postWorkspace({ action: "tags", tags: [...conversation.tags, value] }); setTag(""); }, "Etiqueta añadida."); }}><input aria-label="Nueva etiqueta" value={tag} maxLength={50} onChange={event => setTag(event.target.value)} placeholder="Nueva etiqueta"/><button disabled={busy || !tag.trim() || conversation.tags.length >= 12}>Añadir</button></form></div>
    <div className="task"><div><p>PRÓXIMO SEGUIMIENTO</p><strong>{openTasks[0] ? new Date(openTasks[0].dueAt).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "Sin tarea programada"}</strong></div><button onClick={() => setShowTaskForm(value => !value)}>{showTaskForm ? "Cerrar" : "+ Crear"}</button></div>
    {showTaskForm && <div className="contact-form"><label>Detalle<input value={task} maxLength={500} onChange={event => setTask(event.target.value)} placeholder="Llamar o confirmar pedido…"/></label><label>Fecha y hora<input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)}/></label><button disabled={busy || !task.trim() || !dueAt} onClick={() => void perform(async () => { await postWorkspace({ action: "task", note: task, dueAt: new Date(dueAt).toISOString(), priority: "NORMAL" }); setTask(""); setDueAt(""); setShowTaskForm(false); }, "Seguimiento creado.")}>Guardar seguimiento</button></div>}
    {openTasks.slice(0, 4).map(item => <article className="contact-mini-row" key={item.id}><div><b>{item.priority === "HIGH" ? "Prioridad alta" : "Seguimiento"}</b><span>{item.note}</span></div><button disabled={busy} onClick={() => void perform(() => postWorkspace({ action: "completeTask", taskId: item.id }), "Seguimiento completado.")}>Completar</button></article>)}
    <section className="contact-sales"><div className="contact-section-head"><h3>Pedidos e ingresos</h3><button onClick={() => startOrder()}>{showSaleForm ? "+ Otro" : "+ Registrar"}</button></div><p>Solo los pedidos pagados se suman a ingresos. Las etiquetas no confirman pagos.</p>
      {orders.length ? orders.map(order => <article className="sale-card" key={order.id}><div><b>{orderStatus[order.status]}</b><strong>{currency(order.totalPen)}</strong></div><small>{order.items.map(item => `${item.quantity} × ${item.name}`).join(", ")}</small><small>Cierre: {closerLabel[order.closedBy]} · {new Date(order.paidAt || order.createdAt).toLocaleDateString("es-PE")}</small><button onClick={() => startOrder(order)}>Editar pedido</button></article>) : <p>Aún no hay pedidos registrados.</p>}
      {showSaleForm && <div className="sale-form"><h4>{editingOrderId ? "Editar pedido" : "Nuevo pedido"}</h4>{items.map((item, index) => <div className="sale-item" key={index}><label>Producto<input value={item.name} maxLength={180} onChange={event => changeItem(index, "name", event.target.value)} placeholder="Nombre del producto"/></label><div><label>Cantidad<input type="number" min={1} max={10000} value={item.quantity} onChange={event => changeItem(index, "quantity", Number(event.target.value))}/></label><label>Precio unitario (S/)<input inputMode="decimal" value={item.unitPricePen} onChange={event => changeItem(index, "unitPricePen", event.target.value)} placeholder="89.00"/></label></div>{items.length > 1 && <button className="subtle" onClick={() => setItems(previous => previous.filter((_, position) => position !== index))}>Quitar producto</button>}</div>)}<button className="subtle" disabled={items.length >= 20} onClick={() => setItems(previous => [...previous, emptyItem()])}>+ Añadir producto</button><p className="sale-total">Total del pedido: <b>{currency(total)}</b></p><label>Estado<select value={saleStatus} onChange={event => setSaleStatus(event.target.value as Order["status"])}><option value="PENDING">Pendiente de pago</option><option value="PAID">Pagado (cuenta como ingreso)</option><option value="CANCELLED">Cancelado</option></select></label><label>¿Quién cerró la venta?<select value={closedBy} onChange={event => setClosedBy(event.target.value as Order["closedBy"])}><option value="UNKNOWN">Sin atribuir</option><option value="AI">IA</option><option value="HUMAN">Asesor humano</option></select></label><div className="sale-form-actions"><button onClick={() => setShowSaleForm(false)}>Cancelar</button><button disabled={busy} onClick={() => { const previousStatus = orders.find(order => order.id === editingOrderId)?.status; if (previousStatus === "PAID" && saleStatus !== "PAID" && !window.confirm("Este pedido dejará de contar como ingreso. Revisa después la etapa comercial del contacto. ¿Continuar?")) return; if (saleStatus === "PAID" && !window.confirm("¿Confirmas que el pago fue recibido? Este pedido aparecerá en los ingresos del dashboard.")) return; void perform(async () => {
        const url = editingOrderId ? `/api/conversations/${conversationId}/sales/${editingOrderId}` : `/api/conversations/${conversationId}/sales`;
        const response = await fetch(url, { method: editingOrderId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.map(item => ({ ...item, unitPricePen: String(item.unitPricePen).replace(",", ".") })), status: saleStatus, closedBy, requestId: orderRequestId, version: orderVersion }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "No se pudo guardar el pedido.");
        setShowSaleForm(false); setEditingOrderId(null); await load(); onChange(); try { new BroadcastChannel("crm-updates").postMessage("sales"); } catch { /* sin soporte */ }
      }, "Pedido guardado. El dashboard reflejará el cambio."); }}>Guardar pedido</button></div></div>}
    </section>
    <section className="conversation-tools"><p>HITOS DEL CLIENTE</p>{memories.length ? memories.slice(0, 5).map((item, index) => <article key={`${item.kind}-${item.subject}-${index}`}><b>{memoryLabel[item.kind] || item.kind}</b><span>{item.subject === "UNSPECIFIED" ? "Producto por definir" : item.subject}</span></article>) : <span>Sin hitos registrados todavía.</span>}<p>NOTAS INTERNAS</p><div className="quick-row"><input value={note} maxLength={4000} onChange={event => setNote(event.target.value)} placeholder="Nota interna…"/><button disabled={busy || !note.trim()} onClick={() => void perform(async () => { await postWorkspace({ action: "note", note }); setNote(""); }, "Nota guardada.")}>Guardar</button></div>{notes.slice(0, 3).map(item => <article key={item.id}><b>Nota</b><span>{item.body}</span></article>)}</section>
    {error && <p className="contact-feedback error" role="alert">{error}</p>}{notice && <p className="contact-feedback" role="status">{notice}</p>}
  </aside>;
}
