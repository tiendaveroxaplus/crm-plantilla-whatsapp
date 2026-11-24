// Seguimiento acotado: no ofrece productos, soluciones ni plazos mientras espera un asesor.
export function isClosingMessage(message: string) {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(quiero|necesito|puedes|cuanto|donde|como|comprar|precio|imagen|foto|consulta|pregunta|pero|ademas|tambien)\b/.test(text) &&
    !/\b(nada mas|eso es todo|ya esta|espero entonces)\b/.test(text)) return false;
  return /\b(nada mas|ninguno|ninguna|no hay mas|eso es todo|ya esta|espero entonces|quedo a la espera|gracias|muchas gracias|listo|no te preocupes)\b/.test(text);
}

export function escalationFollowup(message: string, orderAlreadyRequested: boolean, previousReply = ""): string | null {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const closed = isClosingMessage(message);
  if (closed) return /\b(gracias|quedo a la espera|ya esta|nada mas|ninguno|ninguna|eso es todo|espero entonces)\b/i.test(previousReply)
    ? null : "Gracias, ya dejé tu caso pendiente para el asesor. Por ahora no necesitas enviar más datos; te atenderán por este chat.";
  const delayed = /(?:llego|entrega|pedido|producto).{0,45}(?:tarde|retras|despues|dias?)/.test(text) ||
    /(?:tarde|retras|despues|dias?).{0,45}(?:llego|entrega|pedido|producto)/.test(text);
  const buying = /(?:quiero|deseo|me gustaria|busco).{0,35}(?:comprar|otro producto|pedir)/.test(text);
  const hasOrder = /(?:pedido|orden|compra)\s*(?:n[úu]mero|nro\.?|#|:)?\s*[A-Z0-9-]{5,}/i.test(message);
  let answer: string;
  if (delayed && buying) answer = orderAlreadyRequested
    ? "Recibí lo que me cuentas sobre el retraso y tu interés en otro producto. Ambos temas siguen pendientes del asesor por este chat."
    : "Recibí lo que me cuentas sobre el retraso y que también te interesa otro producto. Dejé ambos temas para que un asesor los revise por este chat. ¿Puedes compartir el número de pedido?";
  else if (delayed) answer = orderAlreadyRequested
    ? "Gracias por contarme lo ocurrido con la entrega. Añadí ese detalle al reclamo pendiente del asesor."
    : "Gracias por contarme lo ocurrido con la entrega. Lo añadí al reclamo para que un asesor lo revise por este chat. ¿Puedes compartir el número de pedido?";
  else if (buying) answer = "También registré tu interés en otro producto para que el asesor te ayude con ambos temas por este chat. ¿Qué producto te interesa?";
  else if (hasOrder) answer = "Gracias, agregué ese dato al caso para que el asesor lo revise por este chat. ¿Hay algún otro detalle importante que quieras compartir?";
  else if (/reclamo|mi caso|asesor|contest|respon|hola|sigues|alguien|atiend/.test(text)) answer = "Sí, recibí tu mensaje. El reclamo sigue pendiente de un asesor por este chat.";
  else answer = orderAlreadyRequested
    ? "Recibí la información y la añadí al caso pendiente del asesor por este chat."
    : "Recibí la información y la añadí al caso para que un asesor la revise por este chat. ¿Puedes compartir el número de pedido si lo tienes?";
  return answer === previousReply.trim()
    ? "Recibí también este nuevo mensaje. El caso permanece pendiente de un asesor por este chat."
    : answer;
}
