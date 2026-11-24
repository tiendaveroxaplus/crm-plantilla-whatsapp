// Personaliza aquí el nombre de tu negocio: es el único lugar del nombre visible del CRM (menú, login, título).
export const BRAND = {
  name: "Mi Negocio",
  product: "Mi CRM",
  tagline: "WhatsApp + IA",
} as const;

// Zonas de entrega (opcional). Si tu negocio no reparte por distritos, déjalas vacías.
// Ejemplo: covered: ["Zona Norte", "Zona Sur"], notCovered: ["Zona Lejana"]
export const DELIVERY_ZONES = { covered: [] as string[], notCovered: [] as string[] };
