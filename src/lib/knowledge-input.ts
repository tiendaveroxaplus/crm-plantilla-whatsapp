export function parseKnowledgeInput(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const content = typeof value.content === "string" ? value.content.trim() : "";
  const category = typeof value.category === "string" ? value.category.trim() : "GENERAL";
  const status = typeof value.status === "string" ? value.status : "DRAFT";
  const mediaUrl = typeof value.mediaUrl === "string" ? value.mediaUrl.trim() : "";
  if (!title || title.length > 180 || !content || content.length > 12000 || !/^[A-Z_]{2,40}$/.test(category) || !["DRAFT", "APPROVED", "ARCHIVED"].includes(status)) return null;
  if (mediaUrl && !(mediaUrl.startsWith("/products/") && !mediaUrl.includes("..") && /^\/products\/[a-zA-Z0-9/_-]+\.(png|jpg|jpeg|webp)$/i.test(mediaUrl))) {
    try { const url = new URL(mediaUrl); if (url.protocol !== "https:" || url.username || url.password) return null; }
    catch { return null; }
  }
  return { title, content, category, status, mediaUrl: mediaUrl || null };
}
