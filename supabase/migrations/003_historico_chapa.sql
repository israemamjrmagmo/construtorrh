-- Migração 003: Historico de chapas (imutabilidade + rastreio jurídico)
CREATE TABLE IF NOT EXISTS public.historico_chapa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  chapa           TEXT NOT NULL,
  funcao_id       UUID REFERENCES public.funcoes(id),
  tipo_contrato   TEXT,
  data_inicio     DATE NOT NULL,
  data_fim        DATE,
  motivo_troca    TEXT,
  registrado_por  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_chapa_colaborador
  ON public.historico_chapa(colaborador_id);

-- RLS
ALTER TABLE public.historico_chapa ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "historico_chapa_auth"
  ON public.historico_chapa FOR ALL
  USING (auth.role() = 'authenticated');

SELECT '✅ Migração 003 aplicada!' AS resultado;
