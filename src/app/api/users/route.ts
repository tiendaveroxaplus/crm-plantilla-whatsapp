import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/database";
import { hashPassword, validPassword } from "@/lib/user-auth";

async function admin(request: Request) { const user = await getSession(request); return user?.role === "ADMIN" ? user : null; }

export async function GET(request: NextRequest) {
  const user = await getSession(request);
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (request.nextUrl.searchParams.get("assignable") === "1") {
    if (user.role !== "ADMIN") return NextResponse.json({ users: [] });
    const users = await db()`SELECT id::text AS id,display_name AS name,email,role FROM users WHERE active=true ORDER BY display_name`;
    return NextResponse.json({ users });
  }
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Acceso restringido." }, { status: 403 });
  const users = await db()`SELECT id::text AS id,display_name AS name,email,role,active,created_at AS "createdAt" FROM users ORDER BY created_at DESC`;
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  if (!await admin(request)) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = body?.role === "ADMIN" ? "ADMIN" : body?.role === "ADVISOR" ? "ADVISOR" : null;
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 100 || !role || !validPassword(body?.password)) return NextResponse.json({ error: "Completa nombre, correo, rol y una contraseña de al menos 10 caracteres." }, { status: 400 });
  try {
    const rows = await db()`INSERT INTO users(email,display_name,role,password_hash) VALUES (${email},${name},${role},${await hashPassword(body.password)}) RETURNING id::text AS id`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch { return NextResponse.json({ error: "Ese correo ya está registrado." }, { status: 409 }); }
}

export async function PATCH(request: NextRequest) {
  const operator = await admin(request); if (!operator) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const body = await request.json().catch(() => null); const id = typeof body?.id === "string" ? body.id : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : null;
  const role = body?.role === "ADMIN" || body?.role === "ADVISOR" ? body.role : null;
  const active = typeof body?.active === "boolean" ? body.active : null;
  if (!id || (name === null && role === null && active === null && body?.password === undefined)) return NextResponse.json({ error: "No hay cambios válidos." }, { status: 400 });
  if (body?.password !== undefined && !validPassword(body.password)) return NextResponse.json({ error: "La contraseña debe tener al menos 10 caracteres." }, { status: 400 });
  if (id === operator.id && active === false) return NextResponse.json({ error: "No puedes desactivar tu propia cuenta." }, { status: 400 });
  const passwordHash = body?.password !== undefined ? await hashPassword(body.password) : null;
  const rows = await db()`UPDATE users SET display_name=COALESCE(${name},display_name),role=COALESCE(${role},role),active=COALESCE(${active},active),password_hash=COALESCE(${passwordHash},password_hash),updated_at=now() WHERE id=${id} RETURNING id`;
  return rows.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
}
