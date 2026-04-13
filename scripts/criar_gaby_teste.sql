-- ============================================================
-- SCRIPT: Criar colaborador teste GABY TESTE CLT
-- 
-- Cole este SQL no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/rbhmfqngnjxdemavtvxk/sql/new
-- ============================================================

DO $$
DECLARE
  v_obra_id   uuid;
  v_funcao_id uuid;
  v_colab_id  uuid;
BEGIN
  -- Pega primeira obra ativa
  SELECT id INTO v_obra_id FROM obras LIMIT 1;
  
  -- Pega funcao Pedreiro (ou primeira disponível)
  SELECT id INTO v_funcao_id 
  FROM funcoes 
  WHERE LOWER(nome) LIKE '%pedreiro%' 
  LIMIT 1;
  
  IF v_funcao_id IS NULL THEN
    SELECT id INTO v_funcao_id FROM funcoes LIMIT 1;
  END IF;

  -- Remove se já existir (idempotente)
  DELETE FROM colaboradores WHERE chapa = 'TESTE-GABY-001';

  -- Insere colaboradora teste
  INSERT INTO colaboradores (
    nome, chapa, tipo_contrato, status,
    obra_id, funcao_id, salario,
    vale_transporte, data_admissao, vt_dados
  ) VALUES (
    'GABY TESTE CLT',
    'TESTE-GABY-001',
    'clt',
    'ativo',
    v_obra_id,
    v_funcao_id,
    2000.00,
    true,
    '2026-01-01',
    '{"modalidade":"transporte","trechos_ida":[{"descricao":"Linha 1","valor":6.00}],"trechos_volta":[{"descricao":"Linha 1","valor":6.00}]}'::jsonb
  ) RETURNING id INTO v_colab_id;

  RAISE NOTICE '✅ Gaby criada! ID: % | Obra: % | Função: %', v_colab_id, v_obra_id, v_funcao_id;
END $$;

-- Confirmar
SELECT 
  c.id, c.nome, c.chapa, c.tipo_contrato, c.status, c.salario,
  o.nome AS obra,
  f.nome AS funcao
FROM colaboradores c
LEFT JOIN obras    o ON o.id = c.obra_id
LEFT JOIN funcoes  f ON f.id = c.funcao_id
WHERE c.chapa = 'TESTE-GABY-001';

-- ============================================================
-- Para remover depois dos testes:
-- DELETE FROM colaboradores WHERE chapa = 'TESTE-GABY-001';
-- ============================================================
