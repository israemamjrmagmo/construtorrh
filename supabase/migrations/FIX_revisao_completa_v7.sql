-- ══════════════════════════════════════════════════════════════════════════════
-- FIX REVISÃO COMPLETA v7 — Execute no Supabase SQL Editor
-- Corrige todos os problemas identificados em bancos existentes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. colaboradores — colunas que podem estar faltando ───────────────────────
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS vale_transporte BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vt_dados        JSONB,
  ADD COLUMN IF NOT EXISTS pix_tipo        TEXT,
  ADD COLUMN IF NOT EXISTS genero          TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil    TEXT,
  ADD COLUMN IF NOT EXISTS nacionalidade   TEXT,
  ADD COLUMN IF NOT EXISTS naturalidade    TEXT,
  ADD COLUMN IF NOT EXISTS escolaridade    TEXT,
  ADD COLUMN IF NOT EXISTS nome_mae        TEXT,
  ADD COLUMN IF NOT EXISTS nome_pai        TEXT,
  ADD COLUMN IF NOT EXISTS titulo_eleitor  TEXT,
  ADD COLUMN IF NOT EXISTS zona_eleitoral  TEXT,
  ADD COLUMN IF NOT EXISTS reservista      TEXT,
  ADD COLUMN IF NOT EXISTS foto_url        TEXT;

-- Remover constraint de gênero se existir (impede importação de 'M','F')
ALTER TABLE public.colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_genero_check;

-- ── 2. funcoes — colunas que podem estar faltando ─────────────────────────────
ALTER TABLE public.funcoes
  ADD COLUMN IF NOT EXISTS valor_hora_clt      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_hora_autonomo NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS contratos_valores   JSONB,
  ADD COLUMN IF NOT EXISTS categoria           TEXT;

-- ── 3. acidentes — colunas e renomeações ──────────────────────────────────────
ALTER TABLE public.acidentes
  ADD COLUMN IF NOT EXISTS hora_acidente   TIME,
  ADD COLUMN IF NOT EXISTS hora_ocorrencia TIME,
  ADD COLUMN IF NOT EXISTS tipo_acidente   TEXT,
  ADD COLUMN IF NOT EXISTS local_acidente  TEXT,
  ADD COLUMN IF NOT EXISTS descricao       TEXT,
  ADD COLUMN IF NOT EXISTS testemunhas     TEXT,
  ADD COLUMN IF NOT EXISTS afastamento     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dias_afastamento INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cat_emitida     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cat_numero      TEXT,
  ADD COLUMN IF NOT EXISTS gravidade       TEXT,
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'aberto';

-- Renomear data_acidente → data_ocorrencia se necessário
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='data_acidente')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='data_ocorrencia') THEN
    ALTER TABLE public.acidentes RENAME COLUMN data_acidente TO data_ocorrencia;
  END IF;
END $$;

-- ── 4. advertencias — colunas que podem estar faltando ────────────────────────
ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS assinada        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_assinatura DATE,
  ADD COLUMN IF NOT EXISTS documento_url   TEXT;

-- ── 5. atestados — ajustes ────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atestados' AND column_name='tipo_afastamento')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atestados' AND column_name='tipo') THEN
    ALTER TABLE public.atestados RENAME COLUMN tipo_afastamento TO tipo;
  END IF;
END $$;

ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS tipo            TEXT,
  ADD COLUMN IF NOT EXISTS cid             TEXT,
  ADD COLUMN IF NOT EXISTS medico          TEXT,
  ADD COLUMN IF NOT EXISTS crm             TEXT,
  ADD COLUMN IF NOT EXISTS documento_url   TEXT,
  ADD COLUMN IF NOT EXISTS acidente_id     UUID REFERENCES public.acidentes(id) ON DELETE SET NULL;

-- ── 6. ponto_lancamentos — garantir coluna status ─────────────────────────────
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS motivo_recusa   TEXT,
  ADD COLUMN IF NOT EXISTS obra_id         UUID REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_inicio     DATE,
  ADD COLUMN IF NOT EXISTS data_fim        DATE,
  ADD COLUMN IF NOT EXISTS mes_referencia  TEXT,
  ADD COLUMN IF NOT EXISTS aprovado_por    UUID,
  ADD COLUMN IF NOT EXISTS aprovado_em     TIMESTAMPTZ;

-- ── 7. registro_ponto — remover constraint antiga ────────────────────────────
ALTER TABLE public.registro_ponto
  DROP CONSTRAINT IF EXISTS registro_ponto_colaborador_id_data_key;

-- Garantir nova constraint correta
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='registro_ponto' AND constraint_name='reg_ponto_lanc_data_unique'
  ) THEN
    ALTER TABLE public.registro_ponto
      ADD CONSTRAINT reg_ponto_lanc_data_unique UNIQUE (lancamento_id, data);
  END IF;
END $$;

ALTER TABLE public.registro_ponto
  ADD COLUMN IF NOT EXISTS lancamento_id   UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS obra_id         UUID REFERENCES public.obras(id) ON DELETE SET NULL;

-- ── 8. ponto_producao — garantir colunas ─────────────────────────────────────
ALTER TABLE public.ponto_producao
  ADD COLUMN IF NOT EXISTS lancamento_id     UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS playbook_item_id  UUID REFERENCES public.playbook_itens(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS dias              JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS valor_total       NUMERIC(10,2) DEFAULT 0;

-- ── 9. funcao_epi — garantir colunas ─────────────────────────────────────────
ALTER TABLE public.funcao_epi
  ADD COLUMN IF NOT EXISTS quantidade      INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS obrigatorio     BOOLEAN DEFAULT true;

-- ── 10. Tabela feriados ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feriados (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data        DATE NOT NULL,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'nacional'
                CHECK (tipo IN ('nacional','estadual','municipal','facultativo')),
  recorrente  BOOLEAN NOT NULL DEFAULT true,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feriados_data_unique ON public.feriados(data);
ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feriados_all" ON public.feriados;
CREATE POLICY "feriados_all" ON public.feriados FOR ALL USING (true) WITH CHECK (true);

-- Inserir feriados 2026 (ON CONFLICT ignora duplicados)
INSERT INTO public.feriados (data, nome, tipo, recorrente) VALUES
  ('2026-01-01','Confraternização Universal','nacional',true),
  ('2026-02-16','Carnaval (segunda-feira)','nacional',false),
  ('2026-02-17','Carnaval (terça-feira)','nacional',false),
  ('2026-04-03','Paixão de Cristo','nacional',false),
  ('2026-04-05','Páscoa','nacional',false),
  ('2026-04-21','Tiradentes','nacional',true),
  ('2026-05-01','Dia do Trabalhador','nacional',true),
  ('2026-06-04','Corpus Christi','nacional',false),
  ('2026-09-07','Independência do Brasil','nacional',true),
  ('2026-10-12','Nossa Senhora Aparecida','nacional',true),
  ('2026-11-02','Finados','nacional',true),
  ('2026-11-15','Proclamação da República','nacional',true),
  ('2026-11-20','Consciência Negra','nacional',true),
  ('2026-12-25','Natal','nacional',true)
ON CONFLICT (data) DO NOTHING;

-- Inserir feriados 2025
INSERT INTO public.feriados (data, nome, tipo, recorrente) VALUES
  ('2025-01-01','Confraternização Universal','nacional',true),
  ('2025-03-03','Carnaval (segunda-feira)','nacional',false),
  ('2025-03-04','Carnaval (terça-feira)','nacional',false),
  ('2025-04-18','Paixão de Cristo','nacional',false),
  ('2025-04-20','Páscoa','nacional',false),
  ('2025-04-21','Tiradentes','nacional',true),
  ('2025-05-01','Dia do Trabalhador','nacional',true),
  ('2025-06-19','Corpus Christi','nacional',false),
  ('2025-09-07','Independência do Brasil','nacional',true),
  ('2025-10-12','Nossa Senhora Aparecida','nacional',true),
  ('2025-11-02','Finados','nacional',true),
  ('2025-11-15','Proclamação da República','nacional',true),
  ('2025-11-20','Consciência Negra','nacional',true),
  ('2025-12-25','Natal','nacional',true)
ON CONFLICT (data) DO NOTHING;

-- ── 11. Índices úteis ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_registro_ponto_lancamento ON public.registro_ponto(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_ponto_producao_item ON public.ponto_producao(playbook_item_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_funcao ON public.colaboradores(funcao_id);

SELECT 'FIX v7 aplicado com sucesso!' AS resultado;
