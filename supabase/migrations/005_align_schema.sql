-- ============================================================
-- 005_align_schema.sql
-- Alinha colunas das tabelas acidentes e atestados com o código
-- do frontend, e adiciona suporte a uploads de EPI
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ACIDENTES: renomear colunas para o padrão do frontend
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- data_acidente → data_ocorrencia
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acidentes' AND column_name='data_acidente'
  ) THEN
    ALTER TABLE public.acidentes RENAME COLUMN data_acidente TO data_ocorrencia;
  END IF;

  -- hora_acidente → hora_ocorrencia
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acidentes' AND column_name='hora_acidente'
  ) THEN
    ALTER TABLE public.acidentes RENAME COLUMN hora_acidente TO hora_ocorrencia;
  END IF;

  -- tipo → tipo_acidente (se tipo_acidente ainda não existir)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acidentes' AND column_name='tipo'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acidentes' AND column_name='tipo_acidente'
  ) THEN
    ALTER TABLE public.acidentes RENAME COLUMN tipo TO tipo_acidente;
  END IF;

  -- cat_emitida → comunicado_cat (se comunicado_cat ainda não existir)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acidentes' AND column_name='cat_emitida'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acidentes' AND column_name='comunicado_cat'
  ) THEN
    ALTER TABLE public.acidentes RENAME COLUMN cat_emitida TO comunicado_cat;
  END IF;
END $$;

-- Garantir coluna tipo_acidente existe (caso venha do ADD COLUMN anterior)
ALTER TABLE public.acidentes
  ADD COLUMN IF NOT EXISTS tipo_acidente  TEXT,
  ADD COLUMN IF NOT EXISTS hora_ocorrencia TIME,
  ADD COLUMN IF NOT EXISTS comunicado_cat  BOOLEAN DEFAULT false;

-- Dropar constraint CHECK antiga no campo tipo se existir
ALTER TABLE public.acidentes DROP CONSTRAINT IF EXISTS acidentes_tipo_check;

-- ────────────────────────────────────────────────────────────
-- ATESTADOS: renomear data → data_inicio
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- data → data_inicio
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='atestados' AND column_name='data'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='atestados' AND column_name='data_inicio'
  ) THEN
    ALTER TABLE public.atestados RENAME COLUMN data TO data_inicio;
  END IF;
END $$;

ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS data_inicio    DATE,
  ADD COLUMN IF NOT EXISTS data_fim       DATE,
  ADD COLUMN IF NOT EXISTS acidente_id    UUID REFERENCES public.acidentes(id),
  ADD COLUMN IF NOT EXISTS tipo_afastamento TEXT,
  ADD COLUMN IF NOT EXISTS medico         TEXT,
  ADD COLUMN IF NOT EXISTS crm            TEXT,
  ADD COLUMN IF NOT EXISTS cid            TEXT;

-- Dropar constraint CHECK antiga se existir
ALTER TABLE public.atestados DROP CONSTRAINT IF EXISTS atestados_tipo_check;

-- ────────────────────────────────────────────────────────────
-- COLABORADOR_EPI: suporte a uploads de documentos/assinatura
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.colaborador_epi
  ADD COLUMN IF NOT EXISTS tamanho         TEXT,
  ADD COLUMN IF NOT EXISTS numero          TEXT,
  ADD COLUMN IF NOT EXISTS data_entrega    DATE,
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS documento_url   TEXT,   -- URL do arquivo no Storage
  ADD COLUMN IF NOT EXISTS documento_nome  TEXT,   -- nome original do arquivo
  ADD COLUMN IF NOT EXISTS observacoes     TEXT;

-- ────────────────────────────────────────────────────────────
-- COLABORADORES: pix_tipo e vt_dados
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS pix_tipo TEXT,
  ADD COLUMN IF NOT EXISTS vt_dados JSONB DEFAULT '{}';

-- ────────────────────────────────────────────────────────────
-- FUNCAO_EPI: obrigatorio e quantidade
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.funcao_epi
  ADD COLUMN IF NOT EXISTS obrigatorio BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS quantidade  INTEGER DEFAULT 1;

-- ────────────────────────────────────────────────────────────
-- Storage bucket para documentos de EPI
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('epi-documentos', 'epi-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS para o bucket
CREATE POLICY IF NOT EXISTS "Authenticated can upload EPI docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'epi-documentos');

CREATE POLICY IF NOT EXISTS "Authenticated can read EPI docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'epi-documentos');

CREATE POLICY IF NOT EXISTS "Authenticated can delete EPI docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'epi-documentos');
