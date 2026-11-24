export type InboxState = "UNREAD" | "PENDING_REPLY" | "IN_PROGRESS" | "RESPONDED" | "CLOSED";
export type DeliveryStatus = "ACCEPTED" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export interface ConversationPreview {
  id: string;
  contactId?: string;
  contact: string;
  phone: string;
  city?: string | null;
  stage: string;
  leadLevel?: string;
  lastInboundAt?: string | null;
  entrySource?: string;
  referralHeadline?: string | null;
  freeEntryExpiresAt?: string | null;
  freeEntryConfirmedAt?: string | null;
  state: InboxState;
  owner: string | null;
  tags: string[];
  lastMessage: string;
  lastAt: string;
  unread: number;
}

export const DEMO_CONVERSATIONS: ConversationPreview[] = [
  { id: "c-001", contact: "María Paredes", phone: "+51 987 654 321", stage: "Interesado", state: "PENDING_REPLY", owner: "Asesor", tags: ["Producto A", "Lima"], lastMessage: "¿Cuánto demora la entrega?", lastAt: "Hace 3 min", unread: 2 },
  { id: "c-002", contact: "Jorge Ruiz", phone: "+51 912 453 810", stage: "Pago pendiente", state: "UNREAD", owner: null, tags: ["Premium"], lastMessage: "Ya te envié el comprobante", lastAt: "Hace 11 min", unread: 1 },
  { id: "c-003", contact: "Lucía Flores", phone: "+51 944 222 109", stage: "Nuevo lead", state: "IN_PROGRESS", owner: "IA", tags: ["Consulta"], lastMessage: "Me interesa conocer los modelos", lastAt: "Hace 24 min", unread: 0 },
  { id: "c-004", contact: "Carlos Vega", phone: "+51 955 331 882", stage: "Confirmado", state: "RESPONDED", owner: "Asesor", tags: ["Venta"], lastMessage: "Perfecto, gracias por confirmarlo", lastAt: "Ayer", unread: 0 },
];

export const inboxLabels: Record<InboxState, string> = {
  UNREAD: "Sin leer", PENDING_REPLY: "Por responder", IN_PROGRESS: "En gestión", RESPONDED: "Respondida", CLOSED: "Cerrada",
};
