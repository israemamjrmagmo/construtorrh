-- ══════════════════════════════════════════════════════════════════
-- Migração 004 v2: Fix tipo_contrato + EPI + Ocorrências
-- ══════════════════════════════════════════════════════════════════

-- 1. Fix constraint tipo_contrato
ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_tipo_contrato_check;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_tipo_contrato_check
  CHECK (tipo_contrato IN ('clt','autonomo','pj','temporario','aprendiz','estagiario'));

-- 2. EPI Catálogo — campos adicionais
ALTER TABLE public.epi_catalogo
  ADD COLUMN IF NOT EXISTS categoria        TEXT,
  ADD COLUMN IF NOT EXISTS numero_ca        TEXT,
  ADD COLUMN IF NOT EXISTS unidade          TEXT DEFAULT 'unidade',
  ADD COLUMN IF NOT EXISTS requer_tamanho   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS requer_numero    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS vida_util_meses  INTEGER,
  ADD COLUMN IF NOT EXISTS ativo            BOOLEAN DEFAULT true;

-- 3. Funcao-EPI
CREATE TABLE IF NOT EXISTS public.funcao_epi (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcao_id   UUID NOT NULL REFERENCES public.funcoes(id) ON DELETE CASCADE,
  epi_id      UUID NOT NULL REFERENCES public.epi_catalogo(id) ON DELETE CASCADE,
  obrigatorio BOOLEAN DEFAULT true,
  quantidade  INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(funcao_id, epi_id)
);

-- 4. Colaborador-EPI
CREATE TABLE IF NOT EXISTS public.colaborador_epi (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id      UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  epi_id              UUID NOT NULL REFERENCES public.epi_catalogo(id),
  funcao_id           UUID REFERENCES public.funcoes(id),
  tamanho             TEXT,
  numero              TEXT,
  data_entrega        DATE,
  quantidade_entregue INTEGER DEFAULT 0,
  status              TEXT DEFAULT 'pendente'
    CHECK (status IN ('pendente','entregue','devolvido','substituido')),
  observacoes         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Funcoes: valores por tipo de contrato (JSONB)
ALTER TABLE public.funcoes
  ADD COLUMN IF NOT EXISTS contratos_valores JSONB DEFAULT '{}';

-- 6. Acidentes: campos adicionais
ALTER TABLE public.acidentes
  ADD COLUMN IF NOT EXISTS comunicado_cat  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_acidente   TEXT,
  ADD COLUMN IF NOT EXISTS hora_ocorrencia TIME;

-- 7. Atestados: vincular ao acidente + campos de afastamento
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS acidente_id      UUID REFERENCES public.acidentes(id),
  ADD COLUMN IF NOT EXISTS tipo_afastamento TEXT DEFAULT 'doenca',
  ADD COLUMN IF NOT EXISTS cid              TEXT,
  ADD COLUMN IF NOT EXISTS medico           TEXT,
  ADD COLUMN IF NOT EXISTS crm              TEXT,
  ADD COLUMN IF NOT EXISTS data_retorno     DATE;

-- 8. RLS — DROP antes de CREATE (sem IF NOT EXISTS no CREATE POLICY)
ALTER TABLE public.funcao_epi      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaborador_epi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_funcao_epi"  ON public.funcao_epi;
DROP POLICY IF EXISTS "auth_colab_epi"   ON public.colaborador_epi;

CREATE POLICY "auth_funcao_epi"  ON public.funcao_epi
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "auth_colab_epi"   ON public.colaborador_epi
  FOR ALL USING (auth.role() = 'authenticated');

SELECT '✅ Migração 004 aplicada com sucesso!' AS resultado;
