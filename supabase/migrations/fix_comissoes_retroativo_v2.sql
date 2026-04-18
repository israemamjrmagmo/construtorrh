-- ════════════════════════════════════════════════════════════════════════════
-- FIX RETROATIVO: Comissões para produções lançadas antes do ajuste do sistema
-- ConstrutorRH · Execute no Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════
-- EXECUTE PASSO A PASSO (selecione cada bloco e clique RUN)
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 1: Garantir colunas necessárias (idempotente, pode rodar várias vezes)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE portal_producao
  ADD COLUMN IF NOT EXISTS num_retrabalhos INT NOT NULL DEFAULT 0
  CHECK (num_retrabalhos >= 0);

ALTER TABLE playbook_precos
  ADD COLUMN IF NOT EXISTS valor_premiacao_enc  NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_premiacao_cabo NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS encarregado_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cabo_id         UUID REFERENCES colaboradores(id) ON DELETE SET NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 2: Criar tabela comissoes_equipe_v2 se não existir
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comissoes_equipe_v2 (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id                  UUID REFERENCES obras(id) ON DELETE CASCADE,
  colaborador_id           UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  funcao                   TEXT NOT NULL CHECK (funcao IN ('encarregado','cabo')),
  descricao                TEXT,
  quantidade_total         NUMERIC(12,3) DEFAULT 0,
  valor_unitario_premiacao NUMERIC(10,2) DEFAULT 0,
  valor_bruto              NUMERIC(10,2) DEFAULT 0,
  num_cabos                INT DEFAULT 1,
  valor_final              NUMERIC(10,2) DEFAULT 0,
  competencia              TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente','aprovado','cancelado')),
  premio_id                UUID,
  observacoes              TEXT,
  data_geracao             DATE,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (obra_id, colaborador_id, funcao, competencia)
);

ALTER TABLE comissoes_equipe_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comissoes_equipe_v2_all" ON comissoes_equipe_v2;
CREATE POLICY "comissoes_equipe_v2_all" ON comissoes_equipe_v2
  FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 3: DIAGNÓSTICO — execute este bloco ANTES dos fixes para ver o problema
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  o.nome                        AS obra,
  COALESCE(pi.descricao, '⚠️ item_id inválido ou NULL') AS atividade,
  SUM(pp.quantidade)            AS qtd_total,
  COUNT(pp.id)                  AS n_registros,
  pa_m.descricao                AS atividade_no_preco,   -- nome como está no playbook_precos
  pr.valor_premiacao_enc        AS R_enc_unitario,
  pr.valor_premiacao_cabo       AS R_cabo_unitario,
  c_enc.nome                    AS encarregado,
  c_cabo.nome                   AS cabo,
  CASE
    WHEN pp.playbook_item_id IS NULL
      THEN '❌ playbook_item_id NULL — produção antiga sem vínculo'
    WHEN pi.id IS NULL
      THEN '❌ FK inválida — playbook_itens não tem esse ID'
    WHEN pr.id IS NULL
      THEN '❌ sem match em playbook_precos — descrições diferem ou obra não cadastrada'
    WHEN pr.encarregado_id IS NULL AND pr.cabo_id IS NULL
      THEN '⚠️ match OK mas enc/cabo não vinculados no Playbook → Preços'
    WHEN COALESCE(pr.valor_premiacao_enc,0)=0 AND COALESCE(pr.valor_premiacao_cabo,0)=0
      THEN '⚠️ match OK mas R$ Enc e Cabo são R$0 → configure valores no Playbook → Preços'
    ELSE '✅ tudo OK — aparecerá na comissão'
  END                           AS diagnostico
FROM portal_producao pp
LEFT JOIN obras o            ON o.id  = pp.obra_id
LEFT JOIN playbook_itens pi  ON pi.id = pp.playbook_item_id
LEFT JOIN playbook_precos pr ON
  pr.obra_id = pp.obra_id AND
  EXISTS (
    SELECT 1 FROM playbook_atividades pa2
    WHERE pa2.id = pr.atividade_id
      AND lower(trim(pa2.descricao)) = lower(trim(COALESCE(pi.descricao,'')))
  )
LEFT JOIN playbook_atividades pa_m ON pa_m.id = pr.atividade_id
LEFT JOIN colaboradores c_enc  ON c_enc.id  = pr.encarregado_id
LEFT JOIN colaboradores c_cabo ON c_cabo.id = pr.cabo_id
WHERE pp.data >= '2026-04-01' AND pp.data <= '2026-04-30'
GROUP BY o.nome, pi.descricao, pa_m.descricao, pr.id,
         pr.valor_premiacao_enc, pr.valor_premiacao_cabo,
         c_enc.nome, c_cabo.nome, pp.playbook_item_id, pi.id
ORDER BY o.nome, pi.descricao;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 4: FIX — criar entradas em playbook_itens para atividades que estão
-- em playbook_precos mas ainda não foram sincronizadas para a tabela de itens
-- (acontece quando o playbook foi configurado depois que o portal já estava em uso)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO playbook_itens (obra_id, descricao, unidade, categoria, preco_unitario, ativo)
SELECT DISTINCT
  pr.obra_id,
  pa.descricao,
  COALESCE(pa.unidade, 'm²'),
  pa.categoria,
  pr.preco_unitario,
  TRUE
FROM playbook_precos pr
JOIN playbook_atividades pa ON pa.id = pr.atividade_id
WHERE NOT EXISTS (
  SELECT 1 FROM playbook_itens pi2
  WHERE  pi2.obra_id = pr.obra_id
    AND  lower(trim(pi2.descricao)) = lower(trim(pa.descricao))
)
ON CONFLICT DO NOTHING;

-- Ver o que foi criado:
SELECT 'playbook_itens após sync:' AS info, COUNT(*) AS total FROM playbook_itens;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 5: FIX — corrigir produções com playbook_item_id NULL
-- Tenta casar pela obra + descrição da atividade via lancamento_id → ponto_diario
-- ════════════════════════════════════════════════════════════════════════════

-- Ver quantas produções estão sem item_id:
SELECT
  COUNT(*) FILTER (WHERE playbook_item_id IS NULL) AS producoes_sem_item_id,
  COUNT(*) AS total_producoes_abril
FROM portal_producao
WHERE data >= '2026-04-01' AND data <= '2026-04-30';

-- FIX: se houver campo "obs" ou "atividade_descricao" na portal_producao
-- que guarde o nome da atividade, o update abaixo recupera o item correto.
-- (Se não houver esse campo, o update retorna 0 linhas — inofensivo)
UPDATE portal_producao pp
SET    playbook_item_id = pi.id
FROM   playbook_itens pi
WHERE  pp.playbook_item_id IS NULL
  AND  pp.obra_id IS NOT NULL
  AND  pi.obra_id = pp.obra_id
  AND  lower(trim(pi.descricao)) = lower(trim(COALESCE(pp.obs, '')));

-- Confirmar:
SELECT 'producoes_sem_item_id_restantes:' AS info,
       COUNT(*) AS total
FROM portal_producao
WHERE playbook_item_id IS NULL
  AND data >= '2026-04-01' AND data <= '2026-04-30';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 6: VERIFICAÇÃO FINAL — re-rodar diagnóstico após os fixes
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  '=== RESULTADO FINAL ===' AS secao,
  o.nome                    AS obra,
  pi.descricao              AS atividade,
  SUM(pp.quantidade)        AS qtd_total,
  ROUND(SUM(pp.quantidade) * COALESCE(pr.valor_premiacao_enc,0),  2) AS total_comissao_enc,
  ROUND(SUM(pp.quantidade) * COALESCE(pr.valor_premiacao_cabo,0), 2) AS total_comissao_cabo,
  c_enc.nome   AS encarregado,
  c_cabo.nome  AS cabo,
  CASE
    WHEN pr.id IS NULL
      THEN '❌ ainda sem match'
    WHEN pr.encarregado_id IS NULL AND pr.cabo_id IS NULL
      THEN '⚠️ vincule enc/cabo no Playbook → Preços'
    WHEN COALESCE(pr.valor_premiacao_enc,0)=0 AND COALESCE(pr.valor_premiacao_cabo,0)=0
      THEN '⚠️ defina R$ Enc e R$ Cabo no Playbook → Preços'
    ELSE '✅ pronto — clique Calcular Abril/2026 na tela de Comissão'
  END AS status
FROM portal_producao pp
LEFT JOIN obras o            ON o.id  = pp.obra_id
LEFT JOIN playbook_itens pi  ON pi.id = pp.playbook_item_id
LEFT JOIN playbook_precos pr ON
  pr.obra_id = pp.obra_id AND
  EXISTS (
    SELECT 1 FROM playbook_atividades pa2
    WHERE pa2.id = pr.atividade_id
      AND lower(trim(pa2.descricao)) = lower(trim(COALESCE(pi.descricao,'')))
  )
LEFT JOIN colaboradores c_enc  ON c_enc.id  = pr.encarregado_id
LEFT JOIN colaboradores c_cabo ON c_cabo.id = pr.cabo_id
WHERE pp.data >= '2026-04-01' AND pp.data <= '2026-04-30'
GROUP BY o.nome, pi.descricao, pr.id, pr.valor_premiacao_enc,
         pr.valor_premiacao_cabo, c_enc.nome, c_cabo.nome
ORDER BY o.nome, pi.descricao;
