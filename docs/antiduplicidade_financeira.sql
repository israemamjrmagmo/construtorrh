-- ============================================================
-- CONSTRUTORRH – FASE 1 – ANTI-DUPLICIDADE FINANCEIRA
-- Banco ATUAL
-- NOTA: Vale Transporte NÃO tem restrição de unicidade pois
--       permite múltiplos lançamentos por competência
--       (ex: pagamentos parciais 50% + 50%, quinzenal, etc.)
-- ============================================================

-- ── Verificar duplicatas antes de aplicar ────────────────────

-- Prêmios: verificar duplicatas
SELECT colaborador_id, competencia, tipo, COUNT(*) as qtd
FROM premios
WHERE status != 'cancelado' AND competencia IS NOT NULL AND tipo IS NOT NULL
GROUP BY colaborador_id, competencia, tipo
HAVING COUNT(*) > 1;

-- Adiantamentos: verificar duplicatas
SELECT colaborador_id, competencia, tipo, COUNT(*) as qtd
FROM adiantamentos
WHERE status != 'cancelado' AND tipo IS NOT NULL
GROUP BY colaborador_id, competencia, tipo
HAVING COUNT(*) > 1;

-- CPF ativo duplicado?
SELECT cpf, COUNT(*) as qtd
FROM colaboradores
WHERE status = 'ativo' AND cpf IS NOT NULL
GROUP BY cpf
HAVING COUNT(*) > 1;

-- ── Índices únicos parciais ───────────────────────────────────

-- Prêmios: único por colaborador + competência + tipo (exceto cancelados)
CREATE UNIQUE INDEX IF NOT EXISTS uq_premios_colab_comp_tipo
  ON premios (colaborador_id, competencia, tipo)
  WHERE status != 'cancelado' AND competencia IS NOT NULL AND tipo IS NOT NULL;

-- Adiantamentos: único por colaborador + competência + tipo (exceto cancelados)
CREATE UNIQUE INDEX IF NOT EXISTS uq_adiant_colab_comp_tipo
  ON adiantamentos (colaborador_id, competencia, tipo)
  WHERE status != 'cancelado' AND tipo IS NOT NULL;

-- CPF: apenas 1 colaborador ativo por CPF
CREATE UNIQUE INDEX IF NOT EXISTS uq_colaborador_cpf_ativo
  ON colaboradores (cpf)
  WHERE status = 'ativo' AND cpf IS NOT NULL;

-- OBS: Vale Transporte sem índice único — permite múltiplos lançamentos
-- por competência (pagamentos parciais, quinzenal, etc.)

COMMENT ON INDEX uq_colaborador_cpf_ativo    IS 'Garante apenas 1 colaborador ativo por CPF. Recontratações: desativar vínculo anterior primeiro.';
COMMENT ON INDEX uq_premios_colab_comp_tipo  IS 'Anti-duplicidade de prêmios por colaborador/competência/tipo';
COMMENT ON INDEX uq_adiant_colab_comp_tipo   IS 'Anti-duplicidade de adiantamentos por colaborador/competência/tipo';
