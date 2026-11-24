import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function loadPureTypeScript(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function("module", "exports", outputText)(module, module.exports);
  return module.exports;
}

const { requestedProductAsset, wantsToBuy } = loadPureTypeScript("../src/lib/product-intent.ts");
const { parseKnowledgeInput } = loadPureTypeScript("../src/lib/knowledge-input.ts");
const { resolveProduct, isCatalogRequest, isProductInquiry, isLocationQuestion, isBusinessQuestion, isFreshCommercialIntent, isIndependentQuestion, finishWithQuestion } = loadPureTypeScript("../src/lib/agent-context.ts");
const { isComplaint, needsHumanForUnknown, parseAudioTranscript } = loadPureTypeScript("../src/lib/agent-escalation.ts");
const { escalationFollowup, isClosingMessage } = loadPureTypeScript("../src/lib/escalation-followup.ts");
const products = [
  { title: "Zapatillas Runner", content: "Par", mediaUrl: "/products/zapatillas.png" },
  { title: "Mochila Urbana", content: "Ligera", mediaUrl: "/products/mochila.png" },
  { title: "Camisa Clásica", content: "Algodón", mediaUrl: "/products/camisa.png" },
];

test("no confunde intención de compra con una foto ofrecida antes", () => {
  const message = "Me gusta\nQuiero comprar\n¿Cómo hago?";
  assert.equal(wantsToBuy(message), true);
  assert.equal(requestedProductAsset(message, "¿Te gustaría verla?"), false);
  assert.equal(wantsToBuy("No quiero comprar las zapatillas"), false);
});

test("una imagen entrante no solicita otra foto del catálogo", () => {
  assert.equal(requestedProductAsset("[Imagen recibida]\n¿Esto tienes?", "Imagen de Zapatillas Runner"), false);
});

test("sí reconoce solicitudes explícitas y afirmativas de imagen", () => {
  assert.equal(requestedProductAsset("Quisiera verla"), true);
  assert.equal(requestedProductAsset("Sí", "¿Te gustaría verla?"), true);
  assert.equal(requestedProductAsset("Quiero ver sobre las zapatillas"), false);
});

test("solo acepta fichas de conocimiento válidas y URL de imagen segura", () => {
  const entry = { title: "Producto", category: "PRODUCTO", content: "Ficha aprobada", status: "APPROVED", mediaUrl: "/products/producto.png" };
  assert.equal(parseKnowledgeInput(entry)?.mediaUrl, "/products/producto.png");
  assert.equal(parseKnowledgeInput({ ...entry, mediaUrl: "http://inseguro.example/imagen.png" }), null);
  assert.equal(parseKnowledgeInput({ ...entry, mediaUrl: "/products/../privado.png" }), null);
});

test("el producto mencionado ahora prevalece sobre la memoria anterior", () => {
  assert.equal(resolveProduct(products, "La mochila en imagen", products[0].title)?.title, products[1].title);
  assert.equal(resolveProduct(products, "La camisa. ¿Cómo es?", products[0].title)?.title, products[2].title);
});

test("consulta ajena al catálogo no hereda el producto de antes", () => {
  assert.equal(resolveProduct(products, "¿Tienen servicio de instalación?", products[0].title), null);
  assert.equal(resolveProduct(products, "Quiero verla en imagen", products[0].title)?.title, products[0].title);
});

test("petición de catálogo no se confunde con otra foto", () => {
  assert.equal(isCatalogRequest("Dime tus productos. Todos los que tienes"), true);
  assert.equal(resolveProduct(products, "Otro más, o solo esos dos", products[1].title), null);
  assert.equal(isProductInquiry("Quiero ver cómo son las zapatillas"), true);
  assert.equal(finishWithQuestion("No vendemos eso.", "¿Buscas otro producto?"), "No vendemos eso. ¿Buscas otro producto?");
});

test("un reclamo cambia la prioridad aunque antes se hablara de un producto", () => {
  assert.equal(isComplaint("Quiero hacer un reclamo. ¿Con quién puedo comunicarme?"), true);
  assert.equal(isComplaint("Y para el reclamo?"), true);
  assert.equal(isComplaint("¿Cuánto cuesta la camisa?"), false);
});

test("información no confirmada solicita asesor en lugar de dejar al cliente esperando", () => {
  assert.equal(needsHumanForUnknown("Permíteme verificarlo para confirmarte.", false), true);
  assert.equal(needsHumanForUnknown("No tengo una confirmación de local físico.", false), true);
  assert.equal(needsHumanForUnknown("La tienda es online.", false), false);
  assert.equal(needsHumanForUnknown("Otra respuesta", true), true);
});

test("audio ininteligible no se transforma en la consulta anterior", () => {
  assert.equal(parseAudioTranscript({ intelligible: false, transcript: "zapatillas" }), null);
  assert.equal(parseAudioTranscript({ intelligible: true, transcript: "" }), null);
  assert.equal(parseAudioTranscript({ intelligible: true, transcript: "Quiero saber sobre la camisa" }), "Quiero saber sobre la camisa");
});

test("seguimiento escalado reconoce reclamo y nuevo interés sin volver a vender", () => {
  const response = escalationFollowup("el producto llegó 4 días después\nquiero comprar otro producto\nme puedes contestar?", true);
  assert.match(response, /retraso/);
  assert.match(response, /otro producto/);
  assert.match(response, /asesor/);
  assert.doesNotMatch(response, /S\/\d+|coordinar la compra/i);
});

test("seguimiento escalado acusa nuevos detalles y pide datos faltantes", () => {
  assert.match(escalationFollowup("Me puedes contestar?", true), /recibí tu mensaje/);
  assert.match(escalationFollowup("El producto llegó 4 días después", false), /número de pedido/);
  assert.match(escalationFollowup("Quiero comprar otro producto", false), /Qué producto te interesa/);
  const prior = escalationFollowup("Me puedes contestar?", true);
  assert.notEqual(escalationFollowup("Me puedes contestar?", true, prior), prior);
});

test("una pregunta de ubicación, incluso con errata, no es interés por la foto anterior", () => {
  assert.equal(isLocationQuestion("Ustwdws tienwn local fisixo?"), true);
  assert.equal(isBusinessQuestion("¿Qué horario de atención tienen?"), true);
  assert.equal(isFreshCommercialIntent("Ustwdws tienwn local fisixo?", products.map((item) => item.title)), false);
  assert.equal(isFreshCommercialIntent("Quiero comprar otro producto", products.map((item) => item.title)), true);
  assert.equal(isFreshCommercialIntent("Quiero ver otro producto", products.map((item) => item.title)), true);
  assert.equal(isFreshCommercialIntent("La mochila urbana", products.map((item) => item.title)), true);
  assert.equal(isFreshCommercialIntent("La mochila llegó 4 días después", products.map((item) => item.title)), false);
  assert.equal(isIndependentQuestion("¿Tienen catálogo?"), true);
  assert.equal(isIndependentQuestion("¿Y mi reclamo?"), false);
  assert.equal(isIndependentQuestion("¿Me puedes contestar?"), false);
});

test("al cerrar un reclamo deja de pedir datos y no silencia una compra nueva", () => {
  const closing = escalationFollowup("Nada más. Espero entonces", true);
  assert.match(closing, /no necesitas enviar más datos/i);
  assert.doesNotMatch(closing, /\?/);
  assert.equal(escalationFollowup("Gracias", true, closing), null);
  assert.equal(isClosingMessage("Gracias, quiero comprar otro producto"), false);
  assert.equal(isClosingMessage("Gracias, tengo otra consulta"), false);
  assert.doesNotMatch(escalationFollowup("¿Y mi reclamo?", true), /\?/);
});

test("la transcripción vale aunque el modelo omita 'intelligible', y se descarta si dice que no se entiende", () => {
  assert.equal(parseAudioTranscript({ transcript: "Hola, quiero información" }), "Hola, quiero información");
  assert.equal(parseAudioTranscript({ transcript: "Sí" }), "Sí");
  assert.equal(parseAudioTranscript({ intelligible: false, transcript: "ruido" }), null);
  assert.equal(parseAudioTranscript({ intelligible: true, transcript: "" }), null);
});
