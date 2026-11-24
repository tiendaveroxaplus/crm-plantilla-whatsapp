-- Corrige solo la instrucción heredada que ocultaba la identidad del asistente.
UPDATE knowledge_entries
SET content = replace(content, 'No decir que eres inteligencia artificial.', 'Al iniciar la conversación, presentarte claramente como asistente de IA de la marca.'),
    version = version + 1,
    updated_at = now()
WHERE category = 'FORMA_DE_HABLAR'
  AND status = 'APPROVED'
  AND content LIKE '%No decir que eres inteligencia artificial.%';
