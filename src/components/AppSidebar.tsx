"use client";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";

const items = [
  ["/dashboard", "▣", "Dashboard"], ["/", "◌", "Conversaciones"], ["/campaigns", "✦", "Campañas Meta"], ["/insights", "✺", "Análisis IA"], ["/contacts", "◉", "Contactos"],
  ["/opportunities", "◇", "Oportunidades"], ["/tasks", "✓", "Seguimientos"],
  ["/knowledge", "◈", "Base de conocimiento"],
] as const;
export default function AppSidebar() {
  const pathname = usePathname();
  return <nav className="global-sidebar" aria-label="Navegación principal"><a className="sidebar-brand" href="/" aria-label={BRAND.name}><strong>{BRAND.product}</strong></a><span className="sidebar-tagline">{BRAND.tagline.toUpperCase()}</span>{items.map(([href, icon, label]) => <a key={href} href={href} className={pathname === href ? "active" : ""}><i className="nav-icon">{icon}</i>{label}</a>)}<a href="/settings" className={pathname === "/settings" ? "active" : ""}><i className="nav-icon">⚙</i>Configuración</a><div><i className="online"/>Sistema operativo</div></nav>;
}
