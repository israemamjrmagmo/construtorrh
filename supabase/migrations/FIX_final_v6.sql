-- FIX FINAL: adiciona hora_acidente que ficou faltando
ALTER TABLE public.acidentes
  ADD COLUMN IF NOT EXISTS hora_acidente   TIME,
  ADD COLUMN IF NOT EXISTS tipo            TEXT,
  ADD COLUMN IF NOT EXISTS local_acidente  TEXT,
  ADD COLUMN IF NOT EXISTS cat_emitida     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'em_investigacao',
  ADD COLUMN IF NOT EXISTS documento_url   TEXT,
  ADD COLUMN IF NOT EXISTS documento_nome  TEXT;

ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS assinada        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS documento_url   TEXT,
  ADD COLUMN IF NOT EXISTS documento_nome  TEXT;

ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS com_afastamento BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS descricao       TEXT,
  ADD COLUMN IF NOT EXISTS documento_url   TEXT,
  ADD COLUMN IF NOT EXISTS documento_nome  TEXT;

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS vale_transporte BOOLEAN DEFAULT FALSE;

ALTER TABLE public.colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_genero_check;

ALTER TABLE public.funcoes
  ADD COLUMN IF NOT EXISTS valor_hora_clt      NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS valor_hora_autonomo NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS contratos_valores   JSONB DEFAULT '{}';

SELECT '✅ Pronto!' AS resultado;
