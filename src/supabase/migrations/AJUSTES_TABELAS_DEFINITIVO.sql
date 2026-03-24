-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — AJUSTES DE TABELAS (script definitivo e seguro)
-- Execute INTEGRALMENTE no Supabase SQL Editor
-- Todas as operações usam IF NOT EXISTS / IF EXISTS — seguro re-executar
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — ponto_lancamentos: status + colunas de pagamento + snapshot
-- ══════════════════════════════════════════════════════════════════════════

-- 1.1 Remover constraint antiga e recriar com TODOS os status do fluxo
ALTER TABLE public.ponto_lancamentos
  DROP CONSTRAINT IF EXISTS ponto_lancamentos_status_check,
  DROP CONSTRAINT IF EXISTS check_status;

ALTER TABLE public.ponto_lancamentos
  ADD CONSTRAINT ponto_lancamentos_status_check
    CHECK (status IN (
      'rascunho',             -- editável no Ponto
      'aguardando_aprovacao', -- aguardando gestor no Ponto
      'em_fechamento',        -- enviado para o Fechamento
      'aprovado',             -- aprovado no Fechamento (snapshot gravado)
      'recusado',             -- recusado (legado, não usado no novo fluxo)
      'liberado',             -- liberado para pagamento
      'pago'                  -- pago (status final)
    ));

-- 1.2 Colunas de pagamento
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS data_pagamento   DATE,
  ADD COLUMN IF NOT EXISTS obs_pagamento    TEXT,
  ADD COLUMN IF NOT EXISTS motivo_recusa    TEXT;

-- 1.3 Colunas de snapshot (trava imutável ao aprovar)
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS snap_valor_hora        NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS snap_horas_normais     NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS snap_horas_extras      NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS snap_valor_horas       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_producao    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_dsr         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_premio      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_total       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_faltas            INT,
  ADD COLUMN IF NOT EXISTS snap_vt_diario         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS snap_desconto_vt       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_desconto_adiant   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_inss              NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_ir                NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_liquido           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_fechado_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snap_fechado_por       TEXT;

-- 1.4 Migrar registros legados 'aprovado' sem snapshot → em_fechamento
--     (só afeta registros antigos que nunca passaram pelo novo fluxo)
UPDATE public.ponto_lancamentos
  SET status = 'em_fechamento'
  WHERE status = 'aprovado'
    AND snap_valor_total IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — pagamentos: colunas financeiras que o código usa
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS obra_id         UUID REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_bruto     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS inss            NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fgts            NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ir              NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vale_transporte NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adiantamento    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_liquido   NUMERIC(12,2);

-- Atualizar tipos permitidos em pagamentos.tipo
ALTER TABLE public.pagamentos
  DROP CONSTRAINT IF EXISTS pagamentos_tipo_check;
ALTER TABLE public.pagamentos
  ADD CONSTRAINT pagamentos_tipo_check
    CHECK (tipo IN (
      'folha','mensal','quinzenal','semanal',
      'adiantamento','rescisao','ferias',
      'decimo_terceiro','13_salario','bonus','outro'
    ));

-- ══════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — provisoes_fgts: tabela usada pela página Provisões
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.provisoes_fgts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id        UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id               UUID REFERENCES public.obras(id) ON DELETE SET NULL,
  competencia           TEXT NOT NULL,           -- YYYY-MM
  salario_base          NUMERIC(12,2),
  fgts_mensal           NUMERIC(12,2),
  ferias_provisionadas  NUMERIC(12,2),
  decimo_terceiro       NUMERIC(12,2),
  total_provisao        NUMERIC(12,2),
  observacoes           TEXT
);
ALTER TABLE public.provisoes_fgts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provisoes_fgts_all" ON public.provisoes_fgts;
CREATE POLICY "provisoes_fgts_all" ON public.provisoes_fgts
  FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — adiantamentos
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.adiantamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia     TEXT NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'adiantamento'
                    CHECK (tipo IN ('adiantamento','vale','ajuda_custo','outros')),
  valor           NUMERIC(12,2) NOT NULL DEFAULT 0,
  descricao       TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','pago','cancelado')),
  data_pagamento  DATE,
  descontado_em   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "adiantamentos_all" ON public.adiantamentos;
CREATE POLICY "adiantamentos_all" ON public.adiantamentos
  FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════
-- BLOCO 5 — tabelas INSS e IR (usadas por EncargosPage)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tabela_inss (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faixa_ini  NUMERIC(12,2) NOT NULL,
  faixa_fim  NUMERIC(12,2),
  aliquota   NUMERIC(5,2)  NOT NULL,
  vigencia   TEXT NOT NULL DEFAULT '2026',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.tabela_ir (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faixa_ini  NUMERIC(12,2) NOT NULL,
  faixa_fim  NUMERIC(12,2),
  aliquota   NUMERIC(5,2)  NOT NULL,
  deducao    NUMERIC(12,2) NOT NULL DEFAULT 0,
  vigencia   TEXT NOT NULL DEFAULT '2026',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.tabela_inss ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_ir   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tabela_inss_all" ON public.tabela_inss;
DROP POLICY IF EXISTS "tabela_ir_all"   ON public.tabela_ir;
CREATE POLICY "tabela_inss_all" ON public.tabela_inss FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tabela_ir_all"   ON public.tabela_ir   FOR ALL USING (true) WITH CHECK (true);

-- INSS 2026 progressivo
INSERT INTO public.tabela_inss (faixa_ini, faixa_fim, aliquota, vigencia)
SELECT * FROM (VALUES
  (0.00,     1518.00,  7.50, '2026'),
  (1518.01,  2793.88,  9.00, '2026'),
  (2793.89,  4190.83, 12.00, '2026'),
  (4190.84,  8157.41, 14.00, '2026')
) AS v(a,b,c,d)
WHERE NOT EXISTS (SELECT 1 FROM public.tabela_inss WHERE vigencia = '2026');

-- IR 2026 (isento até R$5.000)
INSERT INTO public.tabela_ir (faixa_ini, faixa_fim, aliquota, deducao, vigencia)
SELECT * FROM (VALUES
  (0.00,     5000.00,  0.00,    0.00,    '2026'),
  (5000.01,  5479.00,  7.50,  375.00,    '2026'),
  (5479.01,  6433.68, 15.00,  785.93,    '2026'),
  (6433.69,  7764.05, 22.50, 1268.67,    '2026'),
  (7764.06,  NULL,    27.50, 1651.87,    '2026')
) AS v(a,b,c,d,e)
WHERE NOT EXISTS (SELECT 1 FROM public.tabela_ir WHERE vigencia = '2026');

-- ══════════════════════════════════════════════════════════════════════════
-- BLOCO 6 — colaboradores: garantir colunas extras usadas no código
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS salario         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS observacoes     TEXT,
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'ativo'
    CHECK (status IN ('ativo','inativo','afastado','ferias'));

-- ══════════════════════════════════════════════════════════════════════════
-- BLOCO 7 — profiles: garantir colunas nome e ativo
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nome   TEXT,
  ADD COLUMN IF NOT EXISTS ativo  BOOLEAN DEFAULT TRUE;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOCO 8 — historico_chapa: garantir colunas usadas
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.historico_chapa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  chapa           TEXT,
  funcao_id       UUID REFERENCES public.funcoes(id) ON DELETE SET NULL,
  tipo_contrato   TEXT,
  data_inicio     DATE,
  data_fim        DATE,
  motivo_troca    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.historico_chapa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historico_chapa_all" ON public.historico_chapa;
CREATE POLICY "historico_chapa_all" ON public.historico_chapa
  FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ══════════════════════════════════════════════════════════════════════════
SELECT
  table_name,
  COUNT(*) AS total_colunas
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'ponto_lancamentos','pagamentos','provisoes_fgts',
    'adiantamentos','tabela_inss','tabela_ir',
    'colaboradores','profiles','historico_chapa'
  )
GROUP BY table_name
ORDER BY table_name;
