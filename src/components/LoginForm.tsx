"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";

export default function LoginForm() {
  const router = useRouter(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); try { const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); if (!response.ok) { setError((await response.json()).error ?? "No se pudo iniciar sesión."); return; } router.replace("/"); router.refresh(); } catch { setError("No se pudo conectar con el CRM."); } finally { setLoading(false); } }
  return <main className="login-page"><form className="login-card" onSubmit={submit}><strong className="login-brand">{BRAND.name}</strong><p>CRM · WHATSAPP</p><h1>Ingresa a tu bandeja</h1><label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error ? <div className="login-error">{error}</div> : null}<button disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</button></form></main>;
}
