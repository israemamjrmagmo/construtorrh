-- ============================================================
--  ConstrutorRH — SQL v10
--  NOVIDADE: Sistema de Recontratação (vinculo_anterior_id)
--  IDEMPOTENTE: seguro para re-executar
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. colaboradores — campos de recontratação
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS vinculo_anterior_id  uuid
    REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_encerramento  text
    CHECK (motivo_encerramento IN (
      'mudanca_vinculo','demissao','rescisao_amigavel',
      'aposentadoria','outros'
    )),
  ADD COLUMN IF NOT EXISTS data_encerramento    date;

-- índice para busca rápida por CPF (todos os vínculos de um mesmo CPF)
CREATE INDEX IF NOT EXISTS idx_colaboradores_cpf
  ON public.colaboradores (cpf)
  WHERE cpf IS NOT NULL;

-- índice para busca de vínculos subsequentes
CREATE INDEX IF NOT EXISTS idx_colaboradores_vinculo_anterior
  ON public.colaboradores (vinculo_anterior_id)
  WHERE vinculo_anterior_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Demais campos v9 (idempotentes)
-- ─────────────────────────────────────────────────────────────

-- obras
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS considera_sabado_util boolean NOT NULL DEFAULT false;

-- vale_transporte status
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

-- colaborador_historico_contrato
CREATE TABLE IF NOT EXISTS public.colaborador_historico_contrato (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid          NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo_contrato   text          NOT NULL CHECK (tipo_contrato IN ('clt','autonomo','pj')),
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='colaborador_historico_contrato' AND policyname='hc_all') THEN
    EXECUTE $p$ CREATE POLICY hc_all ON public.colaborador_historico_contrato FOR ALL TO authenticated USING (true) WITH CHECK (true) $p$;
  END IF;
END $$;

-- configuracoes empresa
INSERT INTO public.configuracoes (chave, valor) VALUES
  ('empresa_razao_social',''),('empresa_email',''),
  ('empresa_endereco',''),('empresa_cidade',''),
  ('empresa_cep',''),('empresa_logo_url','')
ON CONFLICT (chave) DO NOTHING;

-- storage bucket documentos
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos','documentos',true) ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_upload') THEN EXECUTE $p$ CREATE POLICY documentos_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='documentos') $p$; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_select_public') THEN EXECUTE $p$ CREATE POLICY documentos_select_public ON storage.objects FOR SELECT TO public USING (bucket_id='documentos') $p$; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_delete') THEN EXECUTE $p$ CREATE POLICY documentos_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='documentos') $p$; END IF; END $$;
