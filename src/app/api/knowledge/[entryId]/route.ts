import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { parseKnowledgeInput } from "@/lib/knowledge-input";

export async function PATCH(request: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const body = await request.json().catch(() => null);
  const input = parseKnowledgeInput(body);
  if (!input) return NextResponse.json({ error: "Revisa título, contenido, estado y URL de imagen." }, { status: 400 });

  // Los clientes antiguos sin versión mantienen el comportamiento anterior.
  const expectedVersion = typeof body?.version === "number" && Number.isSafeInteger(body.version) ? body.version : null;
  const rows = await db()`UPDATE knowledge_entries
    SET title=${input.title}, category=${input.category}, content=${input.content}, status=${input.status},
        media_url=${input.mediaUrl}, version=version+1, updated_at=now()
    WHERE id=${entryId} AND (${expectedVersion}::integer IS NULL OR version=${expectedVersion})
    RETURNING id::text AS id, title, category, content, status, version,
              media_url AS "mediaUrl", updated_at AS "updatedAt"`;
  if (rows[0]) return NextResponse.json(rows[0]);

  const exists = await db()`SELECT 1 FROM knowledge_entries WHERE id=${entryId}`;
  return NextResponse.json({ error: exists.length
    ? "Esta entrada cambió en otra sesión. Recarga la página antes de guardar para no sobrescribirla."
    : "No encontrado." }, { status: exists.length ? 409 : 404 });
}
