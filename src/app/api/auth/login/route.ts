import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession, sessionMaxAge } from "@/lib/auth";
import { db } from "@/lib/database";
import { verifyPassword } from "@/lib/user-auth";

function equal(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expectedEmail = process.env.CRM_ADMIN_EMAIL; const expectedPassword = process.env.CRM_ADMIN_PASSWORD;
  if (!expectedEmail || !expectedPassword) return NextResponse.json({ error: "Acceso aún no configurado." }, { status: 503 });
  try {
    const body = await request.json() as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? ""; const password = body.password ?? "";
    let user: { id: string; email: string; displayName: string; role: "ADMIN" | "ADVISOR" } | null = null;
    if (equal(email, expectedEmail.toLowerCase()) && equal(password, expectedPassword)) {
      const rows = await db()`INSERT INTO users(email,display_name,role,active) VALUES (${email},'Administrador','ADMIN',true)
        ON CONFLICT(email) DO UPDATE SET role='ADMIN',active=true,updated_at=now()
        RETURNING id::text AS id,email,display_name AS "displayName",role`;
      const row = rows[0];
      user = row ? { id: String(row.id), email: String(row.email), displayName: String(row.displayName), role: row.role === "ADVISOR" ? "ADVISOR" : "ADMIN" } : null;
    } else {
      const rows = await db()`SELECT id::text AS id,email,display_name AS "displayName",role,password_hash AS "passwordHash"
        FROM users WHERE email=${email} AND active=true LIMIT 1`;
      const candidate = rows[0];
      if (candidate && await verifyPassword(password, candidate.passwordHash)) user = { id: String(candidate.id), email: String(candidate.email), displayName: String(candidate.displayName), role: candidate.role === "ADMIN" ? "ADMIN" : "ADVISOR" };
    }
    if (!user) return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
    const response = NextResponse.json({ ok: true });
    response.cookies.set("crm_session", await createSession({ id: user.id, email: user.email, role: user.role, name: user.displayName }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: sessionMaxAge, path: "/" });
    return response;
  } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
}
