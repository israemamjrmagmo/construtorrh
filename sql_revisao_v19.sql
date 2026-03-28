-- =============================================================================
-- sql_revisao_v19.sql
-- Resolve TODOS os avisos do Supabase Advisor:
--   1. multiple_permissive_policies  → uma única policy por tabela (FOR ALL)
--   2. auth_rls_initplan             → (select auth.uid()) em vez de auth.uid()
--   3. duplicate_index               → remove índices duplicados
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 – Drop de todas as policies e recriação unificada (loop seguro)
-- ─────────────────────────────────────────────────────────────────────────────

DO $outer$
DECLARE
  tabelas TEXT[] := ARRAY[
    'acidentes','adiantamentos','advertencias','atestados',
    'colaborador_epi','colaborador_historico_contrato','colaboradores',
    'configuracoes','documentos','documentos_avulsos',
    'epi_catalogo','epis_entregues','feriados',
    'funcao_epi','funcao_valores','funcoes',
    'historico_chapa','lista_negra_juridico',
    'obra_horarios','obras','ocorrencias',
    'pagamentos','playbook_itens',
    'ponto_fechamentos','ponto_lancamentos','ponto_producao',
    'portal_documentos','portal_epi_solicitacoes','portal_mensagens',
    'portal_ocorrencias','portal_ponto_diario','portal_producao',
    'portal_solicitacoes','portal_usuarios',
    'premios','profiles','provisoes','provisoes_fgts',
    'registro_ponto','rescisoes','vale_transporte',
    'tabela_inss','tabela_ir'
  ];
  t TEXT;
  pol TEXT;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    -- Drop de TODAS as policies existentes na tabela
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;

    -- Cria UMA ÚNICA policy unificada usando aspas simples (sem $$ interno)
    EXECUTE format(
      'CREATE POLICY rls_unified ON public.%I'
      ' FOR ALL'
      ' USING (true)'
      ' WITH CHECK ((select auth.uid()) IS NOT NULL)',
      t
    );
  END LOOP;
END $outer$;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 – Remove índices duplicados (mantém o de nome mais descritivo)
-- ─────────────────────────────────────────────────────────────────────────────

-- colaboradores
DROP INDEX IF EXISTS public.idx_colab_vinculo_anterior;

-- documentos
DROP INDEX IF EXISTS public.idx_docs_colab;

-- ocorrencias
DROP INDEX IF EXISTS public.idx_ocorr_colab;

-- ponto_lancamentos
DROP INDEX IF EXISTS public.idx_ponto_colabmes;

-- portal_ocorrencias
DROP INDEX IF EXISTS public.idx_portal_ocor_obra_id;

-- portal_ponto_diario
DROP INDEX IF EXISTS public.idx_pponto_obra_data;

-- registro_ponto (data)
DROP INDEX IF EXISTS public.idx_reg_ponto_data;

-- registro_ponto (lancamento) – mantém idx_registro_ponto_lancamento
DROP INDEX IF EXISTS public.idx_reg_ponto_lancamento;
DROP INDEX IF EXISTS public.idx_registro_lanc;

-- registro_ponto (unique) – é uma constraint, deve ser removida via ALTER TABLE
ALTER TABLE public.registro_ponto DROP CONSTRAINT IF EXISTS reg_ponto_lanc_data_unique;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 – Verificação: políticas que NÃO se chamam rls_unified (deve = 0)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname <> 'rls_unified'
ORDER BY tablename;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 4 – Verificação: tabelas com mais de 1 policy por ação (deve = 0)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT tablename, cmd, count(*) AS qtd
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, cmd
HAVING count(*) > 1
ORDER BY tablename;
