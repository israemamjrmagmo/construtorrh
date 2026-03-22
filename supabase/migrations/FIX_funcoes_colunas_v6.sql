-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: Adicionar colunas faltando em banco já criado com SCHEMA_DEFINITIVO_v6
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════════════════

-- Adiciona as colunas de valor/hora na tabela funcoes (caso não existam)
ALTER TABLE public.funcoes
  ADD COLUMN IF NOT EXISTS valor_hora_clt      NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS valor_hora_autonomo NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS contratos_valores   JSONB DEFAULT '{}';

SELECT '✅ Colunas adicionadas em funcoes!' AS resultado;
