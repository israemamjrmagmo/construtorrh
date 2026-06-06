-- ============================================================
-- CONSTRUTORRH – FASE 1 – ANTI-DUPLICIDADE FINANCEIRA
-- Adicionar constraints de unicidade no banco ATUAL
-- ATENÇÃO: Executar APÓS garantir que não há duplicatas existentes
-- ============================================================

-- ── Verificar duplicatas antes de aplicar ────────────────────

-- Prêmios: verificar duplicatas
SELECT colaborador_id, competencia, tipo, COUNT(*) as qtd
FROM premios
WHERE status != 'cancelado' AND competencia IS NOT NULL AND tipo IS NOT NULL
GROUP BY colaborador_id, competencia, tipo
HAVING COUNT(*) > 1;

-- VT: verificar duplicatas
SELECT colaborador_id, competencia, COUNT(*) as qtd
FROM vale_transporte
WHERE status != 'cancelado'
GROUP BY colaborador_id, competencia
HAVING COUNT(*) > 1;

-- ── Índices únicos parciais (substituem constraints hard) ────

-- Prêmios: único por colaborador + competência + tipo (exceto cancelados)
CREATE UNIQUE INDEX IF NOT EXISTS uq_premios_colab_comp_tipo
  ON premios (colaborador_id, competencia, tipo)
  WHERE status != 'cancelado' AND competencia IS NOT NULL AND tipo IS NOT NULL;

-- Vale Transporte: único por colaborador + competência (exceto cancelados)  
CREATE UNIQUE INDEX IF NOT EXISTS uq_vt_colab_comp
  ON vale_transporte (colaborador_id, competencia)
  WHERE status != 'cancelado';

-- Adiantamentos: único por colaborador + competência + tipo (exceto cancelados)
CREATE UNIQUE INDEX IF NOT EXISTS uq_adiant_colab_comp_tipo
  ON adiantamentos (colaborador_id, competencia, tipo)
  WHERE status != 'cancelado' AND tipo IS NOT NULL;

-- Fechamentos (ponto_lancamentos): garantir uma linha por colaborador+obra+mês+versão
-- (já deve ter constraint similar, apenas validação)
SELECT colaborador_id, obra_id, mes_referencia, COUNT(*) as qtd
FROM ponto_lancamentos
WHERE status NOT IN ('cancelado', 'recusado')
GROUP BY colaborador_id, obra_id, mes_referencia
HAVING COUNT(*) > 1;

-- ── Regra CPF: apenas 1 ativo por empresa ────────────────────
-- Índice para garantir CPF único ativo (aplicar se não existir)
CREATE UNIQUE INDEX IF NOT EXISTS uq_colaborador_cpf_ativo
  ON colaboradores (cpf)
  WHERE status = 'ativo' AND cpf IS NOT NULL;

-- Comentário: para recontratações, desativar o vínculo anterior antes
-- de criar o novo ou usar vinculo_anterior_id para encadeamento

COMMENT ON INDEX uq_colaborador_cpf_ativo IS 'Garante apenas 1 colaborador ativo por CPF. Para recontratações: desativar vínculo anterior primeiro.';
COMMENT ON INDEX uq_premios_colab_comp_tipo IS 'Anti-duplicidade de prêmios por colaborador/competência/tipo';
COMMENT ON INDEX uq_vt_colab_comp IS 'Anti-duplicidade de vale transporte por colaborador/competência';
COMMENT ON INDEX uq_adiant_colab_comp_tipo IS 'Anti-duplicidade de adiantamentos por colaborador/competência/tipo';
