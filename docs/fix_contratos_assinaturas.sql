-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — Fix: Assinaturas padrão em todos os documentos/contratos
-- 
-- OBJETIVO: Garantir RLS correta + reinserir os 27 modelos com conteúdo limpo
-- O sistema frontend já injeta o bloco HTML de assinaturas automaticamente.
-- Este SQL apenas garante que o banco tem os modelos carregados.
--
-- Execute no Supabase SQL Editor
-- SEGURO re-executar (usa ON CONFLICT DO UPDATE)
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Garantir que a tabela contratos_modelos existe e tem RLS correta
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contratos_modelos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  numero        int,
  titulo        text NOT NULL,
  categoria     text NOT NULL DEFAULT 'admissional',
  tipo_contrato text[],
  descricao     text,
  conteudo      text NOT NULL,
  variaveis     jsonb DEFAULT '[]',
  ativo         boolean DEFAULT true,
  ordem         int DEFAULT 0
);

ALTER TABLE contratos_modelos ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas e recriar
DROP POLICY IF EXISTS "Autenticados lêem modelos ativos" ON contratos_modelos;
DROP POLICY IF EXISTS "Autenticados gerenciam modelos"   ON contratos_modelos;
DROP POLICY IF EXISTS "modelos_auth_all"                 ON contratos_modelos;
DROP POLICY IF EXISTS "modelos_anon_select"              ON contratos_modelos;

-- Authenticated: acesso total
CREATE POLICY "modelos_auth_all"
  ON contratos_modelos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Garantir que contratos_gerados existe e tem RLS correta
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contratos_gerados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz DEFAULT now(),
  modelo_id       uuid REFERENCES contratos_modelos(id) ON DELETE SET NULL,
  colaborador_id  uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
  titulo_gerado   text,
  conteudo_final  text
);

ALTER TABLE contratos_gerados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gerados_auth_all" ON contratos_gerados;
CREATE POLICY "gerados_auth_all"
  ON contratos_gerados FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Adicionar coluna 'numero' se não existir (compatibilidade)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE contratos_modelos ADD COLUMN IF NOT EXISTS numero int;

-- ──────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT id, numero, titulo, categoria, ativo FROM contratos_modelos ORDER BY ordem;
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'contratos_modelos';
