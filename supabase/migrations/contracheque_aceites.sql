-- ═══════════════════════════════════════════════════════════════════════
-- TABELA: contracheque_aceites
-- Registra o aceite digital ("Li e estou ciente") do colaborador ao
-- acessar/visualizar o contracheque.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contracheque_aceites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contracheque_id UUID NOT NULL REFERENCES public.contracheques(id) ON DELETE CASCADE,
  colaborador_id  UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,

  -- dados do aceite
  aceito_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address      TEXT,                         -- IP do dispositivo
  user_agent      TEXT,                         -- navegador/dispositivo
  nome_colaborador TEXT,                        -- snapshot do nome
  chapa           TEXT,                         -- snapshot da chapa
  competencia     TEXT,                         -- snapshot da competência (ex: "2026-04")

  -- controle
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- unicidade: um aceite por contracheque por colaborador
  UNIQUE (contracheque_id, colaborador_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_contracheque_aceites_contrac ON public.contracheque_aceites(contracheque_id);
CREATE INDEX IF NOT EXISTS idx_contracheque_aceites_colab   ON public.contracheque_aceites(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_contracheque_aceites_dt      ON public.contracheque_aceites(aceito_em DESC);

-- RLS
ALTER TABLE public.contracheque_aceites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aceites_insert_portal" ON public.contracheque_aceites;
CREATE POLICY "aceites_insert_portal" ON public.contracheque_aceites
  FOR INSERT WITH CHECK (true);   -- portal usa service-key no cliente publico

DROP POLICY IF EXISTS "aceites_select_auth" ON public.contracheque_aceites;
CREATE POLICY "aceites_select_auth" ON public.contracheque_aceites
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── VIEW para relatório jurídico ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_contracheque_aceites AS
SELECT
  ca.id,
  ca.contracheque_id,
  ca.colaborador_id,
  ca.aceito_em,
  ca.ip_address,
  ca.user_agent,
  ca.nome_colaborador,
  ca.chapa,
  ca.competencia,
  c.bruto,
  c.liquido,
  c.descontos,
  c.tipo          AS holerite_tipo,
  c.publicado_em
FROM public.contracheque_aceites ca
JOIN public.contracheques c ON c.id = ca.contracheque_id;

COMMENT ON TABLE public.contracheque_aceites IS
  'Registro de aceite digital do colaborador ao visualizar o holerite. '
  'Contém data, IP e dados do dispositivo para fins jurídicos.';
