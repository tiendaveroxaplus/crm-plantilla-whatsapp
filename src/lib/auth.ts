import { jwtVerify, SignJWT } from "jose";
import { db } from "@/lib/database";
import { requireEnv } from "@/lib/env";

const SESSION_DURATION_SECONDS = 60 * 60 * 12;

export function authSecret() { return new TextEncoder().encode(requireEnv("AUTH_SECRET")); }

export type SessionUser = { id: string; email: string; role: "ADMIN" | "ADVISOR"; name: string };

export async function createSession(user: SessionUser) {
  return new SignJWT({ email: user.email, role: user.role, name: user.name })
    .setSubject(user.id).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSION_DURATION_SECONDS}s`).sign(authSecret());
}

export const sessionMaxAge = SESSION_DURATION_SECONDS;

export async function getSession(request: Request): Promise<SessionUser | null> {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)crm_session=([^;]+)/)?.[1];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string" || (payload.role !== "ADMIN" && payload.role !== "ADVISOR") || typeof payload.name !== "string") return null;
    return { id: payload.sub, email: payload.email, role: payload.role, name: payload.name };
  } catch { return null; }
}

export async function canAccessConversation(user: SessionUser, conversationId: string) {
  if (user.role === "ADMIN") return true;
  const rows = await db()`SELECT 1 FROM conversations WHERE id=${conversationId} AND assigned_user_id=${user.id} LIMIT 1`;
  return rows.length > 0;
}
