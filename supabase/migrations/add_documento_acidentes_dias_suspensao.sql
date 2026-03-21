
-- Colunas de documento na tabela acidentes (para CAT)
ALTER TABLE public.acidentes
  ADD COLUMN IF NOT EXISTS documento_url  TEXT,
  ADD COLUMN IF NOT EXISTS documento_nome TEXT;

-- Coluna de vínculo com acidente na tabela atestados
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS acidente_id UUID REFERENCES public.acidentes(id);

-- Dias de suspensão em advertências
ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS dias_suspensao INTEGER;
