-- ============================================================
-- fix_portal_solicitacoes_status.sql
-- Execute este script no Supabase SQL Editor
-- Garante que a tabela portal_solicitacoes tem as colunas necessárias
-- ============================================================

-- Verifica e adiciona coluna status (caso não exista)
ALTER TABLE portal_solicitacoes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';

-- Colunas de aprovação (adicionadas pelo portal_update_v3.sql)
ALTER TABLE portal_solicitacoes
  ADD COLUMN IF NOT EXISTS aprovado_por  text,
  ADD COLUMN IF NOT EXISTS aprovado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_nome text,
  ADD COLUMN IF NOT EXISTS observacoes_admin text;

-- Garante que a coluna status aceita os valores corretos
-- (se já existe um CHECK constraint conflitante, ignore este bloco)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%portal_solicitacoes%status%'
  ) THEN
    ALTER TABLE portal_solicitacoes
      ADD CONSTRAINT portal_solicitacoes_status_check
      CHECK (status IN ('pendente','aprovado','recusado'));
  END IF;
END$$;

-- Permite que usuários anônimos façam update no status
-- (necessário para RLS se habilitado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'portal_solicitacoes' AND policyname = 'allow_update_status'
  ) THEN
    EXECUTE 'CREATE POLICY allow_update_status ON portal_solicitacoes
      FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
END$$;
