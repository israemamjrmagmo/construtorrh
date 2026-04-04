-- ============================================================
-- ConstrutorRH – Ajustes de banco relacionados ao deploy de
-- frontend 2026-04 (sem alterações de schema, apenas validações)
-- ============================================================

-- 1. Garantir que os campos temperatura_min e umidade_pct
--    existam na tabela obra_clima (criados em versões anteriores)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='obra_clima' AND column_name='temperatura_min'
  ) THEN
    ALTER TABLE obra_clima ADD COLUMN temperatura_min NUMERIC(5,1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='obra_clima' AND column_name='umidade_pct'
  ) THEN
    ALTER TABLE obra_clima ADD COLUMN umidade_pct NUMERIC(5,1);
  END IF;
END $$;

-- 2. Garantir que preco_unitario em playbook_precos aceita valor 0
--    (para atividades adicionadas sem preço definido ainda)
--    O DEFAULT 0 já existe, mas asseguramos o constraint
ALTER TABLE playbook_precos
  ALTER COLUMN preco_unitario SET DEFAULT 0;

-- 3. Índice para melhorar performance de consulta por obra e data
--    em portal_producao (usado pelo GestorDashboard)
CREATE INDEX IF NOT EXISTS idx_portal_producao_obra_data
  ON portal_producao (obra_id, data);

-- 4. Índice para obra_clima por obra e data
CREATE INDEX IF NOT EXISTS idx_obra_clima_obra_data
  ON obra_clima (obra_id, data);

-- ============================================================
-- Notas sobre mudanças de comportamento (sem DDL):
-- - Playbook/Preços por Obra: agora exibe apenas atividades
--   com preço definido para a obra selecionada.
-- - Para adicionar atividades à obra use o botão
--   "Adicionar atividade" que cria registros com preco=0.
-- - PortalClima: histórico agora tem botão ✏️ Editar.
-- - Pagamentos: card Realizados agora mostra total histórico
--   + breakdown do mês filtrado.
-- - Colaborador: botão Salvar atualiza a ficha ao salvar.
-- ============================================================
