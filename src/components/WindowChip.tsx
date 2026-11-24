"use client";
import { useEffect, useState } from "react";
import { formatLeft, freeEntryWindow, serviceWindow } from "@/lib/lead-score";

// Solo informativo: ventana de anuncio (7 días sin costo) y ventana de 24 h para escribir texto libre.
export default function WindowChip({ lastInboundAt, freeEntryExpiresAt, freeEntryConfirmedAt, long = false }: { lastInboundAt?: string | null; freeEntryExpiresAt?: string | null; freeEntryConfirmedAt?: string | null; long?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  const ad = freeEntryWindow(freeEntryExpiresAt, freeEntryConfirmedAt, now);
  const win = serviceWindow(lastInboundAt, now);
  const adChip = ad.active
    ? <span className="win win-ad" title="Lead de anuncio de Facebook/Instagram: durante esta ventana los mensajes no tienen costo.">{long ? `🎯 Ventana de anuncio · quedan ${formatLeft(ad.msLeft)} · sin costo${ad.confirmed ? "" : " (estimada)"}` : `🎯 ${formatLeft(ad.msLeft)}`}</span>
    : null;
  if (win.state === "NONE") return adChip;
  if (adChip && !long) return adChip;
  if (win.state === "CLOSED") return <>{adChip}<span className="win win-closed" title="Pasaron más de 24 h desde el último mensaje del cliente: solo plantillas aprobadas.">{long ? "Ventana 24 h cerrada · solo plantillas" : "24 h cerrada"}</span></>;
  return <>{adChip}<span className={`win ${win.state === "CLOSING" ? "win-closing" : "win-open"}`} title="Tiempo que queda para escribirle texto libre.">{long ? `Ventana 24 h · quedan ${formatLeft(win.msLeft)}` : `⏱ ${formatLeft(win.msLeft)}`}</span></>;
}
