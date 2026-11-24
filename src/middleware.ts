import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/webhook/ycloud", "/api/internal/ai-tick", "/api/health", "/products/", "/brand/", "/icon.png"];
function secret() { return new TextEncoder().encode(process.env.AUTH_SECRET ?? ""); }

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return NextResponse.next();
  const token = request.cookies.get("crm_session")?.value;
  if (!token || !process.env.AUTH_SECRET) return NextResponse.redirect(new URL("/login", request.url));
  try { await jwtVerify(token, secret()); return NextResponse.next(); }
  catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set("crm_session", "", { maxAge: 0, path: "/" });
    return response;
  }
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.svg|icon.png|brand/).*)"] };
