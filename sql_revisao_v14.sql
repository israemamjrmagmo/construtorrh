-- ============================================================
-- sql_revisao_v14.sql
-- Índices para reduzir latência nas queries do Fechamento de Ponto
-- Execute no Supabase SQL Editor
-- ============================================================

-- ── ponto_lancamentos ──────────────────────────────────────
-- Principal filtro da tela: mes_referencia + status
CREATE INDEX IF NOT EXISTS idx_ponto_lanc_mes_status
  ON public.ponto_lancamentos (mes_referencia, status);

-- Busca por colaborador (modal espelho, adiantamentos)
CREATE INDEX IF NOT EXISTS idx_ponto_lanc_colab
  ON public.ponto_lancamentos (colaborador_id);

-- ── registro_ponto ─────────────────────────────────────────
-- JOIN com ponto_lancamentos via lancamento_id (mais crítico)
CREATE INDEX IF NOT EXISTS idx_reg_ponto_lancamento
  ON public.registro_ponto (lancamento_id);

-- Filtro por data dentro do lançamento
CREATE INDEX IF NOT EXISTS idx_reg_ponto_lancamento_data
  ON public.registro_ponto (lancamento_id, data);

-- ── ponto_producao ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ponto_producao_lancamento
  ON public.ponto_producao (lancamento_id);

-- ── adiantamentos ──────────────────────────────────────────
-- Filtro competencia + status + descontado_em
CREATE INDEX IF NOT EXISTS idx_adiant_colab_comp_status
  ON public.adiantamentos (colaborador_id, competencia, status);

-- ── vale_transporte ────────────────────────────────────────
-- Filtro por competencia + descontar_6pct
CREATE INDEX IF NOT EXISTS idx_vt_colab_comp
  ON public.vale_transporte (colaborador_id, competencia);

-- ── feriados ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_feriados_data
  ON public.feriados (data);

-- ── premios ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_premios_colab_comp
  ON public.premios (colaborador_id, competencia);

-- ── funcao_valores ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_funcao_valores_funcao
  ON public.funcao_valores (funcao_id, tipo_contrato);

-- ── colaboradores ──────────────────────────────────────────
-- Filtro por status ativo
CREATE INDEX IF NOT EXISTS idx_colab_status
  ON public.colaboradores (status);

-- ── ponto_lancamentos: obra_id (usado em filtros) ──────────
CREATE INDEX IF NOT EXISTS idx_ponto_lanc_obra
  ON public.ponto_lancamentos (obra_id, mes_referencia);
