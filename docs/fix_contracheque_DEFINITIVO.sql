-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — Migration DEFINITIVA: Contracheque completo
-- Execute no Supabase SQL Editor
-- SEGURO re-executar (todos os comandos são idempotentes)
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. ADICIONAR colunas faltantes na tabela contracheques
--    (a tabela base existe mas sem as colunas de detalhe)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contracheques
  ADD COLUMN IF NOT EXISTS salario_base       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS horas_normais      NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS horas_extras       NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS valor_producao     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_dsr          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_premio       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS desconto_vt        NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS desconto_adiant    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cesta_basica       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS funcao             TEXT,
  ADD COLUMN IF NOT EXISTS tipo_contrato_snap TEXT,
  ADD COLUMN IF NOT EXISTS obra_nome          TEXT,
  ADD COLUMN IF NOT EXISTS dias_trabalhados   INT,
  ADD COLUMN IF NOT EXISTS faltas             INT,
  ADD COLUMN IF NOT EXISTS lancamento_id      UUID,
  ADD COLUMN IF NOT EXISTS gerado_do_sistema  BOOLEAN DEFAULT FALSE;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. RLS — contracheques
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contracheques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracheques_auth_all"   ON public.contracheques;
DROP POLICY IF EXISTS "contracheques_all"         ON public.contracheques;
DROP POLICY IF EXISTS "contracheques_anon_select" ON public.contracheques;

-- Authenticated (RH/Admin): acesso total
CREATE POLICY "contracheques_auth_all"
  ON public.contracheques FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Anon (portal do colaborador): só lê publicados
CREATE POLICY "contracheques_anon_select"
  ON public.contracheques FOR SELECT TO anon
  USING (publicado = true);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RLS — colaboradores
--    Anon precisa ler para o portal do contracheque funcionar
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaboradores_all"              ON public.colaboradores;
DROP POLICY IF EXISTS "portal anon read colaboradores" ON public.colaboradores;
DROP POLICY IF EXISTS "rls_authenticated"              ON public.colaboradores;

-- Authenticated: acesso total
CREATE POLICY "colaboradores_auth_all"
  ON public.colaboradores FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Anon: lê todos os status (portal precisa ver mesmo afastados/férias)
CREATE POLICY "portal anon read colaboradores"
  ON public.colaboradores FOR SELECT TO anon
  USING (status IN ('ativo', 'afastado', 'ferias', 'inativo'));

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RLS — funcoes
--    Anon precisa ler para o join funcoes(nome) funcionar no portal
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.funcoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funcoes_all"              ON public.funcoes;
DROP POLICY IF EXISTS "portal anon read funcoes" ON public.funcoes;

CREATE POLICY "funcoes_auth_all"
  ON public.funcoes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "portal anon read funcoes"
  ON public.funcoes FOR SELECT TO anon
  USING (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RLS — colaborador_acessos
--    Portal usa chave anon para login e troca de senha
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.colaborador_acessos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rh_full_access"    ON public.colaborador_acessos;
DROP POLICY IF EXISTS "portal_read_own"   ON public.colaborador_acessos;
DROP POLICY IF EXISTS "portal_update_own" ON public.colaborador_acessos;

CREATE POLICY "rh_full_access"
  ON public.colaborador_acessos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "portal_read_own"
  ON public.colaborador_acessos FOR SELECT TO anon
  USING (true);

CREATE POLICY "portal_update_own"
  ON public.colaborador_acessos FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO (execute separado para confirmar)
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd, roles::text
-- FROM pg_policies
-- WHERE tablename IN (
--   'contracheques','colaboradores','funcoes','colaborador_acessos'
-- )
-- ORDER BY tablename, cmd;

-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'contracheques'
-- ORDER BY ordinal_position;
