import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/sales-input.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const module = { exports: {} };
new Function("module", "exports", outputText)(module, module.exports);
const { parseSaleInput } = module.exports;

test("calcula el total de un pedido con varias líneas sin errores de decimales", () => {
  const sale = parseSaleInput({ status: "PAID", closedBy: "AI", items: [
    { name: "Producto A", quantity: 2, unitPricePen: "89.90" },
    { name: "Producto B", quantity: 3, unitPricePen: "0.10" },
  ] });
  assert.equal(sale.totalPen, "180.10");
  assert.equal(sale.items[0].subtotalPen, "179.80");
  assert.equal(sale.closedBy, "AI");
});

test("rechaza cantidades, importes o estados inválidos", () => {
  const base = { status: "PAID", closedBy: "HUMAN", items: [{ name: "Producto", quantity: 1, unitPricePen: "89.00" }] };
  assert.equal(parseSaleInput({ ...base, items: [{ ...base.items[0], quantity: 0 }] }), null);
  assert.equal(parseSaleInput({ ...base, items: [{ ...base.items[0], unitPricePen: "89.999" }] }), null);
  assert.equal(parseSaleInput({ ...base, status: "WON" }), null);
  assert.equal(parseSaleInput({ ...base, items: [] }), null);
});
