# Contexto del proyecto (plantilla CRM WhatsApp + IA)

CRM comercial para WhatsApp con agente de IA. Next.js 15, PostgreSQL, YCloud (WhatsApp) y Google Gemini. Se despliega en EasyPanel con Nixpacks (`nixpacks.toml`); el arranque aplica las migraciones y levanta la app y el trabajador de la cola.

## Reglas de oro
- **El CRM funciona: no alterar la lógica interna sin necesidad.** Cada cambio va en una rama aparte, con `npm test` y `npm run build` antes de subirlo, y se anota aquí.
- Nunca guardar claves en Git. Los valores reales viven en las variables de entorno (`.env.example` lista los nombres).
- Las migraciones (`db/migrations`) son aditivas e idempotentes: no borran datos. Un cambio de esquema = una migración nueva.
- La IA solo usa fichas **publicadas** (`APPROVED`) de la base de conocimiento y solo responde a `AI_TEST_PHONE` mientras esa variable exista.
- No inventar precios, stock, pagos, tiempos ni cobertura: si falta el dato, se deriva al asesor.

## Cómo funciona (resumen)
1. `POST /api/webhook/ycloud` valida la firma, guarda el evento y el mensaje (`persistInboundMessage`) y encola un trabajo en `ai_response_jobs` que vence a los 12 s (agrupa los mensajes del cliente).
2. `src/lib/ai-queue.ts` toma el trabajo, llama a `createGeminiReply` (`src/lib/ai.ts`) y envía texto, imagen del producto y cierre. Tras enviar la foto espera su entrega y la reintenta una vez si falla (`waitForDelivery`).
3. `src/lib/ai.ts`: transcribe audios, identifica imágenes contra el catálogo, detecta intención de compra y arma la respuesta con la base de conocimiento. Si falta información marca `needsHuman` y se crea un seguimiento de prioridad alta.
4. Los estados de entrega llegan por `whatsapp.message.updated` (`persistOutboundStatus`) y los precios por `recordWhatsappPricing`.
5. Solo los pedidos `PAID` cuentan como ventas (`sales_orders`).

## Piezas clave
- Personalización: `src/lib/brand.ts` (nombre, zonas de entrega) y `src/app/brand.css` (colores y fuentes).
- Conocimiento: `/knowledge`; categorías `PRODUCTO`, `REGLAS`, `RESTRICCIONES`, `FORMA_DE_HABLAR`. La ficha `Ubicación y atención` (si está publicada) responde "¿dónde están?" sin derivar.
- Panel: `src/components/MetricsDashboard.tsx` + `/api/analytics`. El costo de IA se calcula al consultar con `GOOGLE_AI_*_COST_PER_MILLION`.
- Campañas Meta: `/campaigns` y `/api/campaigns` (solo lectura): temperatura sugerida (`src/lib/lead-score.ts`) y ventana de 24 h (`WindowChip`). No cambia etapas ni lo que responde la IA.
- Usuarios: administradores y asesores; el asesor solo ve las conversaciones que se le asignan.
- Diagnósticos (administradores, solo lectura): `/api/diagnostics/ai`, `/webhooks`, `/pricing`, `/delivery`.
- `middleware.ts`: todo exige sesión salvo `/login`, el webhook, `/api/health`, `/products/`, `/brand/`.

## Detalles que conviene recordar
- Las fotos de `public/products` deben pesar ~100 KB: WhatsApp las descarga desde `APP_BASE_URL` y puede fallar por tiempo de espera.
- `webhook_events.payload` puede quedar guardado como texto JSON (no objeto): al leerlo con SQL hay que contemplar ambos casos.
- `/api/health` confirma configuración, no entrega real: probar siempre con un mensaje real.
- Los seguimientos se listan en `/api/tasks` con consultas parametrizadas (no pegar valores en el SQL).

## Pruebas
`npm test` (pruebas puras en `tests/`) y `npm run build`. Variables solo por nombre en `.env.example`.
- **Audios:** la transcripción lee todas las partes de la respuesta de Gemini, acepta JSON con cercas o texto alrededor, reintenta una vez y acepta la transcripción aunque el modelo omita `intelligible`. Variable opcional `GOOGLE_AI_AUDIO_MODEL`: modelo de respaldo para el segundo intento (solo se usa si el primero falla). Si no se puede transcribir, queda `AUDIO_NOT_TRANSCRIBED` en la actividad de la conversación con el motivo.
- **Error 402/403/429 de Gemini:** si la IA deja de responder (texto, audio e imágenes), revisa `/api/diagnostics/ai`: un `lastError` con HTTP 402 significa problema de facturación o de la clave de Google AI Studio, no del CRM.
- **Mensajes del celular, pedidos y ventana de anuncio:** los mensajes que el negocio envía desde la app WhatsApp Business llegan como eventos `whatsapp.smb.message.echoes` (activar ese evento en el webhook de YCloud) y se guardan como mensajes salientes de `HUMAN` (`persistBusinessAppMessage`), sin activar la IA. En columnas jsonb escribir siempre `${JSON.stringify(x)}::text::jsonb` (con `::jsonb` solo, el valor se codifica dos veces y los CHECK fallan: los pedidos daban error 500). El chip de ventana muestra la ventana de anuncio (7 días sin costo, estimada hasta que YCloud la confirme) y la de 24 h.
- **Resumen por chat y Análisis IA:** migración 020 (`conversation_summaries`, `ai_insights`). `src/lib/gemini.ts` es el cliente JSON de Gemini (registra su gasto en `ai_usage`). Resumen: `/api/conversations/{id}/summary` + `ConversationSummary` en la ficha del contacto. Análisis: `/insights` y `/api/insights` (solo administradores), tres cortes por día en hora de Lima (mañana 0-12, tarde 12-18, noche 18-24); un corte terminado se analiza una sola vez y el corte en curso se renueva cada 20 min; incluye acciones (abrir chat, crear seguimiento). Costo: unos centavos de dólar al día.

