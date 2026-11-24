-- Distingue la espera de asesor de una pausa manual o del control humano.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_automation_mode_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_automation_mode_check
  CHECK (automation_mode IN ('AI', 'HUMAN', 'PAUSED', 'ESCALATED'));

-- Recupera únicamente derivaciones automáticas aún abiertas, no pausas manuales posteriores.
UPDATE conversations AS conversation SET automation_mode='ESCALATED', updated_at=now()
WHERE conversation.automation_mode='PAUSED'
  AND EXISTS (SELECT 1 FROM follow_up_tasks AS task
    WHERE task.conversation_id=conversation.id AND task.status='OPEN' AND task.priority='HIGH')
  AND EXISTS (SELECT 1 FROM crm_audit_log AS handoff
    WHERE handoff.conversation_id=conversation.id AND handoff.action='AI_HANDOFF'
      AND NOT EXISTS (SELECT 1 FROM crm_audit_log AS change
        WHERE change.conversation_id=conversation.id AND change.action='CONVERSATION_UPDATED'
          AND change.created_at > handoff.created_at));
