import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { parseKnowledgeInput } from "@/lib/knowledge-input";
export async function GET(){const entries=await db()`SELECT id::text AS id,title,category,content,status,version,media_url AS "mediaUrl",updated_at AS "updatedAt" FROM knowledge_entries ORDER BY updated_at DESC`;return NextResponse.json({entries})}
export async function POST(request:Request){const input=parseKnowledgeInput(await request.json().catch(()=>null));if(!input)return NextResponse.json({error:"Revisa título, contenido, estado y URL de imagen."},{status:400});const rows=await db()`INSERT INTO knowledge_entries(title,category,content,status,media_url) VALUES (${input.title},${input.category},${input.content},${input.status},${input.mediaUrl}) RETURNING id::text AS id`;return NextResponse.json(rows[0],{status:201})}
