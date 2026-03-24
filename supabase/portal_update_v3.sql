-- ============================================================
-- portal_update_v3.sql
-- Novas colunas em portal_solicitacoes + tabelas EPI e Documentos
-- ============================================================

-- 1. Colunas de aprovação em portal_solicitacoes
ALTER TABLE portal_solicitacoes
  ADD COLUMN IF NOT EXISTS aprovado_por  text,
  ADD COLUMN IF NOT EXISTS aprovado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_nome text;   -- nome legível do aprovador

-- 2. Tabela de solicitações de EPI
CREATE TABLE IF NOT EXISTS portal_epi_solicitacoes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid        REFERENCES obras(id)          ON DELETE CASCADE,
  colaborador_id    uuid        REFERENCES colaboradores(id)  ON DELETE SET NULL,
  portal_usuario_id uuid        REFERENCES portal_usuarios(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'pendente'
                               CHECK (status IN ('pendente','aprovado','recusado','atendido')),
  urgencia          text        NOT NULL DEFAULT 'normal'
                               CHECK (urgencia IN ('normal','urgente','critico')),
  itens             jsonb       NOT NULL DEFAULT '[]',   -- [{nome, quantidade, obs}]
  observacoes       text,
  aprovado_por      text,
  aprovado_em       timestamptz,
  aprovado_nome     text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

-- índices EPI
CREATE INDEX IF NOT EXISTS idx_portal_epi_obra_id    ON portal_epi_solicitacoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_portal_epi_status     ON portal_epi_solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_portal_epi_criado_em  ON portal_epi_solicitacoes(criado_em);

-- RLS EPI
ALTER TABLE portal_epi_solicitacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_epi_anon_read"   ON portal_epi_solicitacoes;
DROP POLICY IF EXISTS "portal_epi_anon_insert" ON portal_epi_solicitacoes;
DROP POLICY IF EXISTS "portal_epi_auth_all"    ON portal_epi_solicitacoes;

CREATE POLICY "portal_epi_anon_read"   ON portal_epi_solicitacoes FOR SELECT USING (true);
CREATE POLICY "portal_epi_anon_insert" ON portal_epi_solicitacoes FOR INSERT WITH CHECK (true);
CREATE POLICY "portal_epi_auth_all"    ON portal_epi_solicitacoes FOR ALL USING (auth.role() = 'authenticated');

-- 3. Tabela de documentos / fotos do portal
CREATE TABLE IF NOT EXISTS portal_documentos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid        REFERENCES obras(id)          ON DELETE CASCADE,
  colaborador_id    uuid        REFERENCES colaboradores(id)  ON DELETE SET NULL,
  portal_usuario_id uuid        REFERENCES portal_usuarios(id) ON DELETE SET NULL,
  tipo              text        NOT NULL DEFAULT 'foto',   -- rg, cpf, aso, ctps, comprovante, foto, outro
  descricao         text,
  arquivo_url       text,        -- URL no Supabase Storage
  arquivo_nome      text,
  arquivo_tipo      text,        -- mime type
  status            text        NOT NULL DEFAULT 'pendente'
                               CHECK (status IN ('pendente','processado','descartado')),
  observacoes       text,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

-- índices Documentos
CREATE INDEX IF NOT EXISTS idx_portal_docs_obra_id   ON portal_documentos(obra_id);
CREATE INDEX IF NOT EXISTS idx_portal_docs_status    ON portal_documentos(status);
CREATE INDEX IF NOT EXISTS idx_portal_docs_criado_em ON portal_documentos(criado_em);

-- RLS Documentos
ALTER TABLE portal_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_docs_anon_read"   ON portal_documentos;
DROP POLICY IF EXISTS "portal_docs_anon_insert" ON portal_documentos;
DROP POLICY IF EXISTS "portal_docs_auth_all"    ON portal_documentos;

CREATE POLICY "portal_docs_anon_read"   ON portal_documentos FOR SELECT USING (true);
CREATE POLICY "portal_docs_anon_insert" ON portal_documentos FOR INSERT WITH CHECK (true);
CREATE POLICY "portal_docs_auth_all"    ON portal_documentos FOR ALL USING (auth.role() = 'authenticated');

-- 4. Storage bucket para documentos do portal (executar manualmente no dashboard se necessário)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('portal-documentos', 'portal-documentos', true)
-- ON CONFLICT DO NOTHING;
