// Cortes del día para el análisis de la IA, en hora de Lima (UTC-5, sin horario de verano).
export type Slot = "MORNING" | "AFTERNOON" | "NIGHT";
export type SlotStatus = "FUTURE" | "CURRENT" | "DONE";

export const SLOTS: Array<{ id: Slot; label: string; startHour: number; endHour: number }> = [
  { id: "MORNING", label: "Mañana", startHour: 0, endHour: 12 },
  { id: "AFTERNOON", label: "Tarde", startHour: 12, endHour: 18 },
  { id: "NIGHT", label: "Noche", startHour: 18, endHour: 24 },
];

const HOUR = 3600_000;

export function limaDay(date: Date = new Date()) {
  return new Date(date.getTime() - 5 * HOUR).toISOString().slice(0, 10);
}

export function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00-05:00`));
}

export function slotWindow(day: string, slot: Slot) {
  const def = SLOTS.find((item) => item.id === slot) ?? SLOTS[0];
  const start = Date.parse(`${day}T00:00:00-05:00`);
  return { from: new Date(start + def.startHour * HOUR), to: new Date(start + def.endHour * HOUR) };
}

export function slotStatus(day: string, slot: Slot, now: Date = new Date()): SlotStatus {
  const { from, to } = slotWindow(day, slot);
  if (now.getTime() < from.getTime()) return "FUTURE";
  return now.getTime() >= to.getTime() ? "DONE" : "CURRENT";
}

export function currentSlot(now: Date = new Date()): Slot {
  const hour = Number(new Date(now.getTime() - 5 * HOUR).toISOString().slice(11, 13));
  return hour < 12 ? "MORNING" : hour < 18 ? "AFTERNOON" : "NIGHT";
}
