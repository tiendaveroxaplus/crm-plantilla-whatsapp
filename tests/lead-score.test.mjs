import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/lead-score.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const module = { exports: {} };
new Function("module", "exports", outputText)(module, module.exports);
const { scoreLead, mergeLevel, serviceWindow, formatLeft } = module.exports;

test("quien dice que quiere comprar queda listo para comprar", () => {
  assert.equal(scoreLead({ texts: ["Hola, quiero pedir 2 unidades"], fromAd: true, inboundCount: 1 }).level, "HOT");
  assert.equal(scoreLead({ texts: ["¿Cómo pago? Tengo Yape"], fromAd: false, inboundCount: 2 }).level, "HOT");
});

test("precio y delivery juntos es caliente; solo precio es potencial", () => {
  assert.equal(scoreLead({ texts: ["¿Cuánto cuesta y llegan a Zona Sur?"], fromAd: true, inboundCount: 1, districts: ["Zona Sur"] }).level, "HOT");
  assert.equal(scoreLead({ texts: ["¿Qué catálogo tienen?"], fromAd: true, inboundCount: 1 }).level, "POTENTIAL");
});

test("un lead de anuncio sin más datos es interesado y uno orgánico nuevo es nuevo", () => {
  assert.equal(scoreLead({ texts: ["Hola"], fromAd: true, inboundCount: 1 }).level, "INTERESTED");
  assert.equal(scoreLead({ texts: ["Hola"], fromAd: false, inboundCount: 1 }).level, "NEW");
});

test("la temperatura solo sube y nunca toca ganado, perdido o pago pendiente", () => {
  assert.equal(mergeLevel("HOT", "NEW"), "HOT");
  assert.equal(mergeLevel("NEW", "POTENTIAL"), "POTENTIAL");
  for (const level of ["WON", "LOST", "PAYMENT_PENDING"]) assert.equal(mergeLevel(level, "HOT"), level);
});

test("la ventana de 24 h se abre, está por cerrarse y se cierra", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.equal(serviceWindow("2026-11-10T08:00:00Z", now).state, "OPEN");
  assert.equal(serviceWindow("2026-11-09T14:00:00Z", now).state, "CLOSING");
  assert.equal(serviceWindow("2026-11-09T11:59:00Z", now).state, "CLOSED");
  assert.equal(serviceWindow(null, now).state, "NONE");
  assert.equal(formatLeft(95 * 60000), "1 h 35 min");
});

test("la ventana de anuncio está activa hasta que vence y se marca como confirmada por YCloud", () => {
  const { freeEntryWindow } = module.exports;
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.deepEqual(freeEntryWindow("2026-11-17T12:00:00Z", null, now), { active: true, msLeft: 7 * 86400000, confirmed: false });
  assert.equal(freeEntryWindow("2026-11-17T12:00:00Z", "2026-11-10T10:00:00Z", now).confirmed, true);
  assert.equal(freeEntryWindow("2026-11-09T12:00:00Z", null, now).active, false);
  assert.equal(freeEntryWindow(null, null, now).active, false);
});
