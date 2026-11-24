import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/knowledge-media.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const module = { exports: {} };
new Function("module", "exports", outputText)(module, module.exports);
const { knowledgeImageType, knowledgeMediaConfig, MAX_KNOWLEDGE_IMAGE_BYTES } = module.exports;

test("acepta solo firmas JPEG y PNG para la carga de productos", () => {
  assert.deepEqual(knowledgeImageType(Uint8Array.from([255, 216, 255, 1])), { mime: "image/jpeg", extension: "jpg" });
  assert.deepEqual(knowledgeImageType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1])), { mime: "image/png", extension: "png" });
  assert.equal(knowledgeImageType(Uint8Array.from([71, 73, 70, 56])), null);
  assert.equal(MAX_KNOWLEDGE_IMAGE_BYTES, 5 * 1024 * 1024);
});

test("sin configuración externa la carga queda desactivada", () => {
  const keys = ["MEDIA_S3_ENDPOINT", "MEDIA_S3_BUCKET", "MEDIA_S3_ACCESS_KEY_ID", "MEDIA_S3_SECRET_ACCESS_KEY", "MEDIA_PUBLIC_BASE_URL"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(knowledgeMediaConfig(), null);
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
