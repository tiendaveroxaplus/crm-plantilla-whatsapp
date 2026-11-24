export function normalizeCustomerText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isComplaint(value: string) {
  const text = normalizeCustomerText(value);
  return /\b(reclamo|reclamar|queja|quejarme|denuncia|reembolso|devolucion|me cobraron mal|cobro indebido|pedido no llego|producto (?:llego mal|fallo|defectuoso)|vino roto|llego roto|(?:quiero|necesito) hablar con (?:(?:un|una) )?asesor|con quien puedo comunicarme)\b/.test(text);
}

export function needsHumanForUnknown(answer: string, modelRequestedHandoff: unknown) {
  if (modelRequestedHandoff === true) return true;
  const text = normalizeCustomerText(answer);
  return /\b(permiteme verificarlo|voy a verificarlo|no tengo (?:esa )?informacion|no cuento con (?:esa )?informacion|no (?:tengo|cuento con) (?:una )?confirmacion|no (?:esta|estan) confirmad|no puedo confirmarlo|tendria que confirmarlo|consultarlo con (?:un|una) asesor)\b/.test(text);
}

export function parseAudioTranscript(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const result = value as { transcript?: unknown; intelligible?: unknown };
  // Solo se descarta si el modelo dice explícitamente que no se entiende; si omite el campo, vale la transcripción.
  if (result.intelligible === false || typeof result.transcript !== "string") return null;
  const transcript = result.transcript.trim().replace(/\s+/g, " ").slice(0, 2000);
  if (transcript.length < 2 || /^(?:audio recibido|inaudible|no se entiende|sin voz|silencio)$/i.test(transcript)) return null;
  return transcript;
}
