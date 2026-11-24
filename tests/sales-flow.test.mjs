import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  new Function("module", "exports", outputText)(mod, mod.exports);
  return mod.exports;
}
const { explicitProduct, isProductInquiry, productBlurb, productMenu, findDistrict } = load("../src/lib/agent-context.ts");
const { requestedProductAsset } = load("../src/lib/product-intent.ts");

const products = [
  { title: "Zapatillas Runner", content: "Precio: S/26 (precio regular S/30). Zapatillas livianas para correr, con 3 colores.", mediaUrl: "/products/zapatillas.jpg" },
  { title: "Mochila Urbana", content: "Precio: S/23 (precio regular S/28). Mochila resistente de 20 litros.", mediaUrl: "/products/mochila.jpg" },
  { title: "Camisa Clásica", content: "Precio: S/18. Camisa de algodón.", mediaUrl: "/products/camisa.jpg" },
];

test("'¿Tiene zapatillas runner?' identifica el producto y cuenta como consulta de producto", () => {
  assert.equal(explicitProduct(products, "Tiene zapatillas runner?").title, "Zapatillas Runner");
  assert.equal(isProductInquiry("Tiene zapatillas runner?"), true);
  assert.equal(isProductInquiry("¿Hay de la mochila?"), true);
});

test("el detalle de venta sale de la ficha aprobada y el menú lista precios", () => {
  assert.match(productBlurb(products[0]), /S\/26/);
  assert.match(productBlurb(products[0]), /3 colores/);
  assert.equal(productMenu(products), "Zapatillas Runner (S/26), Mochila Urbana (S/23), Camisa Clásica (S/18)");
});

test("detecta la zona de entrega configurada y si hay cobertura", () => {
  const zones = { covered: ["Zona Sur", "Zona Norte"], notCovered: ["Zona Lejana"] };
  assert.deepEqual(findDistrict("Estoy en zona sur", zones), { name: "Zona Sur", covered: true });
  assert.deepEqual(findDistrict("vivo en la zona norte", zones), { name: "Zona Norte", covered: true });
  assert.deepEqual(findDistrict("estoy en la Zona Lejana", zones), { name: "Zona Lejana", covered: false });
  assert.equal(findDistrict("hola", zones), null);
  assert.equal(findDistrict("estoy en zona sur"), null);
});

test("'¿Cómo se ven?' cuenta como pedido de foto", () => {
  assert.equal(requestedProductAsset("Como se ven?"), true);
  assert.equal(requestedProductAsset("Tienes imagen?"), true);
  assert.equal(requestedProductAsset("quiero comprar"), false);
});

test("tolera errores de transcripción al nombrar el producto", () => {
  assert.equal(explicitProduct(products, "¿Cuánto cuestan las zapatilas runer?").title, "Zapatillas Runner");
  assert.equal(explicitProduct(products, "quiero la mochila urvana").title, "Mochila Urbana");
  assert.equal(explicitProduct(products, "hola buenas"), null);
});
