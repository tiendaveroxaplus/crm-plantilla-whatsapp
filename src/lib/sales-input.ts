export type SaleStatus = "PENDING" | "PAID" | "CANCELLED";
export type SaleCloser = "AI" | "HUMAN" | "UNKNOWN";
export type SaleItem = { name: string; quantity: number; unitPricePen: string; subtotalPen: string };

function cents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export function parseSaleInput(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.items) || !value.items.length || value.items.length > 20) return null;
  const status = value.status;
  const closedBy = value.closedBy;
  if (!["PENDING", "PAID", "CANCELLED"].includes(String(status)) || !["AI", "HUMAN", "UNKNOWN"].includes(String(closedBy))) return null;
  let totalCents = 0;
  const items: SaleItem[] = [];
  for (const raw of value.items) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const quantity = item.quantity;
    const unitCents = cents(item.unitPricePen);
    if (!name || name.length > 180 || typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || unitCents === null) return null;
    const subtotal = unitCents * quantity;
    totalCents += subtotal;
    if (!Number.isSafeInteger(totalCents) || totalCents > 99999999999999) return null;
    items.push({ name, quantity, unitPricePen: (unitCents / 100).toFixed(2), subtotalPen: (subtotal / 100).toFixed(2) });
  }
  return { items, status: status as SaleStatus, closedBy: closedBy as SaleCloser, totalPen: (totalCents / 100).toFixed(2) };
}
