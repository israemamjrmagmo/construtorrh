-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — CORREÇÃO DE SCHEMA PARA BANCOS EXISTENTES
-- Versão: v4-fix  |  Data: 2026-03-22
--
-- ▸ Execute este script se você JÁ tinha o banco criado anteriormente
-- ▸ Adiciona com segurança (IF NOT EXISTS) todas as colunas novas
-- ▸ Idempotente: pode rodar mais de uma vez sem erro
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ponto_lancamentos — colunas adicionadas na v3/v4
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS motivo_recusa TEXT,
  ADD COLUMN IF NOT EXISTS fechamento_id UUID;

-- Remover constraint antiga (numero_lancamento) se ainda existir
ALTER TABLE public.ponto_lancamentos
  DROP CONSTRAINT IF EXISTS max2_lancamentos;

-- Remover coluna numero_lancamento se ainda existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ponto_lancamentos' AND column_name = 'numero_lancamento'
  ) THEN
    ALTER TABLE public.ponto_lancamentos DROP COLUMN numero_lancamento;
  END IF;
END $$;

-- Adicionar CHECK constraint de status (se não existir)
ALTER TABLE public.ponto_lancamentos
  DROP CONSTRAINT IF EXISTS ponto_lancamentos_status_check;
ALTER TABLE public.ponto_lancamentos
  ADD CONSTRAINT ponto_lancamentos_status_check
  CHECK (status IN ('rascunho','aguardando_aprovacao','aprovado','recusado','em_fechamento','pago'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ponto_fechamentos — tabela de consolidação para pagamento
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ponto_fechamentos (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  criado_em            TIMESTAMPTZ DEFAULT NOW(),
  mes_referencia       TEXT,
  periodo_inicio       DATE,
  periodo_fim          DATE,
  status               TEXT NOT NULL DEFAULT 'aberto'
                       CHECK (status IN ('aberto','fechado','pago')),
  total_colaboradores  INTEGER DEFAULT 0,
  total_lancamentos    INTEGER DEFAULT 0,
  valor_total          NUMERIC(14,2) DEFAULT 0,
  observacoes          TEXT
);
ALTER TABLE public.ponto_fechamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ponto_fechamentos_auth" ON public.ponto_fechamentos;
CREATE POLICY "ponto_fechamentos_auth" ON public.ponto_fechamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- FK de ponto_lancamentos → ponto_fechamentos (agora que a tabela existe)
ALTER TABLE public.ponto_lancamentos
  DROP CONSTRAINT IF EXISTS fk_lancamento_fechamento;
ALTER TABLE public.ponto_lancamentos
  ADD CONSTRAINT fk_lancamento_fechamento
    FOREIGN KEY (fechamento_id)
    REFERENCES public.ponto_fechamentos(id)
    ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. registro_ponto — UNIQUE constraint (corrige erro onConflict)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.registro_ponto
  ADD COLUMN IF NOT EXISTS lancamento_id UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS obra_id       UUID REFERENCES public.obras(id);

ALTER TABLE public.registro_ponto
  DROP CONSTRAINT IF EXISTS reg_ponto_lanc_data_unique;
ALTER TABLE public.registro_ponto
  ADD CONSTRAINT reg_ponto_lanc_data_unique
    UNIQUE (lancamento_id, data);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ponto_producao — colunas lancamento_id e obra_id
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ponto_producao
  ADD COLUMN IF NOT EXISTS lancamento_id UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS obra_id       UUID REFERENCES public.obras(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. funcao_valores — tabela de valor/hora por função + contrato
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funcao_valores (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  funcao_id      UUID NOT NULL REFERENCES public.funcoes(id) ON DELETE CASCADE,
  tipo_contrato  TEXT NOT NULL
                 CHECK (tipo_contrato IN ('clt','autonomo','pj','estagiario','aprendiz','temporario')),
  valor_hora     NUMERIC(10,4) NOT NULL DEFAULT 0,
  UNIQUE (funcao_id, tipo_contrato)
);
ALTER TABLE public.funcao_valores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcao_valores_auth" ON public.funcao_valores;
CREATE POLICY "funcao_valores_auth" ON public.funcao_valores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. playbook_itens — tabela de serviços/preços por obra
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.playbook_itens (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  obra_id         UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  categoria       TEXT,
  unidade         TEXT NOT NULL DEFAULT 'm²',
  preco_unitario  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ativo           BOOLEAN DEFAULT TRUE
);
ALTER TABLE public.playbook_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "playbook_itens_auth" ON public.playbook_itens;
CREATE POLICY "playbook_itens_auth" ON public.playbook_itens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Índices novos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lancamentos_status      ON public.ponto_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_fechamento  ON public.ponto_lancamentos(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_reg_ponto_lancamento    ON public.registro_ponto(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_producao_lancamento     ON public.ponto_producao(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_funcao_valores_func     ON public.funcao_valores(funcao_id);
CREATE INDEX IF NOT EXISTS idx_playbook_itens_obra     ON public.playbook_itens(obra_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Atualizar SCHEMA_DEFINITIVO: coluna status dos lancamentos existentes
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.ponto_lancamentos SET status = 'rascunho' WHERE status IS NULL;

SELECT '✅ Correção v4-fix aplicada com sucesso!' AS resultado;
