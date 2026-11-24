"use client";

import { useEffect, useMemo, useState } from "react";
import AppSidebar from "@/components/AppSidebar";

type Contact = { id: string; name: string; phone: string; city: string | null; stage: string; leadLevel: string; automationMode: string; entrySource?: string; freeEntryExpiresAt?: string | null; tags: string[]; updatedAt: string; conversationId?: string };
const labels: Record<string, string> = { NEW: "Nuevo", INTERESTED: "Interesado", POTENTIAL: "Potencial", HOT: "Caliente", PAYMENT_PENDING: "Pago pendiente", WON: "Ganado", LOST: "Perdido" };

export default function ContactsWorkspace() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [leadFilter, setLeadFilter] = useState("ALL");
  const [originFilter, setOriginFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/contacts?search=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudieron cargar los contactos.");
      setContacts((await response.json()).contacts ?? []);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron cargar los contactos."); }
    finally { setLoading(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [query]);

  function open(contact: Contact | null) {
    setSelected(contact || { id: "", name: "", phone: "", city: "", stage: "NUEVO_LEAD", leadLevel: "NEW", automationMode: "AI", tags: [], updatedAt: "" });
    setName(contact?.name || ""); setCity(contact?.city || ""); setPhone(contact?.phone || ""); setError("");
  }

  async function save() {
    if (!selected || !name.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/contacts", {
        method: selected.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, name, city, phone }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el contacto.");
      setSelected(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el contacto."); }
    finally { setSaving(false); }
  }

  const stats = useMemo(() => ({ total: contacts.length, hot: contacts.filter(contact => ["HOT", "PAYMENT_PENDING"].includes(contact.leadLevel)).length, ai: contacts.filter(contact => contact.automationMode === "AI").length }), [contacts]);
  const visible = contacts.filter(contact => (leadFilter === "ALL" || contact.leadLevel === leadFilter) &&
    (originFilter === "ALL" || (originFilter === "FREE_ENTRY" ? Boolean(contact.freeEntryExpiresAt && new Date(contact.freeEntryExpiresAt).getTime() > Date.now()) : contact.entrySource === originFilter)));
  return <main className="app-shell"><AppSidebar/><section className="crm-page"><header className="module-head"><div><p>BASE COMERCIAL</p><h1>Contactos</h1><span>Información, historial y seguimiento de cada persona.</span></div><button className="primary-button" onClick={() => open(null)}>＋ Nuevo contacto</button></header>
    <section className="module-kpis"><article><span>Contactos</span><b>{stats.total}</b></article><article><span>Prioridad alta</span><b>{stats.hot}</b></article><article><span>IA activa</span><b>{stats.ai}</b></article></section>
    <section className="table-panel"><header><div className="table-actions"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre o teléfono…" aria-label="Buscar contactos"/><select value={leadFilter} onChange={event => setLeadFilter(event.target.value)} aria-label="Filtrar por etapa"><option value="ALL">Todas las etapas</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={originFilter} onChange={event => setOriginFilter(event.target.value)} aria-label="Filtrar por origen"><option value="ALL">Todos los orígenes</option><option value="META_AD">Anuncios Meta</option><option value="META_POST">Publicaciones Meta</option><option value="META_ENTRY_UNSPECIFIED">Entrada Meta sin detalle</option><option value="FREE_ENTRY">Ventana gratuita activa</option></select></div><span>{visible.length} registros</span></header>
      <div className="contact-table"><div className="tr th"><span>Contacto</span><span>Teléfono</span><span>Ciudad</span><span>Oportunidad</span><span>Última actividad</span><span>Etiquetas y origen</span></div>{loading ? <p className="table-empty">Cargando contactos…</p> : visible.length ? visible.map(contact => <button className="tr" key={contact.id} onClick={() => open(contact)}><span><i className="person-avatar">{contact.name[0]}</i><strong>{contact.name}</strong></span><span>{contact.phone}</span><span>{contact.city || "—"}</span><span><em className={`lead ${contact.leadLevel.toLowerCase()}`}>{labels[contact.leadLevel] || contact.stage}</em></span><span>{relativeTime(contact.updatedAt)}</span><span className="tag-list">{contact.entrySource === "META_AD" && <i>Anuncio Meta</i>}{contact.entrySource === "META_POST" && <i>Publicación Meta</i>}{contact.entrySource === "META_ENTRY_UNSPECIFIED" && <i>Entrada Meta</i>}{contact.freeEntryExpiresAt && new Date(contact.freeEntryExpiresAt).getTime() > Date.now() && <i>Ventana gratis</i>}{contact.tags.slice(0, 2).map(tag => <i key={tag}>{tag}</i>)}{!contact.tags.length && (!contact.entrySource || contact.entrySource === "UNKNOWN") && "—"}</span></button>) : <p className="table-empty">No hay contactos para este filtro.</p>}</div>
    </section>{error && !selected && <p className="send-error" role="alert">{error}</p>}</section>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="contact-modal" role="dialog" aria-modal="true" aria-label={selected.id ? "Editar contacto" : "Nuevo contacto"} onClick={event => event.stopPropagation()}><header><div><p>FICHA DE CONTACTO</p><h2>{selected.id ? "Editar contacto" : "Nuevo contacto"}</h2></div><button onClick={() => setSelected(null)} aria-label="Cerrar">×</button></header><label>Nombre<input value={name} maxLength={140} onChange={event => setName(event.target.value)} autoFocus/></label>{!selected.id && <label>WhatsApp con código de país<input value={phone} onChange={event => setPhone(event.target.value)} placeholder="51987654321" inputMode="tel"/></label>}<label>Ciudad / distrito<input value={city} maxLength={100} onChange={event => setCity(event.target.value)}/></label>{selected.id && <><p className="contact-phone">{selected.phone}</p><p>Las etiquetas, pedidos, tareas y notas se gestionan desde la conversación.</p>{selected.conversationId && <a className="text-link" href={`/?conversation=${selected.conversationId}`}>Abrir conversación</a>}</>}{error && <p className="send-error" role="alert">{error}</p>}<footer><button onClick={() => setSelected(null)}>Cancelar</button><button className="primary-button" onClick={() => void save()} disabled={saving || !name.trim() || (!selected.id && !phone.trim())}>{saving ? "Guardando…" : "Guardar"}</button></footer></section></div>}
  </main>;
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 1 ? "Ahora" : minutes < 60 ? `Hace ${minutes} min` : minutes < 1440 ? `Hace ${Math.floor(minutes / 60)} h` : `Hace ${Math.floor(minutes / 1440)} d`;
}
