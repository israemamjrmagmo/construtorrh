-- =============================================================================
-- sql_revisao_v21.sql
-- Correção de erro de coluna inexistente na query de Fechamento de Ponto
-- =============================================================================

-- 1. Adiciona a coluna faltante na tabela ponto_lancamentos
ALTER TABLE public.ponto_lancamentos 
ADD COLUMN IF NOT EXISTS snap_considera_sabado_util BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.ponto_lancamentos.snap_considera_sabado_util IS 
'Snapshot imutável do flag considera_sabado_util da obra no momento do fechamento.';

-- 2. Aproveita para adicionar índices de performance sugeridos anteriormente (v20) caso tenham falhado
CREATE INDEX IF NOT EXISTS idx_ponto_lanc_mes_status ON public.ponto_lancamentos (mes_referencia, status);
CREATE INDEX IF NOT EXISTS idx_ponto_lanc_colab_mes ON public.ponto_lancamentos (colaborador_id, mes_referencia);

-- 3. Verificação
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'ponto_lancamentos' AND column_name = 'snap_considera_sabado_util';