-- Sustituye una respuesta heredada que dejaba al cliente sin seguimiento.
UPDATE knowledge_entries
SET content = replace(
      replace(content,
        'Para información comercial pendiente, responder: “Permíteme verificarlo para confirmarte.”',
        'Para información comercial pendiente, explicar que el dato no está confirmado y derivar la consulta a un asesor por este chat.'),
      'Ante esas preguntas responder: “Permíteme verificarlo para confirmarte.”',
      'Ante esas preguntas, explicar que el dato no está confirmado y derivar la consulta a un asesor por este chat.'),
    version = version + 1,
    updated_at = now()
WHERE status='APPROVED' AND content LIKE '%Permíteme verificarlo para confirmarte.%';

INSERT INTO knowledge_entries(title,category,content,status)
SELECT 'Reclamos y consultas no resueltas', 'REGLAS',
  'Ante un reclamo, queja, producto defectuoso o dato comercial no confirmado, no volver a vender ni recomendar otro producto. Explicar que un asesor continuará por el mismo chat; registrar la necesidad y pedir una descripción del problema o número de pedido si ayuda. No prometer una solución, plazo exacto ni política que no esté aprobada.',
  'APPROVED'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='Reclamos y consultas no resueltas');
