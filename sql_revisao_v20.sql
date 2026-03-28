-- =============================================================================
-- sql_revisao_v20.sql
-- Resolve avisos INFO do Supabase Advisor:
--   1. unindexed_foreign_keys → cria índice em cada coluna FK sem cobertura
--   2. unused_index           → remove índices nunca utilizados
--   3. auth_db_connections    → requer configuração manual (ver nota ao final)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 – Índices para Foreign Keys sem cobertura
-- ─────────────────────────────────────────────────────────────────────────────

-- acidentes
CREATE INDEX IF NOT EXISTS idx_acidentes_colaborador_id  ON public.acidentes  (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_acidentes_obra_id         ON public.acidentes  (obra_id);

-- adiantamentos
CREATE INDEX IF NOT EXISTS idx_adiantamentos_pagamento_id ON public.adiantamentos (pagamento_id);

-- advertencias
CREATE INDEX IF NOT EXISTS idx_advertencias_colaborador_id ON public.advertencias (colaborador_id);

-- atestados
CREATE INDEX IF NOT EXISTS idx_atestados_acidente_id ON public.atestados (acidente_id);

-- colaborador_epi
CREATE INDEX IF NOT EXISTS idx_colab_epi_epi_id    ON public.colaborador_epi (epi_id);
CREATE INDEX IF NOT EXISTS idx_colab_epi_funcao_id ON public.colaborador_epi (funcao_id);

-- colaborador_historico_contrato
CREATE INDEX IF NOT EXISTS idx_hist_contrato_funcao_id ON public.colaborador_historico_contrato (funcao_id);
CREATE INDEX IF NOT EXISTS idx_hist_contrato_obra_id   ON public.colaborador_historico_contrato (obra_id);

-- documentos
CREATE INDEX IF NOT EXISTS idx_documentos_obra_id ON public.documentos (obra_id);

-- documentos_avulsos
CREATE INDEX IF NOT EXISTS idx_docs_avulsos_colaborador_id ON public.documentos_avulsos (colaborador_id);

-- epis_entregues
CREATE INDEX IF NOT EXISTS idx_epis_entregues_epi_id ON public.epis_entregues (epi_id);

-- funcao_epi
CREATE INDEX IF NOT EXISTS idx_funcao_epi_epi_id ON public.funcao_epi (epi_id);

-- historico_chapa
CREATE INDEX IF NOT EXISTS idx_historico_chapa_funcao_id ON public.historico_chapa (funcao_id);

-- ocorrencias
CREATE INDEX IF NOT EXISTS idx_ocorrencias_obra_id ON public.ocorrencias (obra_id);

-- pagamentos
CREATE INDEX IF NOT EXISTS idx_pagamentos_obra_id ON public.pagamentos (obra_id);

-- ponto_lancamentos
CREATE INDEX IF NOT EXISTS idx_lancamentos_liberado_por ON public.ponto_lancamentos (liberado_por);

-- ponto_producao
CREATE INDEX IF NOT EXISTS idx_ponto_producao_obra_id ON public.ponto_producao (obra_id);

-- portal_documentos
CREATE INDEX IF NOT EXISTS idx_portal_docs_colaborador_id ON public.portal_documentos (colaborador_id);

-- portal_epi_solicitacoes
CREATE INDEX IF NOT EXISTS idx_portal_epi_sol_colaborador_id ON public.portal_epi_solicitacoes (colaborador_id);

-- portal_ocorrencias
CREATE INDEX IF NOT EXISTS idx_portal_ocorr_colaborador_id   ON public.portal_ocorrencias (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_portal_ocorr_usuario_id       ON public.portal_ocorrencias (portal_usuario_id);

-- portal_ponto_diario
CREATE INDEX IF NOT EXISTS idx_portal_pdiario_lancamento_id  ON public.portal_ponto_diario (lancamento_id);
CREATE INDEX IF NOT EXISTS idx_portal_pdiario_usuario_id     ON public.portal_ponto_diario (portal_usuario_id);

-- portal_producao
CREATE INDEX IF NOT EXISTS idx_portal_prod_colaborador_id    ON public.portal_producao (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_portal_prod_lancamento_id     ON public.portal_producao (lancamento_id);
CREATE INDEX IF NOT EXISTS idx_portal_prod_lanc_prod_id      ON public.portal_producao (lancamento_prod_id);
CREATE INDEX IF NOT EXISTS idx_portal_prod_playbook_item_id  ON public.portal_producao (playbook_item_id);
CREATE INDEX IF NOT EXISTS idx_portal_prod_usuario_id        ON public.portal_producao (portal_usuario_id);

-- portal_solicitacoes
CREATE INDEX IF NOT EXISTS idx_portal_solic_usuario_id ON public.portal_solicitacoes (portal_usuario_id);

-- premios
CREATE INDEX IF NOT EXISTS idx_premios_pagamento_id ON public.premios (pagamento_id);

-- provisoes_fgts
CREATE INDEX IF NOT EXISTS idx_prov_fgts_colaborador_id ON public.provisoes_fgts (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_prov_fgts_obra_id        ON public.provisoes_fgts (obra_id);

-- registro_ponto
CREATE INDEX IF NOT EXISTS idx_registro_ponto_obra_id ON public.registro_ponto (obra_id);

-- rescisoes
CREATE INDEX IF NOT EXISTS idx_rescisoes_colaborador_id ON public.rescisoes (colaborador_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 – Remove índices nunca utilizados
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_portal_ocor_criado_em;
DROP INDEX IF EXISTS public.idx_colaboradores_vinculo_anterior;
DROP INDEX IF EXISTS public.idx_colaboradores_inativado_por;
DROP INDEX IF EXISTS public.idx_adiant_colab_comp_v2;
DROP INDEX IF EXISTS public.idx_feriados_ativo;
DROP INDEX IF EXISTS public.idx_ponto_producao_item;
DROP INDEX IF EXISTS public.idx_lancamentos_pagto;
DROP INDEX IF EXISTS public.idx_adiant_obra;
DROP INDEX IF EXISTS public.idx_adiant_desconto_apt;
DROP INDEX IF EXISTS public.idx_premios_obra;
DROP INDEX IF EXISTS public.idx_premios_data;
DROP INDEX IF EXISTS public.idx_colaboradores_cpf;
DROP INDEX IF EXISTS public.idx_registro_data;
DROP INDEX IF EXISTS public.idx_atestados_data;
DROP INDEX IF EXISTS public.idx_portal_epi_criado_em;
DROP INDEX IF EXISTS public.idx_lancamentos_fechamento;
DROP INDEX IF EXISTS public.idx_epis_entregues_colab;
DROP INDEX IF EXISTS public.idx_portal_producao_obra_data;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 – Verificação: FKs ainda sem índice (deve retornar 0 linhas)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
    c.conrelid::regclass AS tabela,
    c.conname            AS fkey,
    a.attname            AS coluna
FROM pg_constraint c
JOIN pg_attribute  a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND c.conrelid::regclass::text LIKE 'public.%' IS NOT FALSE
  AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE  i.indrelid = c.conrelid
        AND  a.attnum   = ANY(i.indkey)
  )
ORDER BY tabela, fkey;
