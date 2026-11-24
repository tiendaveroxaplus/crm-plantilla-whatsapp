export async function sendYcloudText(input: { to: string; body: string }) {
  const apiKey = process.env.YCLOUD_API_KEY;
  const from = process.env.YCLOUD_WHATSAPP_NUMBER;
  if (!apiKey || !from) throw new Error("Faltan las credenciales de YCloud.");
  const response = await fetch("https://api.ycloud.com/v2/whatsapp/messages", { method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": apiKey }, body: JSON.stringify({ from, to: `+${input.to.replace(/^\+/, "")}`, type: "text", text: { body: input.body, preview_url: true } }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("YCloud rechazó el envío.");
  const id = typeof payload.id === "string" ? payload.id : typeof payload.whatsappMessage?.id === "string" ? payload.whatsappMessage.id : null;
  if (!id) throw new Error("YCloud no devolvió un identificador del mensaje.");
  return { id, payload };
}

export async function sendYcloudImage(input: { to: string; link: string; caption?: string }) {
  const apiKey = process.env.YCLOUD_API_KEY;
  const from = process.env.YCLOUD_WHATSAPP_NUMBER;
  if (!apiKey || !from) throw new Error("Faltan las credenciales de YCloud.");
  const response = await fetch("https://api.ycloud.com/v2/whatsapp/messages", { method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": apiKey }, body: JSON.stringify({ from, to: `+${input.to.replace(/^\+/, "")}`, type: "image", image: { link: input.link, ...(input.caption ? { caption: input.caption } : {}) } }), signal: AbortSignal.timeout(20000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`YCloud rechazó la imagen (HTTP ${response.status}, código ${String(payload?.error?.code ?? "desconocido")}).`);
  const id = typeof payload.id === "string" ? payload.id : typeof payload.whatsappMessage?.id === "string" ? payload.whatsappMessage.id : null;
  if (!id) throw new Error("YCloud no devolvió un identificador de imagen.");
  return { id, payload };
}
