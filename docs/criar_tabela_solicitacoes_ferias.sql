-- ============================================================
-- EXECUTAR NO SUPABASE SQL EDITOR
-- https://supabase.com/dashboard/project/rbhmfqngnjxdemavtvxk/sql
-- ============================================================
-- Tabela de solicitações de férias pelo portal do colaborador

CREATE TABLE IF NOT EXISTS solicitacoes_ferias (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id            uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data_inicio_solicitada    date NOT NULL,
  data_fim_solicitada       date NOT NULL,
  dias_solicitados          integer NOT NULL,
  status                    text NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente','aprovada','recusada')),
  periodo_concessivo_inicio date,
  periodo_concessivo_fim    date,
  motivo_recusa             text,
  aprovado_por              uuid REFERENCES auth.users(id),
  aprovado_em               timestamptz,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

-- Index para buscar por colaborador
CREATE INDEX IF NOT EXISTS idx_sol_ferias_colab ON solicitacoes_ferias(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_sol_ferias_status ON solicitacoes_ferias(status);

-- RLS
ALTER TABLE solicitacoes_ferias ENABLE ROW LEVEL SECURITY;

-- Admin lê tudo
DROP POLICY IF EXISTS "Admin full access ferias" ON solicitacoes_ferias;
CREATE POLICY "Admin full access ferias" ON solicitacoes_ferias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Colaborador insere (anon via portal)
DROP POLICY IF EXISTS "Portal insert ferias" ON solicitacoes_ferias;
CREATE POLICY "Portal insert ferias" ON solicitacoes_ferias
  FOR INSERT TO anon WITH CHECK (true);

-- Colaborador lê suas próprias
DROP POLICY IF EXISTS "Portal read ferias" ON solicitacoes_ferias;
CREATE POLICY "Portal read ferias" ON solicitacoes_ferias
  FOR SELECT TO anon USING (true);
