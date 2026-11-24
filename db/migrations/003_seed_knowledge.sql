-- Base de conocimiento inicial NEUTRAL. Cada negocio carga sus propios productos y reglas desde /knowledge.
INSERT INTO knowledge_entries (title, category, content, status)
SELECT 'Reglas comerciales y de salud', 'REGLAS', $$Responder de forma natural, amable, clara y breve. Responder únicamente lo que el cliente pregunta. Nunca inventar precios, promociones, colores, stock, garantía, pagos, entregas, tiempos de entrega, cambios o devoluciones. Los precios solo son los registrados en esta base. No afirmar que los productos curan enfermedades ni diagnosticar. Ante una condición médica específica, síntomas fuertes o persistentes, recomendar consultar a un profesional de salud. Para información comercial pendiente, explicar que el dato no está confirmado y derivar la consulta a un asesor por este chat.$$, 'APPROVED'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title = 'Reglas comerciales y de salud');

INSERT INTO knowledge_entries (title, category, content, status)
SELECT 'Producto de ejemplo (edítame)', 'PRODUCTO', $$Precio: S/00. Describe aquí tu producto: qué es, para quién es, características reales y cómo se entrega. Esta ficha está en borrador: edítala o reemplázala por tus productos y publícala desde la pantalla de Base de conocimiento. Mientras esté en borrador la IA no la usa.$$, 'DRAFT'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title = 'Producto de ejemplo (edítame)');
