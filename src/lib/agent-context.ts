export type CatalogProduct = { title: string; content: string; mediaUrl: string | null };

export function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const genericWords = new Set(["para", "como", "este", "esta", "esto", "quiero", "tienes", "puedes", "sobre", "desde", "pero", "con", "sin", "unos", "unas", "producto", "productos", "portatil", "recargable", "unidad", "unidades"]);
function words(value: string) {
  return new Set((normalizeText(value).match(/[a-z]{4,}/g) ?? []).filter((word) => !genericWords.has(word)));
}

function editDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return row[b.length];
}

// Tolera errores de transcripción o de tipeo en el nombre del producto.
function wordMatches(titleWord: string, current: Set<string>) {
  if (current.has(titleWord)) return true;
  if (titleWord.length < 6) return false;
  const limit = titleWord.length >= 9 ? 2 : 1;
  return [...current].some((word) => word.length >= 5 && editDistance(word, titleWord) <= limit);
}

export function explicitProduct(products: CatalogProduct[], currentMessage: string): CatalogProduct | null {
  const current = words(currentMessage);
  const pick = (match: (word: string) => boolean) => {
    const scored = products.map((product) => ({ product, score: [...words(product.title)].filter(match).length }));
    const top = Math.max(0, ...scored.map((item) => item.score));
    if (!top) return { top, winner: null as CatalogProduct | null };
    const winners = scored.filter((item) => item.score === top);
    return { top, winner: winners.length === 1 ? winners[0].product : null };
  };
  const exact = pick((word) => current.has(word));
  if (exact.winner) return exact.winner;
  // Sin coincidencia exacta única: se intenta con palabras parecidas.
  return exact.top ? null : pick((word) => wordMatches(word, current)).winner;
}

export function resolveProduct(products: CatalogProduct[], currentMessage: string, rememberedTitle: string): CatalogProduct | null {
  const current = explicitProduct(products, currentMessage);
  if (current) return current;
  const messageWords = words(currentMessage);
  if (products.some((product) => [...words(product.title)].some((word) => messageWords.has(word)))) return null;
  if (!isProductFollowup(currentMessage)) return null;
  return products.find((product) => product.title === rememberedTitle) ?? null;
}

export function isCatalogRequest(message: string) {
  return /\b(catalogo|productos|que (?:mas|otros) (?:tienen|venden)|todos los que|otro mas|solo esos|que venden)\b/.test(normalizeText(message));
}

export function isProductFollowup(message: string) {
  if (isCatalogRequest(message)) return false;
  return /\b(verla|verlo|imagen|foto|muestrame|ensename|como es|como se ven?|detalles|caracteristicas|precio|cuanto cuesta|lo compro|la compro|comprarlo|comprarla|me interesa|puedo)\b/.test(normalizeText(message));
}

export function isProductInquiry(message: string) {
  if (isCatalogRequest(message)) return false;
  return /\b(como es|como se ven?|ver|verla|verlo|imagen|foto|detalles|caracteristicas|precio|cuanto|tienes|tienen|tiene|hay|disponible|disponibles|vend(?:en|es)|quiero|sobre|muestrame|ensename)\b/.test(normalizeText(message));
}

export function isLocationQuestion(message: string) {
  return /\b(local|tienda fis|direccion|ubicacion|ubicados|donde estan|donde queda|presencial)\b/.test(normalizeText(message));
}

export function isBusinessQuestion(message: string) {
  return /\b(local|tienda fis|direccion|ubicacion|ubicados|donde estan|donde queda|presencial|horario|atencion|delivery|envio|entrega|pago|garantia|devolucion|reclamo|asesor|contacto)\b/.test(normalizeText(message));
}

export function isFreshCommercialIntent(message: string, productTitles: string[]) {
  const text = normalizeText(message);
  if (/\b(reclamo|queja|devolucion|defectuoso|defectuosa|no llego|llego tarde|llego.*despues|llego.*dias|pedido retrasado|retraso)\b/.test(text)) return false;
  if (/\b(quiero|quisiera|deseo|me gustaria|busco)\s+(?:(?:ver|conocer|comprar|adquirir)\s+)?(?:otro producto|un producto|comprar|adquirir)\b/.test(text)) return true;
  if (isCatalogRequest(message) && /\b(catalogo|productos|otro producto|que venden)\b/.test(text)) return true;
  return explicitProduct(productTitles.map((title) => ({ title, content: "", mediaUrl: null })), message) !== null;
}

export function isIndependentQuestion(message: string) {
  const text = normalizeText(message);
  if (/\b(reclamo|queja|mi pedido|numero de pedido|entrega|retraso|demora|llego|defectuos[oa]|asesor|contestar|responder|respuesta|sigues|alguien|atienden)\b/.test(text)) return false;
  return /\?/.test(message) || /\b(tienen|venden|horario|ubicacion|local|catalogo)\b/.test(text);
}

export function finishWithQuestion(answer: string, question: string) {
  const clean = answer.trim();
  if (!clean) return question;
  return /\?\s*$/.test(clean) ? clean : `${clean} ${question}`;
}

// Texto de venta determinista a partir de la ficha aprobada (precio y capas), sin inventar nada.
export function productBlurb(product: CatalogProduct) {
  const clean = product.content.replace(/\s+/g, " ").trim();
  return clean.length <= 330 ? clean : `${clean.slice(0, 330).replace(/[^.]*$/, "").trim() || clean.slice(0, 330)}`;
}

export function productMenu(products: CatalogProduct[]) {
  return products.map((product) => {
    const price = /S\/\s?\d+(?:[.,]\d+)?/.exec(product.content)?.[0];
    return price ? `${product.title} (${price})` : product.title;
  }).join(", ");
}

// Detecta si el cliente nombra una zona de entrega configurada (src/lib/brand.ts → DELIVERY_ZONES).
export function findDistrict(message: string, zones: { covered: string[]; notCovered: string[] } = { covered: [], notCovered: [] }): { name: string; covered: boolean } | null {
  const text = normalizeText(message);
  const has = (name: string) => new RegExp(`\\b${normalizeText(name)}\\b`).test(text);
  for (const name of zones.covered) if (has(name)) return { name, covered: true };
  for (const name of zones.notCovered) if (has(name)) return { name, covered: false };
  return null;
}
