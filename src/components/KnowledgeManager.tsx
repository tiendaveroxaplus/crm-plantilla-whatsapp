"use client";

import { useEffect, useMemo, useState } from "react";
import AppSidebar from "@/components/AppSidebar";

type Status = "DRAFT" | "APPROVED" | "ARCHIVED";
type Entry = { id: string; title: string; category: string; content: string; status: Status; version: number; mediaUrl: string | null };
type View = "ALL" | "PRODUCTO" | "GUIDE";
const categories = ["FORMA_DE_HABLAR", "PRODUCTO", "REGLAS", "RESTRICCIONES", "PAGOS", "ENTREGAS", "STOCK", "GENERAL"];
const guideCategories = new Set(["FORMA_DE_HABLAR", "REGLAS", "RESTRICCIONES"]);
const newEntry = (category: string): Entry => ({ id: `new-${Date.now()}`, title: "", category, content: "", status: "DRAFT", version: 0, mediaUrl: null });
const statusLabel: Record<Status, string> = { DRAFT: "Borrador", APPROVED: "Publicada", ARCHIVED: "Archivada" };

export default function KnowledgeManager() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [view, setView] = useState<View>("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaConfigured, setMediaConfigured] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/knowledge", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo cargar la base de conocimiento. Revisa la conexión o vuelve a iniciar sesión.");
      const data = await response.json();
      if (!Array.isArray(data.entries)) throw new Error("El servidor devolvió una respuesta inesperada.");
      setEntries(data.entries);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudo cargar la información.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
    void fetch("/api/knowledge/media").then(response => response.ok ? response.json() : null)
      .then(data => setMediaConfigured(Boolean(data?.configured))).catch(() => setMediaConfigured(false));
  }, []);

  const filtered = useMemo(() => entries.filter(item => {
    if (view === "PRODUCTO" && item.category !== "PRODUCTO") return false;
    if (view === "GUIDE" && !guideCategories.has(item.category)) return false;
    return `${item.title} ${item.content} ${item.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  }), [entries, view, query]);

  function change<K extends keyof Entry>(key: K, value: Entry[K]) {
    setEntry(current => current ? { ...current, [key]: value } : current);
    setNotice("");
  }

  function start(category: string) {
    setEntry(newEntry(category));
    setNotice("");
  }

  async function upload(file: File) {
    if (!entry) return;
    const targetId = entry.id;
    setUploading(true);
    setNotice("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/knowledge/media", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "No se pudo subir la imagen.");
      setEntry(current => current?.id === targetId ? { ...current, mediaUrl: data.url } : current);
      setNotice("Imagen subida. Guarda la entrada para asociarla al producto.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally { setUploading(false); }
  }

  async function save() {
    if (!entry || saving) return;
    if (!entry.title.trim() || !entry.content.trim()) {
      setNotice("Escribe un título y el contenido antes de guardar.");
      return;
    }
    const fresh = entry.id.startsWith("new-");
    if (entry.status === "APPROVED" && !window.confirm("Al guardar como publicada, el agente podrá usar esta información desde su siguiente respuesta. ¿Ya verificaste todos los datos?")) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(fresh ? "/api/knowledge" : `/api/knowledge/${entry.id}`, {
        method: fresh ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el conocimiento.");
      setEntry(null);
      setNotice(entry.status === "APPROVED" ? "Publicado. El agente usará la información en su siguiente respuesta." : "Entrada guardada sin alterar las respuestas del agente.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar el conocimiento.");
    } finally { setSaving(false); }
  }

  return <main className="app-shell"><AppSidebar/><section className="knowledge-workspace">
    <section className="knowledge-list">
      <header className="knowledge-list-header">
        <p>BASE DE CONOCIMIENTO</p>
        <h1>Información del agente</h1>
        <span>Solo las entradas publicadas alimentan a la IA.</span>
        <div className="knowledge-actions"><button type="button" onClick={() => start("PRODUCTO")}>+ Producto</button><button type="button" onClick={() => start("REGLAS")}>+ Guía general</button></div>
        <input aria-label="Buscar conocimiento" placeholder="Buscar por título o contenido" value={query} onChange={event => setQuery(event.target.value)}/>
        <div className="knowledge-filters" role="group" aria-label="Filtrar conocimiento">
          <button className={view === "ALL" ? "active" : ""} onClick={() => setView("ALL")}>Todo</button>
          <button className={view === "PRODUCTO" ? "active" : ""} onClick={() => setView("PRODUCTO")}>Productos</button>
          <button className={view === "GUIDE" ? "active" : ""} onClick={() => setView("GUIDE")}>Guía</button>
        </div>
      </header>
      {loading ? <div className="knowledge-list-state">Cargando información…</div> : loadError ? <div className="knowledge-list-state" role="alert">{loadError}<button onClick={() => void load()}>Reintentar</button></div> : filtered.length === 0 ? <div className="knowledge-list-state">{entries.length ? "No hay resultados para esta búsqueda." : "Aún no hay entradas. Crea un producto o información general para empezar."}</div> : filtered.map(item => <button key={item.id} onClick={() => { setEntry({ ...item }); setNotice(""); }} className={entry?.id === item.id ? "selected" : ""}>
        <span className={item.status === "APPROVED" ? "published" : ""}/><div><b>{item.title}</b><small>{item.category.replaceAll("_", " ")} · V{item.version}</small></div><em>{statusLabel[item.status] || item.status}</em>
      </button>)}
    </section>
    <section className="knowledge-editor">{entry ? <>
      <header><p>{entry.id.startsWith("new-") ? "NUEVA ENTRADA" : `EDITAR · VERSIÓN ${entry.version}`}</p><h2>{entry.title || "Nueva información"}</h2><span>El contenido comercial es editable; las reglas técnicas y de seguridad del agente permanecen protegidas.</span></header>
      <label>Título<input maxLength={180} value={entry.title} onChange={event => change("title", event.target.value)} placeholder={entry.category === "PRODUCTO" ? "Nombre exacto del producto" : "Tema de la información"}/></label>
      <div className="editor-row"><label>Categoría<select value={entry.category} onChange={event => change("category", event.target.value)}>{categories.map(category => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label><label>Estado<select value={entry.status} onChange={event => change("status", event.target.value as Status)}><option value="DRAFT">Borrador — no visible para IA</option><option value="APPROVED">Publicada — visible para IA</option><option value="ARCHIVED">Archivada — no visible para IA</option></select></label></div>
      <label>{entry.category === "PRODUCTO" ? "Ficha completa del producto" : "Información e instrucciones comerciales"}<textarea maxLength={12000} value={entry.content} onChange={event => change("content", event.target.value)} placeholder={entry.category === "PRODUCTO" ? "Descripción, precio aprobado, características, restricciones y respuestas frecuentes…" : "Escribe aquí la información aprobada que el agente debe conocer…"}/><small>{entry.content.length}/12000 caracteres</small></label>
      {entry.category === "PRODUCTO" && <div className="knowledge-media"><h3>Imagen del producto</h3><p>El agente podrá adjuntarla cuando corresponda a la conversación.</p>{entry.mediaUrl && <div className="knowledge-image-preview"><img key={entry.mediaUrl} src={entry.mediaUrl} alt={`Imagen de ${entry.title || "producto"}`} onError={event => { event.currentTarget.style.display = "none"; }}/></div>}
        {mediaConfigured ? <label className="knowledge-upload">{uploading ? "Subiendo…" : "Subir nueva imagen JPEG o PNG (máx. 5 MB)"}<input type="file" accept="image/jpeg,image/png" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }}/></label> : <p className="knowledge-media-warning">La carga directa requiere configurar un almacenamiento S3/R2 en EasyPanel. Puedes usar una URL pública mientras tanto.</p>}
        <label>URL pública HTTPS de la imagen<input value={entry.mediaUrl || ""} onChange={event => change("mediaUrl", event.target.value)} placeholder="https://… o /products/imagen.png"/></label>
      </div>}
      <div className="editor-note">Revisa precios, stock, condiciones y afirmaciones antes de publicar. Un borrador o una entrada archivada no alimentan al agente.</div>
      <footer><button type="button" onClick={() => setEntry(null)}>Cerrar</button><button type="button" className="save" disabled={saving || uploading} onClick={() => void save()}>{saving ? "Guardando…" : entry.status === "APPROVED" ? "Guardar y publicar" : "Guardar"}</button></footer>
    </> : <div className="editor-empty"><div><h2>Elige qué quieres editar</h2><p>Selecciona una entrada de la lista o crea un producto o información nueva. Las entradas aprobadas se aplican automáticamente sin desplegar de nuevo.</p><button onClick={() => start("FORMA_DE_HABLAR")}>+ Crear guía de conversación</button></div></div>}
    {notice && <div className="knowledge-notice" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button></div>}
    </section>
  </section></main>;
}
