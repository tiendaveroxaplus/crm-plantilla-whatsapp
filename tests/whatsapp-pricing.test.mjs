import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/whatsapp-pricing.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const module = { exports: {} };
new Function("module", "exports", outputText)(module, module.exports);
const { classifyReferral, entryExpiry, serviceAllowance } = module.exports;

test("clasifica un anuncio sin inferir origen cuando falta referral", () => {
  assert.deepEqual(classifyReferral({ source_type: "ad", source_id: "123", headline: "Oferta" }), { source: "META_AD", sourceId: "123", headline: "Oferta" });
  assert.equal(classifyReferral(undefined), null);
  assert.equal(classifyReferral({ source_type: "unknown" }), null);
  assert.equal(classifyReferral({ source_type: "post" }).source, "META_POST");
});

test("calcula siete días exactos y limita la franquicia a mil mensajes", () => {
  assert.equal(entryExpiry(new Date("2026-10-03T12:00:00Z")).toISOString(), "2026-10-10T12:00:00.000Z");
  assert.deepEqual(serviceAllowance(750), { used: 750, remaining: 250, percent: 75 });
  assert.deepEqual(serviceAllowance(1001), { used: 1000, remaining: 0, percent: 100 });
});
