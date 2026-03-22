-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: Adicionar colunas faltando em banco existente
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── ACIDENTES ───────────────────────────────────────────────────────────────
ALTER TABLE public.acidentes
  ADD COLUMN IF NOT EXISTS hora_acidente   TIME,
  ADD COLUMN IF NOT EXISTS tipo            TEXT,
  ADD COLUMN IF NOT EXISTS local_acidente  TEXT,
  ADD COLUMN IF NOT EXISTS cat_emitida     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'em_investigacao',
  ADD COLUMN IF NOT EXISTS documento_url   TEXT,
  ADD COLUMN IF NOT EXISTS documento_nome  TEXT;

-- Renomear data_acidente → data_ocorrencia (só se ainda existir a coluna antiga)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acidentes' AND column_name='data_acidente'
  ) THEN
    ALTER TABLE public.acidentes RENAME COLUMN data_acidente TO data_ocorrencia;
  END IF;
END $$;

-- Renomear hora_ocorrencia → hora_acidente (só se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acidentes' AND column_name='hora_ocorrencia'
  ) THEN
    ALTER TABLE public.acidentes RENAME COLUMN hora_ocorrencia TO hora_acidente;
  END IF;
END $$;

-- Adicionar CHECK constraint de status (se não existir)
ALTER TABLE public.acidentes
  DROP CONSTRAINT IF EXISTS acidentes_status_check;
ALTER TABLE public.acidentes
  ADD CONSTRAINT acidentes_status_check
  CHECK (status IN ('em_investigacao','concluido','arquivado'));

-- ─── ADVERTÊNCIAS ────────────────────────────────────────────────────────────
ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS assinada       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS documento_url  TEXT,
  ADD COLUMN IF NOT EXISTS documento_nome TEXT;

-- Ampliar CHECK de tipo para incluir 'demissional'
ALTER TABLE public.advertencias
  DROP CONSTRAINT IF EXISTS advertencias_tipo_check;
ALTER TABLE public.advertencias
  ADD CONSTRAINT advertencias_tipo_check
  CHECK (tipo IN ('verbal','escrita','suspensao','demissional'));

-- ─── ATESTADOS ───────────────────────────────────────────────────────────────
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS com_afastamento  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS descricao        TEXT,
  ADD COLUMN IF NOT EXISTS documento_url    TEXT,
  ADD COLUMN IF NOT EXISTS documento_nome   TEXT;

-- Renomear tipo_afastamento → tipo (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='atestados' AND column_name='tipo_afastamento'
  ) THEN
    ALTER TABLE public.atestados RENAME COLUMN tipo_afastamento TO tipo;
  END IF;
END $$;

-- ─── COLABORADORES ───────────────────────────────────────────────────────────
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS vale_transporte BOOLEAN DEFAULT FALSE;

-- Remove CHECK restritivo de genero
ALTER TABLE public.colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_genero_check;

-- ─── FUNCOES ─────────────────────────────────────────────────────────────────
ALTER TABLE public.funcoes
  ADD COLUMN IF NOT EXISTS valor_hora_clt      NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS valor_hora_autonomo NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS contratos_valores   JSONB DEFAULT '{}';

-- ─── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
SELECT
  (SELECT string_agg(column_name, ', ' ORDER BY column_name)
   FROM information_schema.columns
   WHERE table_name = 'acidentes') AS colunas_acidentes,
  (SELECT string_agg(column_name, ', ' ORDER BY column_name)
   FROM information_schema.columns
   WHERE table_name = 'advertencias') AS colunas_advertencias,
  (SELECT string_agg(column_name, ', ' ORDER BY column_name)
   FROM information_schema.columns
   WHERE table_name = 'atestados') AS colunas_atestados;
