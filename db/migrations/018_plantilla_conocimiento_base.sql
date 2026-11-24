-- Plantilla: voz de marca y fichas base para que cada negocio las complete desde /knowledge.
-- Idempotente y aditiva. Las fichas en DRAFT no las usa la IA hasta que las publiques.

INSERT INTO knowledge_entries (title, category, content, status)
SELECT 'Voz de la marca', 'FORMA_DE_HABLAR', $$Hablar en español, muy cercano, cálido y alegre, tuteando al cliente. Lo primero es ENTENDER al cliente: reconocer lo que dice o siente antes de responder. Mensajes cortos (2 a 4 líneas) con 2 o 3 emojis cálidos (😊 💛 ✨ 👍), sin exagerar. Mostrar el beneficio del producto primero y el precio con claridad. No empujar la compra: ofrecer avanzar solo si el cliente muestra interés, hacer como máximo UNA pregunta por mensaje y no repetir preguntas ya hechas (cantidad, zona, "¿quieres comprar?"). Nunca presionar ni apurar. No hablar mal ni comparar con otras marcas.$$, 'APPROVED'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title = 'Voz de la marca');

INSERT INTO knowledge_entries (title, category, content, status)
SELECT 'Reglas comerciales del negocio', 'REGLAS', $$Responder lo que el cliente pregunta y cerrar con una pregunta útil. Nunca inventar precios, promociones, stock, tiempos, medios de pago ni cobertura: usar solo lo aprobado en esta base y, si falta un dato, decirlo y derivar al asesor. Para cerrar un pedido, pedir producto y cantidad, zona y dirección de entrega, y pasar al asesor para confirmar pago y envío. Si piden "todos los productos" o el catálogo, listar los productos publicados con su precio.$$, 'APPROVED'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title = 'Reglas comerciales del negocio');

INSERT INTO knowledge_entries (title, category, content, status)
SELECT 'Acerca del negocio', 'REGLAS', $$[Completa] Qué vende tu negocio, desde dónde atiende y en qué se diferencia. Ejemplo: "Somos [tu marca]: vendemos [productos]. Atendemos por WhatsApp y entregamos en [zonas]." Publica esta ficha solo cuando la hayas completado.$$, 'DRAFT'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title = 'Acerca del negocio');

INSERT INTO knowledge_entries (title, category, content, status)
SELECT 'Ubicación y atención', 'REGLAS', $$[Completa] Dirección o aclaración de que solo atiendes online, horarios de atención y cómo se hacen los pedidos. Si publicas esta ficha, la IA la usa para responder "¿dónde están ubicados?" sin derivar al asesor.$$, 'DRAFT'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title = 'Ubicación y atención');

INSERT INTO knowledge_entries (title, category, content, status)
SELECT 'Cobertura de entrega', 'REGLAS', $$[Completa] Zonas o distritos a los que entregas y a los que no. No incluyas costos ni tiempos si no están confirmados: la IA derivará esos datos al asesor.$$, 'DRAFT'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title = 'Cobertura de entrega');
