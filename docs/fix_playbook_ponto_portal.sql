-- ============================================================
-- FIX: Vinculação de serviço do playbook no ponto do portal
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Adiciona coluna de referência ao item do playbook
ALTER TABLE portal_ponto_diario
  ADD COLUMN IF NOT EXISTS playbook_item_id   uuid REFERENCES playbook_itens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS servico_descricao  text;   -- cache da descrição (evita join sempre)

-- 2. Índice para consultas por item
CREATE INDEX IF NOT EXISTS idx_pponto_playbook ON portal_ponto_diario (playbook_item_id)
  WHERE playbook_item_id IS NOT NULL;

-- 3. RLS: portal pode gravar playbook_item_id (política já existe via anon)
-- (não há nova política necessária — a coluna segue as mesmas RLS da tabela)

-- Confirmação
SELECT 'Coluna playbook_item_id e servico_descricao adicionadas com sucesso!' as resultado;
