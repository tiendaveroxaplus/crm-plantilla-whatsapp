"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_CONVERSATIONS, inboxLabels, type InboxState } from "@/lib/crm";
import AppSidebar from "@/components/AppSidebar";
import ContactPanel from "@/components/ContactPanel";
import WindowChip from "@/components/WindowChip";
import { BRAND } from "@/lib/brand";

const filters: Array<{ id: "ALL" | InboxState; label: string; badge?: number }> = [
  { id: "ALL", label: "Todas" },
  { id: "UNREAD", label: "Sin leer", badge: 3 },
  { id: "PENDING_REPLY", label: "Por responder", badge: 1 },
  { id: "IN_PROGRESS", label: "En gestión" },
  { id: "RESPONDED", label: "Respondidas" },
];
const leadLabels: Record<string, string> = { NEW: "Nuevo", INTERESTED: "Interesado", POTENTIAL: "Potencial", HOT: "Cliente listo", PAYMENT_PENDING: "Pago pendiente", WON: "Ganado", LOST: "Perdido" };

export default function CrmWorkspace() {
  const [filter, setFilter] = useState<"ALL" | InboxState>("ALL");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "META_AD" | "META_POST" | "FREE_ENTRY">("ALL");
  const [allConversations, setAllConversations] = useState<typeof DEMO_CONVERSATIONS>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [contactOpen, setContactOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [newMessages, setNewMessages] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | undefined>(undefined);
  const [agentMode, setAgentMode] = useState<"IA" | "HUMANO" | "PAUSADO" | "DERIVADO">("IA");
  const [liveMode, setLiveMode] = useState(false);
  const [ycloudConnected, setYcloudConnected] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: "ADMIN" | "ADVISOR" } | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const setAutomation = async (mode: "IA" | "HUMANO") => {
    const serverMode = mode === "IA" ? "AI" : "HUMAN";
    const response = await fetch(`/api/conversations/${selectedId}/automation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: serverMode }) });
    if (!response.ok) { setSendError("No se pudo actualizar el control de la IA."); return; }
    setAgentMode(mode);
  };
  const [messages, setMessages] = useState<Array<{ id: string; direction: "INBOUND" | "OUTBOUND"; sender: string; body: string; contentType?: string; mediaUrl?: string | null; status: string | null; errorDetail?: string | null; createdAt: string }>>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active && Array.isArray(data.conversations)) {
          setLiveMode(data.source === "live");
          const nextConversations = data.conversations.map((item: typeof DEMO_CONVERSATIONS[number]) => ({ ...item, lastAt: relativeTime(item.lastAt) }));
          setAllConversations(nextConversations);
          setSelectedId((current) => {
            const requested = !current ? new URLSearchParams(window.location.search).get("conversation") : null;
            return nextConversations.some((item: typeof DEMO_CONVERSATIONS[number]) => item.id === current) ? current
              : nextConversations.some((item: typeof DEMO_CONVERSATIONS[number]) => item.id === requested) ? requested || ""
              : nextConversations[0]?.id ?? "";
          });
        }
        if (active) { setYcloudConnected(Boolean(data.integrations?.ycloud)); setAiConfigured(Boolean(data.integrations?.ai)); setCurrentUser(data.currentUser ?? null); }
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [reloadKey]);

  useEffect(() => { if (currentUser?.role !== "ADMIN") return; fetch("/api/users?assignable=1", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(data => setAssignableUsers(data?.users ?? [])).catch(() => {}); }, [currentUser?.role]);

  useEffect(() => {
    if (!liveMode || !selectedId) return;
    let active = true;
    let firstLoad = true;
    setMessages([]);
    lastMessageIdRef.current = undefined;
    setNewMessages(false);
    const load = async () => {
      try {
        const response = await fetch(`/api/conversations/${selectedId}/messages`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active) {
          const next = data.messages ?? [];
          const panel = messagesRef.current;
          const nearBottom = panel ? panel.scrollHeight - panel.scrollTop - panel.clientHeight < 130 : true;
          if (!firstLoad && lastMessageIdRef.current && next.at(-1)?.id !== lastMessageIdRef.current && !nearBottom) setNewMessages(true);
          lastMessageIdRef.current = next.at(-1)?.id;
          setMessages(next);
          if (firstLoad || nearBottom) {
            window.requestAnimationFrame(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; });
            setNewMessages(false);
          }
          firstLoad = false;
        }
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 3500);
    return () => { active = false; window.clearInterval(timer); };
  }, [liveMode, selectedId]);

  const latestInboundId = [...messages].reverse().find((message) => message.direction === "INBOUND")?.id;
  useEffect(() => {
    if (!liveMode || !selectedId || !latestInboundId) return;
    if (window.matchMedia("(max-width: 700px)").matches && !mobileChatOpen) return;
    fetch(`/api/conversations/${selectedId}/seen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ throughMessageId: latestInboundId }) }).catch(() => {});
  }, [liveMode, selectedId, latestInboundId, mobileChatOpen]);

  useEffect(() => {
    if (!liveMode || !selectedId) return;
    const load = () => fetch(`/api/conversations/${selectedId}/automation`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (data?.mode) setAgentMode(data.mode === "HUMAN" ? "HUMANO" : data.mode === "PAUSED" ? "PAUSADO" : data.mode === "ESCALATED" ? "DERIVADO" : "IA"); }).catch(() => {});
    void load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [liveMode, selectedId]);

  const conversations = useMemo(() => allConversations.filter((item) =>
    (filter === "ALL" || item.state === filter || (filter === "UNREAD" && item.unread > 0)) &&
    (sourceFilter === "ALL" || (sourceFilter === "FREE_ENTRY" ? Boolean(item.freeEntryExpiresAt && new Date(item.freeEntryExpiresAt).getTime() > Date.now()) : item.entrySource === sourceFilter)) &&
    `${item.contact} ${item.phone} ${item.lastMessage}`.toLocaleLowerCase().includes(searchTerm.toLocaleLowerCase())),
  [filter, sourceFilter, allConversations, searchTerm]);
  const selected = allConversations.find((item) => item.id === selectedId) ?? allConversations[0];
  const unreadCount = allConversations.filter((item) => item.unread > 0).length;
  const pendingCount = allConversations.filter((item) => item.state === "PENDING_REPLY").length;
  const inProgressCount = allConversations.filter((item) => item.state === "IN_PROGRESS").length;
  const respondedCount = allConversations.filter((item) => item.state === "RESPONDED").length;

  if (!selected) return <main className="workspace"><AppSidebar /><section className="empty-module"><h1>Sin conversaciones todavía</h1><span>La bandeja mostrará aquí los mensajes reales que lleguen por YCloud. No se muestran datos de demostración.</span></section></main>;
  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setSendError(null);
    try {
      const response = await fetch(`/api/conversations/${selected.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo enviar el mensaje.");
      setDraft("");
      if (data.warning) setSendError(data.warning);
      const messagesResponse = await fetch(`/api/conversations/${selected.id}/messages`, { cache: "no-store" });
      if (messagesResponse.ok) {
        const latest = (await messagesResponse.json()).messages ?? [];
        setMessages(latest);
        lastMessageIdRef.current = latest.at(-1)?.id;
        window.requestAnimationFrame(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; });
      }
    } catch (error) { setSendError(error instanceof Error ? error.message : "No se pudo enviar el mensaje."); }
    finally { setSending(false); }
  };
  return (
    <main className={`workspace crm-workspace ${mobileChatOpen ? "mobile-chat-open" : ""}`}>
      <AppSidebar />
      <header className="topbar">
        <div className="brand"><div><strong>{BRAND.name}</strong><small>WhatsApp comercial · <a href="/dashboard">Dashboard</a></small></div></div>
        <div className="top-actions"><span className={`connection ${ycloudConnected ? "connected" : ""}`}><i />{ycloudConnected ? "YCloud configurado" : "YCloud sin configurar"}</span><a className="avatar" href="/settings" aria-label="Abrir configuración de perfil">{(currentUser?.name || "C").slice(0, 1).toUpperCase()}</a></div>
      </header>

      <section className="metrics" aria-label="Resumen de conversaciones">
        <button className="metric metric-attention" onClick={() => setFilter("UNREAD")}><span>Sin leer</span><strong>{unreadCount}</strong><small>requieren revisión</small></button>
        <button className="metric" onClick={() => setFilter("PENDING_REPLY")}><span>Por responder</span><strong>{pendingCount}</strong><small>último mensaje del cliente</small></button>
        <button className="metric" onClick={() => setFilter("IN_PROGRESS")}><span>En gestión</span><strong>{inProgressCount}</strong><small>IA o asesor trabajando</small></button>
        <button className="metric" onClick={() => setFilter("RESPONDED")}><span>Respondidas</span><strong>{respondedCount}</strong><small>esperando al cliente</small></button>
      </section>

      <section className="crm-grid">
        <aside className="inbox">
          <div className="section-title"><div><p>INBOX</p><h1>Conversaciones</h1></div><button className="icon-button" aria-label="Buscar conversaciones" aria-expanded={searchOpen} onClick={() => { setSearchOpen(value => !value); setSearchTerm(""); }}>⌕</button></div>
          {searchOpen && <input className="inbox-search" autoFocus aria-label="Buscar conversaciones" placeholder="Nombre, número o mensaje…" value={searchTerm} onChange={event => setSearchTerm(event.target.value)}/>}
          <nav className="filters" aria-label="Filtros de bandeja">
            {filters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={filter === item.id ? "active" : ""}>{item.label}{item.id === "UNREAD" && unreadCount ? <b>{unreadCount}</b> : item.id === "PENDING_REPLY" && pendingCount ? <b>{pendingCount}</b> : null}</button>)}
          </nav>
          <div className="origin-filters" aria-label="Origen del lead">{[["ALL","Todos los orígenes"],["META_AD","Anuncios"],["META_POST","Publicaciones"],["FREE_ENTRY","Ventana activa"]].map(([value,label]) => <button key={value} className={sourceFilter === value ? "active" : ""} onClick={() => setSourceFilter(value as typeof sourceFilter)}>{label}</button>)}</div>
          <div className="list-label">{filter === "ALL" ? "Todas las conversaciones" : inboxLabels[filter]}</div>
          <div className="conversation-list">
            {conversations.map((conversation) => <button key={conversation.id} onClick={() => { setSelectedId(conversation.id); setMobileChatOpen(true); setContactOpen(false); }} className={`conversation ${selected.id === conversation.id ? "selected" : ""}`}>
              <span className="contact-avatar">{conversation.contact.slice(0, 1)}</span>
              <span className="conversation-copy"><span><strong>{conversation.contact}</strong><time>{conversation.lastAt}</time></span><em>{conversation.lastMessage}</em><small>{leadLabels[conversation.leadLevel || ""] || conversation.stage}{conversation.entrySource === "META_AD" ? " · Anuncio" : conversation.entrySource === "META_POST" ? " · Publicación" : conversation.entrySource === "META_ENTRY_UNSPECIFIED" ? " · Entrada Meta" : ""}{conversation.freeEntryExpiresAt && new Date(conversation.freeEntryExpiresAt).getTime() > Date.now() ? " · Ventana gratis" : ""}</small><WindowChip lastInboundAt={conversation.lastInboundAt} freeEntryExpiresAt={conversation.freeEntryExpiresAt} freeEntryConfirmedAt={conversation.freeEntryConfirmedAt} /></span>
              {conversation.unread > 0 ? <b className="unread-count">{conversation.unread}</b> : null}
            </button>)}
            {!conversations.length && <p className="inbox-empty">No hay conversaciones para este filtro.</p>}
          </div>
        </aside>

        <section className="chat" aria-label={`Conversación con ${selected.contact}`}>
          <header className="chat-header"><button className="chat-back" onClick={() => setMobileChatOpen(false)} aria-label="Volver a conversaciones">←</button><div><h2>{selected.contact}</h2><p>{selected.phone} · {leadLabels[selected.leadLevel || ""] || selected.stage}{agentMode === "DERIVADO" ? " · Asesor pendiente; seguimiento automático limitado" : agentMode === "PAUSADO" ? " · IA pausada" : ""}</p></div><div className="mode-control"><button className={agentMode === "IA" ? "mode-on" : ""} onClick={() => setAutomation("IA")} disabled={!aiConfigured} title={aiConfigured ? "Activar respuestas automáticas" : "Falta configurar la clave de IA"}>{aiConfigured ? agentMode === "DERIVADO" ? "Asesor pendiente" : agentMode === "PAUSADO" ? "IA pausada" : "IA activa" : "IA por configurar"}</button><button className={agentMode === "HUMANO" ? "mode-human" : ""} onClick={() => setAutomation("HUMANO")}>Tomar control</button></div><button className="contact-toggle" onClick={() => setContactOpen(true)}>Contacto</button></header>
          <div className="chat-state"><WindowChip long lastInboundAt={selected.lastInboundAt} freeEntryExpiresAt={selected.freeEntryExpiresAt} freeEntryConfirmedAt={selected.freeEntryConfirmedAt} /><span className={`state-dot ${selected.state.toLowerCase()}`} />{inboxLabels[selected.state]} {selected.unread > 0 ? `· ${selected.unread} mensajes sin revisar` : "· conversación al día"}</div>
          <div className="messages" ref={messagesRef} onScroll={() => { const panel = messagesRef.current; if (panel && panel.scrollHeight - panel.scrollTop - panel.clientHeight < 130) setNewMessages(false); }}>
            {liveMode ? messages.map((message) => <div key={message.id} className={`bubble ${message.direction === "INBOUND" ? "inbound" : "outbound"}`}><small>{message.direction === "INBOUND" ? selected.contact : message.sender === "AI" ? "IA" : "Asesor"} · {relativeTime(message.createdAt)}{message.status ? <> · <span className="ticks">✓✓</span> {message.status}</> : null}</small>{message.mediaUrl && message.contentType === "image" ? <img className="message-media" src={message.mediaUrl} alt={message.body || "Imagen compartida"} /> : null}{message.mediaUrl && message.contentType === "audio" ? <audio className="message-audio" controls src={message.mediaUrl}>Audio recibido</audio> : null}<p>{message.body}</p>{message.status === "FAILED" && message.errorDetail ? <span className="message-error">{message.errorDetail}</span> : null}</div>) : <><div className="bubble inbound"><small>{selected.contact} · 10:32</small><p>Hola, quisiera información. ¿Cómo funciona la entrega?</p></div><div className="bubble outbound"><small>IA · 10:33 · <span className="ticks">✓✓</span> Entregado</small><p>Para darte el tiempo exacto, ¿desde qué ciudad nos escribes?</p></div><div className="bubble inbound"><small>{selected.contact} · {selected.lastAt}</small><p>{selected.lastMessage}</p></div></>}
          </div>
          {newMessages && <button className="new-message-button" onClick={() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; setNewMessages(false); }}>↓ Mensajes nuevos</button>}
          <form className="composer" onSubmit={sendMessage}><input aria-label="Mensaje" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={agentMode !== "HUMANO" ? "Toma control para responder manualmente" : "Escribe un mensaje..."} disabled={agentMode !== "HUMANO" || !liveMode || !ycloudConnected || sending}/><button disabled={agentMode !== "HUMANO" || !liveMode || !ycloudConnected || sending}>{sending ? "Enviando..." : "Enviar"}</button></form>
          {sendError ? <p className="send-error" role="alert">{sendError}</p> : null}
        </section>

        {liveMode && <ContactPanel key={selected.id} conversation={selected} open={contactOpen} onClose={() => setContactOpen(false)} onChange={() => setReloadKey(value => value + 1)} isAdmin={currentUser?.role === "ADMIN"} assignableUsers={assignableUsers} />}
      </section>
    </main>
  );
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Hace ${hours} h` : `Hace ${Math.floor(hours / 24)} d`;
}
