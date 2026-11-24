export const FREE_SERVICE_ALLOWANCE = 1000;
export const FREE_ENTRY_DAYS = 7;
export const PERU_SERVICE_REFERENCE_USD = 0.03;

type Referral = { source_type?: unknown; source_id?: unknown; headline?: unknown } | null | undefined;

export function classifyReferral(referral: Referral) {
  if (!referral || typeof referral !== "object") return null;
  const type = typeof referral.source_type === "string" ? referral.source_type.toLowerCase() : "";
  if (type !== "ad" && type !== "post") return null;
  return {
    source: type === "ad" ? "META_AD" : "META_POST",
    sourceId: typeof referral.source_id === "string" ? referral.source_id.slice(0, 200) : null,
    headline: typeof referral.headline === "string" ? referral.headline.slice(0, 240) : null,
  };
}

export function entryExpiry(start: Date) {
  return new Date(start.getTime() + FREE_ENTRY_DAYS * 86400000);
}

export function serviceAllowance(freeDelivered: number) {
  const used = Math.min(FREE_SERVICE_ALLOWANCE, Math.max(0, freeDelivered));
  return { used, remaining: FREE_SERVICE_ALLOWANCE - used, percent: Math.round(used / FREE_SERVICE_ALLOWANCE * 100) };
}
