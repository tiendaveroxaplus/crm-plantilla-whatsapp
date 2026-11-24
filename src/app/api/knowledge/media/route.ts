import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { knowledgeImageType, knowledgeMediaConfig, MAX_KNOWLEDGE_IMAGE_BYTES } from "@/lib/knowledge-media";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ configured: Boolean(knowledgeMediaConfig()), maxBytes: MAX_KNOWLEDGE_IMAGE_BYTES, formats: ["JPEG", "PNG"] });
}

export async function POST(request: Request) {
  const config = knowledgeMediaConfig();
  if (!config) return NextResponse.json({ error: "La carga de imágenes aún no está configurada en EasyPanel." }, { status: 503 });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_KNOWLEDGE_IMAGE_BYTES + 64 * 1024) return NextResponse.json({ error: "La imagen supera el límite de 5 MB." }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "No se pudo leer la imagen." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_KNOWLEDGE_IMAGE_BYTES) {
    return NextResponse.json({ error: "Selecciona una imagen JPEG o PNG de hasta 5 MB." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = knowledgeImageType(bytes);
  if (!image || file.type !== image.mime) return NextResponse.json({ error: "El archivo debe ser una imagen JPEG o PNG válida." }, { status: 400 });
  const key = `products/${randomUUID()}.${image.extension}`;
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: bytes,
      ContentType: image.mime,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return NextResponse.json({ url: `${config.publicBase}/${key}` });
  } catch {
    return NextResponse.json({ error: "No se pudo subir la imagen. Revisa la configuración del almacenamiento." }, { status: 502 });
  } finally { client.destroy(); }
}
