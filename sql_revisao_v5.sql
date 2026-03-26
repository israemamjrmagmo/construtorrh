-- ============================================================
--  ConstrutorRH — Script SQL Completo e Definitivo (v5)
--  Todas as operações são idempotentes (seguras para re-executar)
--  Cole no SQL Editor do Supabase e execute.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. adiantamentos — colunas de parcelamento + requisição
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS desconto_tipo         text
    CHECK (desconto_tipo IN ('unico','parcelado')),
  ADD COLUMN IF NOT EXISTS desconto_parcelas     integer,          -- total de parcelas
  ADD COLUMN IF NOT EXISTS desconto_parcela_atual integer,         -- parcela já descontada
  ADD COLUMN IF NOT EXISTS desconto_a_partir     text,             -- 'YYYY-MM'
  ADD COLUMN IF NOT EXISTS desconto_obs          text,
  ADD COLUMN IF NOT EXISTS descontado_em         text,             -- 'YYYY-MM' quando foi descontado
  ADD COLUMN IF NOT EXISTS requisicao_url        text;             -- URL do PDF assinado


-- ─────────────────────────────────────────────────────────────
-- 2. premios — colunas usadas pelo app
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.premios
  ADD COLUMN IF NOT EXISTS obra_id       uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo          text,
  ADD COLUMN IF NOT EXISTS data          date,
  ADD COLUMN IF NOT EXISTS competencia   text;                     -- 'YYYY-MM'


-- ─────────────────────────────────────────────────────────────
-- 3. ponto_lancamentos — colunas snap_*
--    Nomes extraídos diretamente do código-fonte
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.ponto_lancamentos
  -- valores monetários (usados em FechamentoPonto, Encargos, Jurídico, Pagamentos)
  ADD COLUMN IF NOT EXISTS snap_valor_total      numeric(12,2),   -- bruto total
  ADD COLUMN IF NOT EXISTS snap_liquido          numeric(12,2),   -- líquido a pagar
  ADD COLUMN IF NOT EXISTS snap_valor_horas      numeric(12,2),   -- valor horas normais+extras
  ADD COLUMN IF NOT EXISTS snap_valor_dsr        numeric(12,2),   -- valor DSR
  ADD COLUMN IF NOT EXISTS snap_valor_producao   numeric(12,2),   -- valor produção
  ADD COLUMN IF NOT EXISTS snap_valor_premio     numeric(12,2),   -- valor prêmio
  ADD COLUMN IF NOT EXISTS snap_inss             numeric(12,2),   -- desconto INSS
  ADD COLUMN IF NOT EXISTS snap_ir               numeric(12,2),   -- desconto IR
  ADD COLUMN IF NOT EXISTS snap_desconto_vt      numeric(12,2),   -- desconto VT
  ADD COLUMN IF NOT EXISTS snap_desconto_adiant  numeric(12,2),   -- desconto adiantamento
  -- quantidades / rates
  ADD COLUMN IF NOT EXISTS snap_horas_normais    numeric(8,2),    -- qtd horas normais
  ADD COLUMN IF NOT EXISTS snap_horas_extras     numeric(8,2),    -- qtd horas extras
  ADD COLUMN IF NOT EXISTS snap_valor_hora       numeric(10,4),   -- valor unitário da hora
  ADD COLUMN IF NOT EXISTS snap_vt_diario        numeric(10,4),   -- VT diário
  ADD COLUMN IF NOT EXISTS snap_faltas           integer,         -- dias de falta
  -- aliases curtos usados em Pagamentos.tsx e Juridico.tsx
  ADD COLUMN IF NOT EXISTS snap_horas            numeric(12,2),   -- alias snap_valor_horas
  ADD COLUMN IF NOT EXISTS snap_dsr              numeric(12,2),   -- alias snap_valor_dsr
  ADD COLUMN IF NOT EXISTS snap_producao         numeric(12,2),   -- alias snap_valor_producao
  ADD COLUMN IF NOT EXISTS snap_premio           numeric(12,2),   -- alias snap_valor_premio
  ADD COLUMN IF NOT EXISTS snap_vt               numeric(12,2),   -- alias snap_desconto_vt
  ADD COLUMN IF NOT EXISTS snap_ad               numeric(12,2),   -- alias snap_desconto_adiant
  -- auditoria
  ADD COLUMN IF NOT EXISTS snap_fechado_em       timestamptz,
  ADD COLUMN IF NOT EXISTS snap_fechado_por      text;


-- ─────────────────────────────────────────────────────────────
-- 4. registro_ponto — colunas completas do espelho de ponto
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.registro_ponto
  ADD COLUMN IF NOT EXISTS hora_entrada     text,                 -- '07:00'
  ADD COLUMN IF NOT EXISTS saida_almoco     text,                 -- '12:00'
  ADD COLUMN IF NOT EXISTS retorno_almoco   text,                 -- '13:00'
  ADD COLUMN IF NOT EXISTS hora_saida       text,                 -- '17:00'
  ADD COLUMN IF NOT EXISTS he_entrada       text,                 -- hora início H.Extra
  ADD COLUMN IF NOT EXISTS he_saida         text,                 -- hora fim / qtd H.Extra
  ADD COLUMN IF NOT EXISTS horas_trabalhadas numeric(5,2),        -- total horas trabalhadas
  ADD COLUMN IF NOT EXISTS horas_extras      numeric(5,2),        -- total horas extras
  ADD COLUMN IF NOT EXISTS presente          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS falta             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status            text,
  ADD COLUMN IF NOT EXISTS justificativa     text,
  ADD COLUMN IF NOT EXISTS observacoes       text,
  ADD COLUMN IF NOT EXISTS obra_id           uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lancamento_id     uuid REFERENCES public.ponto_lancamentos(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────
-- 5. Tabela rescisoes (nova)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rescisoes (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id             uuid        NOT NULL
                               REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  data_rescisao              date        NOT NULL,
  tipo                       text        NOT NULL
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
  created_at                 timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.rescisoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rescisoes'
      AND policyname = 'rescisoes_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY rescisoes_all
        ON public.rescisoes FOR ALL
        TO authenticated
        USING (true) WITH CHECK (true)
    $policy$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 6. Storage — bucket "documentos"
--    Políticas criadas via RLS em storage.objects
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- upload para autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'documentos_upload'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY documentos_upload ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'documentos')
    $policy$;
  END IF;
END $$;

-- leitura pública (URLs públicas funcionam)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'documentos_select_public'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY documentos_select_public ON storage.objects
        FOR SELECT TO public
        USING (bucket_id = 'documentos')
    $policy$;
  END IF;
END $$;

-- exclusão para autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'documentos_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY documentos_delete ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = 'documentos')
    $policy$;
  END IF;
END $$;
