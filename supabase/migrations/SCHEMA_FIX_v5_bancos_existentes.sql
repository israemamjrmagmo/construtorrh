-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — FIX PARA BANCOS EXISTENTES
-- Versão: v5  |  Data: 2026-03-22
--
-- ▸ USE ESTE ARQUIVO se seu banco já existe (tem tabelas criadas anteriormente)
-- ▸ Para banco NOVO/VAZIO use SCHEMA_DEFINITIVO_v5_2026.sql
--
-- O que este arquivo corrige/adiciona:
--   1. Remove constraint antiga UNIQUE(colaborador_id,data) em registro_ponto
--      → causava erro "duplicate key" ao lançar ponto multi-obra
--   2. Garante constraint correta UNIQUE(lancamento_id,data)
--   3. Remove constraint de número de lançamentos (max2_lancamentos) se existir
--   4. Adiciona colunas faltantes em ponto_lancamentos (status, motivo_recusa, fechamento_id)
--   5. Adiciona colunas faltantes em registro_ponto (lancamento_id, obra_id)
--   6. Adiciona colunas faltantes em ponto_producao (lancamento_id, obra_id)
--   7. Cria tabelas que podem não existir (ponto_fechamentos, funcao_valores, playbook_itens)
--   8. Adiciona índices novos
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. registro_ponto — corrigir constraint UNIQUE
-- ─────────────────────────────────────────────────────────────────────────────

-- Remover constraint ANTIGA (causava erro duplicate key no modo multi-obra)
ALTER TABLE public.registro_ponto
  DROP CONSTRAINT IF EXISTS registro_ponto_colaborador_id_data_key;

-- Remover versão anterior da constraint correta (para recriar limpa)
ALTER TABLE public.registro_ponto
  DROP CONSTRAINT IF EXISTS reg_ponto_lanc_data_unique;

-- Adicionar coluna lancamento_id se não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='registro_ponto' AND column_name='lancamento_id'
  ) THEN
    ALTER TABLE public.registro_ponto
      ADD COLUMN lancamento_id UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Adicionar coluna obra_id se não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='registro_ponto' AND column_name='obra_id'
  ) THEN
    ALTER TABLE public.registro_ponto
      ADD COLUMN obra_id UUID REFERENCES public.obras(id);
  END IF;
END $$;

-- Criar constraint correta (só possível se lancamento_id não tiver NULLs)
-- Se houver registros antigos sem lancamento_id, eles ficarão sem a constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.registro_ponto WHERE lancamento_id IS NULL LIMIT 1
  ) THEN
    ALTER TABLE public.registro_ponto
      ADD CONSTRAINT reg_ponto_lanc_data_unique UNIQUE (lancamento_id, data);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Não foi possível criar constraint reg_ponto_lanc_data_unique: %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ponto_lancamentos — colunas e constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- Remover constraint de limite de lançamentos se existir
ALTER TABLE public.ponto_lancamentos
  DROP CONSTRAINT IF EXISTS max2_lancamentos;
ALTER TABLE public.ponto_lancamentos
  DROP CONSTRAINT IF EXISTS ponto_lancamentos_max2_obra_mes;

-- Remover coluna numero_lancamento se existir (substituída por lógica na app)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ponto_lancamentos' AND column_name='numero_lancamento'
  ) THEN
    ALTER TABLE public.ponto_lancamentos DROP COLUMN numero_lancamento;
  END IF;
END $$;

-- Adicionar coluna status se não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ponto_lancamentos' AND column_name='status'
  ) THEN
    ALTER TABLE public.ponto_lancamentos
      ADD COLUMN status TEXT NOT NULL DEFAULT 'rascunho'
        CHECK (status IN ('rascunho','aguardando_aprovacao','aprovado','recusado','em_fechamento','pago'));
  END IF;
END $$;

-- Adicionar coluna motivo_recusa se não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ponto_lancamentos' AND column_name='motivo_recusa'
  ) THEN
    ALTER TABLE public.ponto_lancamentos ADD COLUMN motivo_recusa TEXT;
  END IF;
END $$;

-- Adicionar coluna fechamento_id se não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ponto_lancamentos' AND column_name='fechamento_id'
  ) THEN
    -- Verificar se ponto_fechamentos já existe
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='ponto_fechamentos'
    ) THEN
      ALTER TABLE public.ponto_lancamentos
        ADD COLUMN fechamento_id UUID REFERENCES public.ponto_fechamentos(id) ON DELETE SET NULL;
    ELSE
      ALTER TABLE public.ponto_lancamentos ADD COLUMN fechamento_id UUID;
    END IF;
  END IF;
END $$;

-- Atualizar lançamentos sem status (retrocompatibilidade)
UPDATE public.ponto_lancamentos SET status = 'rascunho' WHERE status IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ponto_fechamentos — criar se não existir
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

-- Adicionar FK de fechamento_id agora que ponto_fechamentos existe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ponto_lancamentos_fechamento_id_fkey'
  ) THEN
    ALTER TABLE public.ponto_lancamentos
      ADD CONSTRAINT ponto_lancamentos_fechamento_id_fkey
        FOREIGN KEY (fechamento_id) REFERENCES public.ponto_fechamentos(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'FK fechamento_id já existe ou erro: %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ponto_producao — colunas faltantes
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ponto_producao' AND column_name='lancamento_id'
  ) THEN
    ALTER TABLE public.ponto_producao
      ADD COLUMN lancamento_id UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ponto_producao' AND column_name='obra_id'
  ) THEN
    ALTER TABLE public.ponto_producao
      ADD COLUMN obra_id UUID REFERENCES public.obras(id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. funcao_valores — criar se não existir
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
-- 6. playbook_itens — criar se não existir
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
CREATE INDEX IF NOT EXISTS idx_lancamentos_obra_mes    ON public.ponto_lancamentos(obra_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_reg_ponto_colab_data    ON public.registro_ponto(colaborador_id, data);
CREATE INDEX IF NOT EXISTS idx_reg_ponto_lancamento    ON public.registro_ponto(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_producao_lancamento     ON public.ponto_producao(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_funcao_valores_func     ON public.funcao_valores(funcao_id);
CREATE INDEX IF NOT EXISTS idx_playbook_itens_obra     ON public.playbook_itens(obra_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO FINAL
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  '✅ FIX v5 aplicado!' AS status,
  (SELECT COUNT(*) FROM public.ponto_lancamentos) AS total_lancamentos,
  (SELECT COUNT(*) FROM public.registro_ponto)    AS total_registros,
  (SELECT COUNT(*) FROM public.ponto_producao)    AS total_producoes;
