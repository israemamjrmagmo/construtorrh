-- ════════════════════════════════════════════════════════════════════════════
-- FIX MANUAL: Comissões de Abril/2026 — valores calculados das produções já lançadas
-- ConstrutorRH · Supabase → SQL Editor → Run All
-- ════════════════════════════════════════════════════════════════════════════
-- CONTEXTO:
--   As produções foram lançadas ANTES dos vínculos enc/cabo estarem configurados.
--   Este script lê os valores reais de portal_producao + playbook_precos
--   e insere/atualiza comissoes_equipe_v2 com os totais corretos de abril/2026.
--   Comissões já APROVADAS são preservadas (não sobrescritas).
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 1: Garantir estrutura mínima das tabelas
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE portal_producao
  ADD COLUMN IF NOT EXISTS num_retrabalhos INT NOT NULL DEFAULT 0
  CHECK (num_retrabalhos >= 0);

ALTER TABLE playbook_precos
  ADD COLUMN IF NOT EXISTS valor_premiacao_enc  NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_premiacao_cabo NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS encarregado_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cabo_id         UUID REFERENCES colaboradores(id) ON DELETE SET NULL;

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


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 2: DIAGNÓSTICO — ver produções de abril e seus valores de premiação
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  o.nome                                                  AS obra,
  COALESCE(pi.descricao,'(sem item)')                     AS atividade,
  SUM(pp.quantidade)                                      AS qtd_total,
  COALESCE(pr.valor_premiacao_enc,0)                      AS R_enc_unit,
  COALESCE(pr.valor_premiacao_cabo,0)                     AS R_cabo_unit,
  ROUND(SUM(pp.quantidade) * COALESCE(pr.valor_premiacao_enc,0),  2) AS total_enc,
  ROUND(SUM(pp.quantidade) * COALESCE(pr.valor_premiacao_cabo,0), 2) AS total_cabo,
  c_enc.nome                                              AS encarregado,
  c_cabo.nome                                             AS cabo,
  CASE
    WHEN pr.id IS NULL                                                    THEN '❌ sem vínculo no playbook_precos'
    WHEN pr.encarregado_id IS NULL AND pr.cabo_id IS NULL                 THEN '⚠️ enc/cabo NULL no playbook_precos'
    WHEN COALESCE(pr.valor_premiacao_enc,0)=0
     AND COALESCE(pr.valor_premiacao_cabo,0)=0                            THEN '⚠️ valores R$0'
    ELSE '✅ calculado'
  END AS status
FROM portal_producao pp
LEFT JOIN obras o            ON o.id  = pp.obra_id
LEFT JOIN playbook_itens pi  ON pi.id = pp.playbook_item_id
LEFT JOIN playbook_precos pr ON
      pr.obra_id = pp.obra_id
  AND EXISTS (
        SELECT 1 FROM playbook_atividades pa2
        WHERE  pa2.id = pr.atividade_id
          AND  lower(trim(pa2.descricao)) = lower(trim(COALESCE(pi.descricao,'')))
      )
LEFT JOIN colaboradores c_enc  ON c_enc.id  = pr.encarregado_id
LEFT JOIN colaboradores c_cabo ON c_cabo.id = pr.cabo_id
WHERE pp.data BETWEEN '2026-04-01' AND '2026-04-30'
GROUP BY o.nome, pi.descricao, pr.id,
         pr.valor_premiacao_enc, pr.valor_premiacao_cabo,
         c_enc.nome, c_cabo.nome
ORDER BY o.nome, pi.descricao;


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 3: FIX AUTOMÁTICO — calcular e inserir comissões de abril
--
-- Lógica:
--  • Agrupa produções por obra + atividade (via playbook_itens ↔ playbook_precos)
--  • Aplica fator de retrabalho: 0 retrab = 100% · 1 = 50% · 2+ = 0%
--  • Agrupa por colaborador (enc ou cabo) somando todas as atividades da obra
--  • Usa UPSERT: cria novo ou atualiza pendente — NÃO toca em 'aprovado'
-- ────────────────────────────────────────────────────────────────────────────

-- ── 3a. Calcular totais por obra + encarregado ──────────────────────────────
WITH producoes_abril AS (
  SELECT
    pp.obra_id,
    pi.descricao                                       AS item_descricao,
    SUM(pp.quantidade *
      CASE
        WHEN COALESCE(pp.num_retrabalhos,0) = 0 THEN 1.0
        WHEN COALESCE(pp.num_retrabalhos,0) = 1 THEN 0.5
        ELSE 0.0
      END
    )                                                  AS qtd_efetiva,
    SUM(pp.quantidade)                                 AS qtd_total,
    pr.encarregado_id,
    pr.cabo_id,
    COALESCE(pr.valor_premiacao_enc,  0)               AS v_enc,
    COALESCE(pr.valor_premiacao_cabo, 0)               AS v_cabo
  FROM portal_producao pp
  JOIN playbook_itens pi   ON pi.id = pp.playbook_item_id
  JOIN playbook_precos pr  ON pr.obra_id = pp.obra_id
    AND EXISTS (
          SELECT 1 FROM playbook_atividades pa2
          WHERE  pa2.id = pr.atividade_id
            AND  lower(trim(pa2.descricao)) = lower(trim(pi.descricao))
        )
  WHERE pp.data BETWEEN '2026-04-01' AND '2026-04-30'
    AND pp.obra_id IS NOT NULL
  GROUP BY pp.obra_id, pi.descricao, pr.encarregado_id, pr.cabo_id,
           pr.valor_premiacao_enc, pr.valor_premiacao_cabo
),
-- ── totais por obra + encarregado ──────────────────────────────────────────
totais_enc AS (
  SELECT
    obra_id,
    encarregado_id                                     AS colaborador_id,
    'encarregado'::TEXT                                AS funcao,
    ROUND(SUM(qtd_efetiva * v_enc), 2)                 AS valor_final,
    SUM(qtd_total)                                     AS qtd_total_obra,
    string_agg(
      item_descricao || ': ' || qtd_total::TEXT || ' un × R$' || v_enc::TEXT,
      chr(10) ORDER BY item_descricao
    )                                                  AS detalhes
  FROM producoes_abril
  WHERE encarregado_id IS NOT NULL AND v_enc > 0
  GROUP BY obra_id, encarregado_id
),
-- ── totais por obra + cabo ──────────────────────────────────────────────────
totais_cabo AS (
  SELECT
    obra_id,
    cabo_id                                            AS colaborador_id,
    'cabo'::TEXT                                       AS funcao,
    ROUND(SUM(qtd_efetiva * v_cabo), 2)                AS valor_final,
    SUM(qtd_total)                                     AS qtd_total_obra,
    string_agg(
      item_descricao || ': ' || qtd_total::TEXT || ' un × R$' || v_cabo::TEXT,
      chr(10) ORDER BY item_descricao
    )                                                  AS detalhes
  FROM producoes_abril
  WHERE cabo_id IS NOT NULL AND v_cabo > 0
  GROUP BY obra_id, cabo_id
),
todos AS (
  SELECT * FROM totais_enc
  UNION ALL
  SELECT * FROM totais_cabo
)
-- ── UPSERT — inserir ou atualizar (só pendentes; aprovados ficam intactos) ──
INSERT INTO comissoes_equipe_v2
  (obra_id, colaborador_id, funcao, descricao,
   quantidade_total, valor_unitario_premiacao, valor_bruto,
   num_cabos, valor_final, competencia, status, data_geracao, observacoes)
SELECT
  t.obra_id,
  t.colaborador_id,
  t.funcao,
  'Premiação ' || INITCAP(t.funcao) || ' — Abril/2026 (retroativo)',
  t.qtd_total_obra,
  0,
  t.valor_final,
  1,
  t.valor_final,
  '2026-04',
  'pendente',
  CURRENT_DATE,
  t.detalhes
FROM todos t
WHERE t.valor_final > 0
  -- NÃO inserir se já existe aprovado para este colaborador/obra/competencia
  AND NOT EXISTS (
    SELECT 1 FROM comissoes_equipe_v2 c2
    WHERE  c2.obra_id        = t.obra_id
      AND  c2.colaborador_id = t.colaborador_id
      AND  c2.funcao         = t.funcao
      AND  c2.competencia    = '2026-04'
      AND  c2.status         = 'aprovado'
  )
ON CONFLICT (obra_id, colaborador_id, funcao, competencia)
DO UPDATE SET
  valor_final      = EXCLUDED.valor_final,
  valor_bruto      = EXCLUDED.valor_bruto,
  quantidade_total = EXCLUDED.quantidade_total,
  observacoes      = EXCLUDED.observacoes,
  data_geracao     = EXCLUDED.data_geracao,
  status           = CASE
                       WHEN comissoes_equipe_v2.status = 'aprovado'
                       THEN comissoes_equipe_v2.status   -- preserva aprovado
                       ELSE 'pendente'
                     END;


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 4: VERIFICAÇÃO — ver o que foi gerado
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  o.nome          AS obra,
  c.nome          AS colaborador,
  c.chapa,
  cv.funcao,
  cv.valor_final  AS premiacao_R$,
  cv.status,
  cv.observacoes
FROM comissoes_equipe_v2 cv
JOIN obras        o ON o.id = cv.obra_id
JOIN colaboradores c ON c.id = cv.colaborador_id
WHERE cv.competencia = '2026-04'
ORDER BY o.nome, cv.funcao, c.nome;


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 5 (OPCIONAL): Se ainda tiver produções sem playbook_item_id,
-- este bloco mostra quais são — você decide manualmente
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  pp.id,
  o.nome      AS obra,
  pp.data,
  pp.quantidade,
  pp.obs,
  '⚠️ sem playbook_item_id — não entra no cálculo' AS aviso
FROM portal_producao pp
LEFT JOIN obras o ON o.id = pp.obra_id
WHERE pp.playbook_item_id IS NULL
  AND pp.data BETWEEN '2026-04-01' AND '2026-04-30'
ORDER BY o.nome, pp.data;
