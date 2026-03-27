-- ============================================================
-- sql_revisao_v12.sql — Auditoria de inativação de colaboradores
-- Idempotente: usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ============================================================

-- ── 1. Colunas de auditoria na tabela colaboradores ─────────────────────────
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS inativado_por            TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS inativado_em             TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmou_sem_pendencias BOOLEAN     DEFAULT FALSE;

COMMENT ON COLUMN public.colaboradores.inativado_por
  IS 'E-mail do usuário que realizou a inativação';
COMMENT ON COLUMN public.colaboradores.inativado_em
  IS 'Timestamp exato da inativação';
COMMENT ON COLUMN public.colaboradores.confirmou_sem_pendencias
  IS 'true = responsável declarou que verificou e não havia pendências de lançamento';

-- ── 2. Índice para auditoria (buscar por responsável) ───────────────────────
CREATE INDEX IF NOT EXISTS idx_colaboradores_inativado_por
  ON public.colaboradores(inativado_por)
  WHERE inativado_por IS NOT NULL;

-- ── 3. Herdados da v11 (idempotentes) ────────────────────────────────────────

-- v10: recontratação
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS vinculo_anterior_id UUID       REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_encerramento  TEXT       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS data_encerramento    DATE       DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_colaboradores_vinculo_anterior
  ON public.colaboradores(vinculo_anterior_id)
  WHERE vinculo_anterior_id IS NOT NULL;

-- v9: considera_sabado_util em obras
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS considera_sabado_util BOOLEAN DEFAULT FALSE;

-- v9: status aguardando_pagamento em vale_transporte
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'vale_transporte'
      AND column_name  = 'status'
  ) THEN
    ALTER TABLE public.vale_transporte ADD COLUMN status TEXT DEFAULT 'pendente';
  END IF;
END $$;

ALTER TABLE public.vale_transporte
  DROP CONSTRAINT IF EXISTS vale_transporte_status_check;

ALTER TABLE public.vale_transporte
  ADD CONSTRAINT vale_transporte_status_check
  CHECK (status IN ('pendente','aprovado','pago','aguardando_pagamento','recusado'));

-- v11: link_projetos e obs_projetos em obras
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS link_projetos TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS obs_projetos  TEXT    DEFAULT NULL;

-- v11: tabela portal_mensagens
CREATE TABLE IF NOT EXISTS public.portal_mensagens (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id        UUID        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  remetente      TEXT        NOT NULL CHECK (remetente IN ('encarregado','rh')),
  remetente_nome TEXT        NOT NULL,
  texto          TEXT        NOT NULL,
  lida           BOOLEAN     NOT NULL DEFAULT FALSE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_mensagens_obra
  ON public.portal_mensagens(obra_id, criado_em DESC);

ALTER TABLE public.portal_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_mensagens_all" ON public.portal_mensagens;
CREATE POLICY "portal_mensagens_all" ON public.portal_mensagens
  FOR ALL USING (true) WITH CHECK (true);

-- v10: tabela colaborador_historico_contrato
CREATE TABLE IF NOT EXISTS public.colaborador_historico_contrato (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id   UUID        NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  chapa            TEXT        NOT NULL,
  tipo_contrato    TEXT,
  funcao_id        UUID        REFERENCES public.funcoes(id) ON DELETE SET NULL,
  data_inicio      DATE,
  data_fim         DATE,
  motivo_troca     TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_col_hist_contrato_colab
  ON public.colaborador_historico_contrato(colaborador_id, data_inicio DESC);

ALTER TABLE public.colaborador_historico_contrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "col_hist_contrato_all" ON public.colaborador_historico_contrato;
CREATE POLICY "col_hist_contrato_all" ON public.colaborador_historico_contrato
  FOR ALL USING (true) WITH CHECK (true);

-- ── 4. Configurações da empresa (idempotente) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracoes (
  id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  chave          TEXT  UNIQUE NOT NULL,
  valor          TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "configuracoes_all" ON public.configuracoes;
CREATE POLICY "configuracoes_all" ON public.configuracoes
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.configuracoes (chave, valor) VALUES
  ('empresa_nome',      NULL),
  ('empresa_cnpj',      NULL),
  ('empresa_endereco',  NULL),
  ('empresa_cidade',    NULL),
  ('empresa_telefone',  NULL),
  ('empresa_email',     NULL),
  ('empresa_logo_url',  NULL)
ON CONFLICT (chave) DO NOTHING;

-- ── 5. Storage bucket documentos (idempotente) ───────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documentos_all"      ON storage.objects;
DROP POLICY IF EXISTS "documentos_upload"   ON storage.objects;
DROP POLICY IF EXISTS "documentos_read"     ON storage.objects;
DROP POLICY IF EXISTS "documentos_delete"   ON storage.objects;

CREATE POLICY "documentos_all" ON storage.objects
  FOR ALL USING (bucket_id = 'documentos') WITH CHECK (bucket_id = 'documentos');
