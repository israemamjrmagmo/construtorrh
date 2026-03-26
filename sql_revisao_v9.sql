-- ============================================================
--  ConstrutorRH — Script SQL Definitivo v9
--  NOVIDADE vs v8: considera_sabado_util em obras + aguardando_pagamento no VT
--  IDEMPOTENTE: seguro para re-executar
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. obras — campo considera_sabado_util
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS considera_sabado_util boolean NOT NULL DEFAULT false;

-- status: garantir que inclui 'em_andamento' e 'ativo'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc USING (constraint_name)
    WHERE tc.table_name = 'obras'
      AND cc.check_clause NOT LIKE '%em_andamento%'
  ) THEN
    ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS obras_status_check;
    ALTER TABLE public.obras ADD CONSTRAINT obras_status_check
      CHECK (status IN ('ativo','em_andamento','concluida','pausada','cancelada'));
  END IF;
END $$;

UPDATE public.obras SET status = 'em_andamento' WHERE status = 'ativo';


-- ─────────────────────────────────────────────────────────────
-- 2. vale_transporte — status 'aguardando_pagamento'
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc USING (constraint_name)
    WHERE tc.table_name = 'vale_transporte'
      AND cc.check_clause NOT LIKE '%aguardando_pagamento%'
  ) THEN
    ALTER TABLE public.vale_transporte DROP CONSTRAINT IF EXISTS vale_transporte_status_check;
    ALTER TABLE public.vale_transporte ADD CONSTRAINT vale_transporte_status_check
      CHECK (status IN ('pendente','aguardando_pagamento','pago','cancelado'));
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 3. colaborador_historico_contrato (igual v8)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colaborador_historico_contrato (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid          NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo_contrato   text          NOT NULL
                    CHECK (tipo_contrato IN ('clt', 'autonomo', 'pj')),
  data_inicio     date          NOT NULL,
  data_fim        date,
  observacao      text,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_contrato_colaborador
  ON public.colaborador_historico_contrato (colaborador_id);

ALTER TABLE public.colaborador_historico_contrato ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'colaborador_historico_contrato'
      AND policyname = 'hc_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY hc_all ON public.colaborador_historico_contrato
        FOR ALL TO authenticated USING (true) WITH CHECK (true)
    $policy$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 4. adiantamentos (igual v8)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS desconto_tipo          text
    CHECK (desconto_tipo IN ('unico','parcelado')),
  ADD COLUMN IF NOT EXISTS desconto_parcelas      integer,
  ADD COLUMN IF NOT EXISTS desconto_parcela_atual integer,
  ADD COLUMN IF NOT EXISTS desconto_a_partir      text,
  ADD COLUMN IF NOT EXISTS desconto_obs           text,
  ADD COLUMN IF NOT EXISTS descontado_em          text,
  ADD COLUMN IF NOT EXISTS requisicao_url         text;


-- ─────────────────────────────────────────────────────────────
-- 5. premios (igual v8)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.premios
  ADD COLUMN IF NOT EXISTS obra_id     uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo        text,
  ADD COLUMN IF NOT EXISTS data        date,
  ADD COLUMN IF NOT EXISTS competencia text;


-- ─────────────────────────────────────────────────────────────
-- 6. ponto_lancamentos — snap_* (igual v8)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS snap_valor_total      numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_liquido          numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_horas      numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_dsr        numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_producao   numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_premio     numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_inss             numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_ir               numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_desconto_vt      numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_desconto_adiant  numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_horas_normais    numeric(8,2),
  ADD COLUMN IF NOT EXISTS snap_horas_extras     numeric(8,2),
  ADD COLUMN IF NOT EXISTS snap_valor_hora       numeric(10,4),
  ADD COLUMN IF NOT EXISTS snap_vt_diario        numeric(10,4),
  ADD COLUMN IF NOT EXISTS snap_faltas           integer,
  ADD COLUMN IF NOT EXISTS snap_horas            numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_dsr              numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_producao         numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_premio           numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_vt               numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_ad               numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_fechado_em       timestamptz,
  ADD COLUMN IF NOT EXISTS snap_fechado_por      text;


-- ─────────────────────────────────────────────────────────────
-- 7. registro_ponto (igual v8)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.registro_ponto
  ADD COLUMN IF NOT EXISTS lancamento_id      uuid REFERENCES public.ponto_lancamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obra_id            uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hora_entrada       text,
  ADD COLUMN IF NOT EXISTS saida_almoco       text,
  ADD COLUMN IF NOT EXISTS retorno_almoco     text,
  ADD COLUMN IF NOT EXISTS hora_saida         text,
  ADD COLUMN IF NOT EXISTS he_entrada         text,
  ADD COLUMN IF NOT EXISTS he_saida           text,
  ADD COLUMN IF NOT EXISTS horas_trabalhadas  numeric(5,2),
  ADD COLUMN IF NOT EXISTS horas_extras       numeric(5,2),
  ADD COLUMN IF NOT EXISTS presente           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS falta              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status             text,
  ADD COLUMN IF NOT EXISTS justificativa      text,
  ADD COLUMN IF NOT EXISTS observacoes        text;


-- ─────────────────────────────────────────────────────────────
-- 8. atestados (igual v8)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS dias_afastamento   integer,
  ADD COLUMN IF NOT EXISTS com_afastamento    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cid                text,
  ADD COLUMN IF NOT EXISTS medico             text,
  ADD COLUMN IF NOT EXISTS tipo               text
    CHECK (tipo IN ('medico','comparecimento','declaracao')),
  ADD COLUMN IF NOT EXISTS observacoes        text,
  ADD COLUMN IF NOT EXISTS documento_url      text,
  ADD COLUMN IF NOT EXISTS documento_nome     text;


-- ─────────────────────────────────────────────────────────────
-- 9. advertencias (igual v8)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS dias_suspensao   integer,
  ADD COLUMN IF NOT EXISTS documento_url    text,
  ADD COLUMN IF NOT EXISTS documento_nome   text;


-- ─────────────────────────────────────────────────────────────
-- 10. acidentes (igual v8)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.acidentes
  ADD COLUMN IF NOT EXISTS hora_acidente    text,
  ADD COLUMN IF NOT EXISTS gravidade        text
    CHECK (gravidade IN ('leve','moderado','grave','fatal')),
  ADD COLUMN IF NOT EXISTS local_acidente   text,
  ADD COLUMN IF NOT EXISTS cat_emitida      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS documento_url    text,
  ADD COLUMN IF NOT EXISTS documento_nome   text;


-- ─────────────────────────────────────────────────────────────
-- 11. rescisoes (igual v8)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rescisoes (
  id                         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id             uuid          NOT NULL
                               REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  data_rescisao              date          NOT NULL,
  tipo                       text          NOT NULL
                               CHECK (tipo IN (
                                 'sem_justa_causa','com_justa_causa','pedido_demissao',
                                 'acordo','aposentadoria','outros'
                               )),
  valor_saldo_fgts           numeric(12,2) NOT NULL DEFAULT 0,
  valor_aviso_previo         numeric(12,2) NOT NULL DEFAULT 0,
  valor_ferias_proporcionais numeric(12,2) NOT NULL DEFAULT 0,
  valor_13_proporcional      numeric(12,2) NOT NULL DEFAULT 0,
  valor_multa_fgts           numeric(12,2) NOT NULL DEFAULT 0,
  valor_outros               numeric(12,2) NOT NULL DEFAULT 0,
  total_rescisao             numeric(12,2) NOT NULL DEFAULT 0,
  observacoes                text,
  created_at                 timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.rescisoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rescisoes' AND policyname='rescisoes_all'
  ) THEN
    EXECUTE $policy$ CREATE POLICY rescisoes_all ON public.rescisoes FOR ALL TO authenticated USING (true) WITH CHECK (true) $policy$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 12. configuracoes — campos empresa (igual v8)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.configuracoes (chave, valor) VALUES
  ('empresa_razao_social', ''), ('empresa_email', ''),
  ('empresa_endereco', ''), ('empresa_cidade', ''),
  ('empresa_cep', ''), ('empresa_logo_url', '')
ON CONFLICT (chave) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 13. Storage — bucket "documentos" (igual v8)
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos', 'documentos', true) ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_upload') THEN EXECUTE $p$ CREATE POLICY documentos_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos') $p$; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_select_public') THEN EXECUTE $p$ CREATE POLICY documentos_select_public ON storage.objects FOR SELECT TO public USING (bucket_id = 'documentos') $p$; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_delete') THEN EXECUTE $p$ CREATE POLICY documentos_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documentos') $p$; END IF; END $$;
