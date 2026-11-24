// Clasificación automática de leads y ventanas de WhatsApp (puro, sin base de datos).

export type LeadLevel = "NEW" | "INTERESTED" | "POTENTIAL" | "HOT" | "PAYMENT_PENDING" | "WON" | "LOST";
export const AUTO_LEVELS = ["NEW", "INTERESTED", "POTENTIAL", "HOT"] as const;
const RANK: Record<string, number> = { NEW: 0, INTERESTED: 1, POTENTIAL: 2, HOT: 3 };

export function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const BUY = /\b(quiero|quisiera|me los llevo|me lo llevo|pedido|pedir|comprar|encargar|reservar|separar|yape|plin|transferencia|depositar|como pago|como compro|donde pago|para hoy|para manana)\b/;
const PRICE = /\b(precio|precios|cuanto|cuesta|cuestan|costo|promo|promocion|oferta|catalogo|menu|carta|productos|modelos|disponible|disponibles)\b/;
const DELIVERY = /\b(delivery|envio|enviar|entrega|entregan|llegan|reparto|despacho|cobertura|zona|distrito)\b/;
function districtRegex(districts: string[]) {
  return districts.length ? new RegExp(`\\b(${districts.map((name) => normalize(name)).join("|")})\\b`) : null;
}

export type LeadScoreInput = { texts: string[]; fromAd: boolean; inboundCount: number; districts?: string[] };
export type LeadScore = { level: "NEW" | "INTERESTED" | "POTENTIAL" | "HOT"; reason: string };

export function scoreLead({ texts, fromAd, inboundCount, districts = [] }: LeadScoreInput): LeadScore {
  const text = normalize(texts.join(" \n "));
  if (BUY.test(text)) return { level: "HOT", reason: "Dijo que quiere comprar o pagar" };
  const asksPrice = PRICE.test(text);
  const asksDelivery = DELIVERY.test(text) || (districtRegex(districts)?.test(text) ?? false);
  if (asksPrice && asksDelivery) return { level: "HOT", reason: "Preguntó por producto y delivery" };
  if (asksPrice) return { level: "POTENTIAL", reason: "Preguntó por precio o catálogo" };
  if (asksDelivery) return { level: "POTENTIAL", reason: "Preguntó por delivery o su distrito" };
  if (fromAd && inboundCount >= 3) return { level: "POTENTIAL", reason: "Llegó del anuncio y sigue conversando" };
  if (fromAd) return { level: "INTERESTED", reason: "Llegó desde un anuncio de Facebook/Instagram" };
  if (inboundCount >= 2) return { level: "INTERESTED", reason: "Está conversando" };
  return { level: "NEW", reason: "Primer contacto" };
}

/** Solo sube de nivel; nunca toca pago pendiente, ganado ni perdido. */
export function mergeLevel(current: string, scored: LeadScore["level"]) {
  if (!(current in RANK)) return current;
  return RANK[scored] > RANK[current] ? scored : current;
}

// Ventana de atención de 24 h: solo dentro de ella se puede escribir texto libre.
export const SERVICE_WINDOW_MS = 24 * 3600_000;
export const CLOSING_SOON_MS = 4 * 3600_000;

export type ServiceWindow = { state: "OPEN" | "CLOSING" | "CLOSED" | "NONE"; msLeft: number };

export function serviceWindow(lastInboundAt: string | Date | null | undefined, now = Date.now()): ServiceWindow {
  if (!lastInboundAt) return { state: "NONE", msLeft: 0 };
  const left = new Date(lastInboundAt).getTime() + SERVICE_WINDOW_MS - now;
  if (Number.isNaN(left)) return { state: "NONE", msLeft: 0 };
  if (left <= 0) return { state: "CLOSED", msLeft: 0 };
  return { state: left <= CLOSING_SOON_MS ? "CLOSING" : "OPEN", msLeft: left };
}

export function formatLeft(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24} h`;
}

// Ventana de entrada por anuncio (Click-to-WhatsApp): mensajes sin costo mientras dura (7 días desde la primera respuesta;
// la confirma YCloud con pricingType=free_entry_point). Es informativa.
export type FreeEntryWindow = { active: boolean; msLeft: number; confirmed: boolean };

export function freeEntryWindow(expiresAt: string | Date | null | undefined, confirmedAt: string | Date | null | undefined, now = Date.now()): FreeEntryWindow {
  if (!expiresAt) return { active: false, msLeft: 0, confirmed: false };
  const left = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(left) || left <= 0) return { active: false, msLeft: 0, confirmed: false };
  return { active: true, msLeft: left, confirmed: Boolean(confirmedAt) };
}
