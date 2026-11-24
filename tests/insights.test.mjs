import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/insight-slots.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const mod = { exports: {} };
new Function("module", "exports", outputText)(mod, mod.exports);
const { limaDay, isDay, slotWindow, slotStatus, currentSlot } = mod.exports;

test("el día se calcula en hora de Lima (UTC-5)", () => {
  assert.equal(limaDay(new Date("2026-11-11T03:30:00Z")), "2026-11-10");
  assert.equal(limaDay(new Date("2026-11-11T05:00:00Z")), "2026-11-11");
  assert.equal(isDay("2026-11-10"), true);
  assert.equal(isDay("10/11/2026"), false);
});

test("los cortes son mañana 0-12, tarde 12-18 y noche 18-24 en Lima", () => {
  assert.equal(slotWindow("2026-11-10", "MORNING").from.toISOString(), "2026-11-10T05:00:00.000Z");
  assert.equal(slotWindow("2026-11-10", "AFTERNOON").from.toISOString(), "2026-11-10T17:00:00.000Z");
  assert.equal(slotWindow("2026-11-10", "NIGHT").to.toISOString(), "2026-11-11T05:00:00.000Z");
});

test("estado del corte: por llegar, en curso y finalizado", () => {
  const noon = new Date("2026-11-10T19:00:00Z"); // 14:00 en Lima
  assert.equal(slotStatus("2026-11-10", "MORNING", noon), "DONE");
  assert.equal(slotStatus("2026-11-10", "AFTERNOON", noon), "CURRENT");
  assert.equal(slotStatus("2026-11-10", "NIGHT", noon), "FUTURE");
  assert.equal(currentSlot(noon), "AFTERNOON");
  assert.equal(currentSlot(new Date("2026-11-11T03:00:00Z")), "NIGHT");
});
