-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: Remove CHECK constraint restritivo de genero em colaboradores
-- Execute no SQL Editor do Supabase ANTES de importar o CSV de colaboradores
-- ═══════════════════════════════════════════════════════════════════════════════

-- Remove o CHECK constraint de genero (aceita qualquer valor: M, F, masculino, etc.)
ALTER TABLE public.colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_genero_check;

SELECT '✅ Constraint de genero removida — pode importar o CSV agora!' AS resultado;
