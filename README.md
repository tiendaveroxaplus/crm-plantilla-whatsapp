# CRM de WhatsApp con IA · Plantilla de la comunidad

CRM listo para usar con **WhatsApp (YCloud)**, **agente de IA (Google Gemini)** y **PostgreSQL**, hecho con Next.js. Es una plantilla **neutral**: pones tu nombre, tus productos y tus reglas, y tu asistente empieza a atender, clasificar leads y llevar al cliente a la venta.

## Qué incluye
- **Bandeja de conversaciones** con control IA / humano, notas, etiquetas, seguimientos y pedidos desde el chat.
- **Agente de IA** que entiende **texto, audios e imágenes**, agrupa los mensajes del cliente (espera 12 s de silencio y responde una sola vez), envía la **foto del producto**, y deriva a un asesor cuando no tiene el dato.
- **Base de conocimiento** (`/knowledge`): productos con foto, reglas, voz de la marca. La IA solo usa fichas publicadas.
- **Panel de ventas**, **Oportunidades** (embudo), **Contactos**, **Seguimientos** y **Campañas Meta** (leads de anuncios de Facebook/Instagram, temperatura sugerida y **ventana de 24 h** para escribir).
- **Usuarios y asesores**, ventas pagadas con atribución IA/asesor, costos de IA y de WhatsApp.
- Pruebas automáticas (`npm test`) y diagnósticos de solo lectura para administradores.

## Lo que necesitas
Cuenta de GitHub, un VPS (Hostinger u otro) con **EasyPanel**, una cuenta de **YCloud** con tu número de WhatsApp, una clave de **Google AI Studio** y, idealmente, un dominio o el subdominio gratuito de EasyPanel (necesita HTTPS).

## Paso a paso
1. **Usa esta plantilla**: botón *Use this template* → *Create a new repository* → privado.
2. **Servidor**: instala EasyPanel en tu VPS (Ubuntu 22.04/24.04, 2 GB de RAM mínimo, mejor 4 GB) y crea un proyecto.
3. **Base de datos**: en el proyecto, *+ Service → Postgres*. Copia la *URL de conexión interna* (será `DATABASE_URL`). Redis es opcional: el flujo no depende de él.
4. **App**: *+ Service → App* → Source *GitHub* (con un token de acceso fino de solo lectura sobre tu repo: *Settings → Developer settings → Fine-grained tokens*, permiso *Contents: Read-only*) → rama `main` → Build *Nixpacks*. Dominio: puerto `3000` con HTTPS.
5. **Variables de entorno** (pestaña *Entorno*, copia de `.env.example`):

| Variable | Qué poner |
|---|---|
| `DATABASE_URL` | URL interna de tu Postgres |
| `AUTH_SECRET` | secreto largo: `openssl rand -hex 32` |
| `CRM_ADMIN_EMAIL` / `CRM_ADMIN_PASSWORD` | tu acceso de administrador |
| `CRM_BRAND_NAME` | nombre con el que se presenta el asistente |
| `APP_BASE_URL` | `https://tu-dominio` (sin barra final; de aquí se descargan las fotos) |
| `YCLOUD_API_KEY`, `YCLOUD_WHATSAPP_NUMBER`, `YCLOUD_WEBHOOK_SECRET` | de tu cuenta YCloud (paso 7) |
| `GOOGLE_AI_API_KEY`, `GOOGLE_AI_MODEL` | clave y modelo (p. ej. `gemini-3.5-flash-lite`) |
| `GOOGLE_AI_INPUT_COST_PER_MILLION`, `GOOGLE_AI_OUTPUT_COST_PER_MILLION`, `USD_TO_PEN_EXCHANGE_RATE` | tarifas de Google y tipo de cambio, para el costo del panel |
| `AI_TEST_PHONE` | tu número de prueba: **la IA solo responde a este número** hasta que lo retires |
| `MEDIA_S3_*`, `MEDIA_PUBLIC_BASE_URL` | opcional: subir fotos desde el CRM a un bucket (R2/S3) |

6. **Implementar**. En los registros verás `Migración aplicada: 001…018`. Abre `https://tu-dominio/api/health`: base `ok`, YCloud y IA `configured`.
7. **YCloud**: vincula tu número, crea la *API Key* y un **webhook** a `https://tu-dominio/api/webhook/ycloud` con los eventos `whatsapp.inbound_message.received` y `whatsapp.message.updated`. Copia el *secret* a `YCLOUD_WEBHOOK_SECRET` y reimplementa.

## Personaliza tu negocio (sin tocar la lógica)
- **Nombre**: `src/lib/brand.ts` (menú, login, título).
- **Colores y tipografías**: variables de `:root` en `src/app/brand.css`.
- **Logo (opcional)**: súbelo a `public/` y úsalo en `AppSidebar.tsx` y `LoginForm.tsx`.
- **Zonas de entrega (opcional)**: `DELIVERY_ZONES` en `src/lib/brand.ts`.
- **Conocimiento**: entra a `/knowledge` y completa las fichas base (*Acerca del negocio*, *Ubicación y atención*, *Cobertura de entrega*), crea tus productos con precio real y **publícalos**. Archiva el *Producto de ejemplo*. Las fichas en borrador no las usa la IA.
- **Fotos de productos**: súbelas desde `/knowledge` (con bucket) o ponlas en `public/products/` y usa la ruta `/products/archivo.jpg`. Usa **JPG de ~100 KB (800 px de ancho)**: WhatsApp debe descargarlas rápido.

## Verifica antes de entregar
- `npm test` y `npm run build` sin errores.
- Desde `AI_TEST_PHONE`: tres frases seguidas → una sola respuesta que las considere todas.
- Pide la foto de un producto publicado (debe llegar el archivo, antes del mensaje de cierre).
- Envía un audio y una foto: debe responder a su contenido.
- Pregunta algo sin ficha publicada: debe decirlo y derivar al asesor, sin inventar.
- Escribe "quiero comprar": debe pedir cantidad y zona y dejar el lead como caliente.
- Revisa estados `SENT/DELIVERED/READ/FAILED` en el chat y, si algo falla, `/api/diagnostics/delivery` (administradores).

## Salir a producción
Cuando todo funcione, quita o cambia `AI_TEST_PHONE` para que la IA atienda a todos. La respuesta `ACCEPTED` de YCloud no garantiza la entrega: confirma con los estados.

## Reglas para mejorar la plantilla
Lee `AGENTS.md`: el CRM funciona, así que los cambios deben ser pequeños, probados (`npm test` + `npm run build`) y en una rama aparte.
