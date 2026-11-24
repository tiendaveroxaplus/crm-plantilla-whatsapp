function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function wantsToBuy(customerMessage: string) {
  const customer = normalize(customerMessage);
  if (/\b(no quiero comprar|no voy a comprar|ya no quiero comprar|no me interesa comprar)\b/.test(customer)) return false;
  return /\b(comprar|comprarlo|comprarla|compra|pedido|pedirlo|pedirla|adquirir|lo llevo|la llevo|como compro)\b/.test(customer);
}

export function requestedProductAsset(customerMessage: string, lastAssistantMessage = "") {
  // El marcador interno del webhook describe un archivo recibido; no es una petición de foto.
  const customer = normalize(customerMessage).replace(/\[imagen recibida\]/g, "").trim();
  if (wantsToBuy(customer)) return false;
  if (/\b(imagen(?:es)?|foto(?:s)?|fotografia(?:s)?|verla|verlo|verlas|verlos|muestrame|ensename|como se ven?|como luce(?:n)?)\b/.test(customer)) return true;
  if (/\bver\s+(?:el|la|los|las)\s+\S+/.test(customer)) return true;
  const offeredImage = /\b(ver(?:la|lo|las|los)?|imagen(?:es)?|foto(?:s)?|mostrar(?:la|lo|las|los)?)\b/.test(normalize(lastAssistantMessage));
  return offeredImage && /^(?:\s*(?:si|claro|dale|ok|por favor|me gustaria|quisiera|quiero)[\s,.!¡¿?]*)+$/i.test(customer);
}
