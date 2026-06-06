-- ============================================================
-- VIEWS DE COMPATIBILIDADE V1 → V2
-- Executar no banco V2 após migration_v2_completo.sql
-- Permite que o frontend use os nomes originais das tabelas
-- ============================================================

-- VIEW: obras (aponta para obras_v2)
CREATE OR REPLACE VIEW obras AS
SELECT
  id, created_at, empresa_id, id_legado,
  nome, codigo, endereco, cidade, estado,
  cliente, responsavel, data_inicio, data_previsao_fim,
  status, considera_sabado_util, desconta_vt, observacoes, ativo
FROM obras_v2;

-- VIEW: funcoes (aponta para funcoes_v2)
CREATE OR REPLACE VIEW funcoes AS
SELECT
  id, created_at, empresa_id, id_legado,
  nome, sigla, descricao, cbo,
  valor_hora_clt, valor_hora_autonomo, ativo,
  NULL::jsonb AS contratos_valores
FROM funcoes_v2;

-- VIEW: colaboradores (join vinculos_empregaticos + pessoas — replica estrutura V1)
CREATE OR REPLACE VIEW colaboradores AS
SELECT
  v.id,
  v.created_at,
  p.nome,
  v.chapa,
  p.cpf,
  p.rg,
  p.pis_nit,
  p.data_nascimento,
  p.genero,
  p.estado_civil,
  p.telefone,
  p.email,
  p.endereco,
  p.cidade,
  p.estado,
  p.cep,
  v.funcao_id,
  v.obra_id,
  v.salario,
  v.tipo_contrato,
  v.data_admissao,
  v.data_demissao,
  v.ctps_numero,
  v.ctps_serie,
  p.banco,
  p.agencia,
  p.conta,
  p.tipo_conta,
  p.pix_chave,
  p.pix_tipo,
  COALESCE((p.vt_dados->>'vale_transporte')::boolean, false) AS vale_transporte,
  p.vt_dados,
  v.status,
  v.observacoes,
  p.foto_url,
  p.nome_pai,
  p.nome_mae,
  p.cor_raca,
  p.deficiencia,
  p.tipo_deficiencia,
  p.doc_militar,
  v.empresa_id,
  v.pessoa_id
FROM vinculos_empregaticos v
JOIN pessoas p ON p.id = v.pessoa_id;

-- VIEW: registro_ponto (aponta para ponto_registros_v2)
CREATE OR REPLACE VIEW registro_ponto AS
SELECT
  id, created_at, empresa_id, vinculo_id,
  colaborador_id, obra_id, id_legado,
  data, hora_entrada, saida_almoco, retorno_almoco,
  hora_saida, horas_trabalhadas, horas_extras,
  NULL::text AS he_entrada, NULL::text AS he_saida,
  falta, justificativa
FROM ponto_registros_v2;

-- VIEW: ponto_lancamentos (aponta para ponto_lancamentos_v2 com aliases snap_)
CREATE OR REPLACE VIEW ponto_lancamentos AS
SELECT
  id, created_at, empresa_id, vinculo_id,
  colaborador_id, obra_id, id_legado,
  mes_referencia AS mes_referencia,
  NULL::date AS data_inicio,
  NULL::date AS data_fim,
  status,
  NULL::text AS tipo_pagamento,
  NULL::numeric AS valor_hora_snapshot,
  NULL::numeric AS snap_valor_hora,
  horas_normais AS snap_horas_normais,
  horas_extras AS snap_horas_extras,
  valor_horas AS snap_valor_horas,
  NULL::numeric AS snap_valor_producao,
  snap_valor_dsr,
  snap_valor_premio,
  snap_valor_total,
  snap_faltas,
  NULL::numeric AS snap_vt_diario,
  snap_desconto_vt,
  NULL::numeric AS snap_desconto_adiant,
  snap_inss,
  snap_ir,
  snap_liquido,
  NULL::timestamptz AS snap_fechado_em
FROM ponto_lancamentos_v2;

-- VIEW: premios (aponta para premios_v2)
CREATE OR REPLACE VIEW premios AS
SELECT
  id, created_at, empresa_id, vinculo_id,
  colaborador_id, obra_id, id_legado,
  tipo, descricao, valor, data, competencia,
  status, observacoes,
  NULL::uuid AS pagamento_id
FROM premios_v2;

-- VIEW: adiantamentos (aponta para adiantamentos_v2)
CREATE OR REPLACE VIEW adiantamentos AS
SELECT
  id, created_at, empresa_id, vinculo_id,
  colaborador_id, obra_id, id_legado,
  competencia, tipo, valor,
  NULL::text AS descricao,
  observacoes, status,
  NULL::date AS data_pagamento,
  NULL::text AS descontado_em,
  NULL::uuid AS pagamento_id,
  NULL::text AS desconto_tipo,
  1 AS desconto_parcelas,
  0 AS desconto_parcela_atual,
  NULL::text AS desconto_a_partir,
  NULL::text AS desconto_obs,
  NULL::text AS requisicao_url
FROM adiantamentos_v2;

-- VIEW: vale_transporte (aponta para vale_transporte_v2)
CREATE OR REPLACE VIEW vale_transporte AS
SELECT
  id, created_at, empresa_id, vinculo_id,
  colaborador_id, id_legado,
  competencia, tipo, valor,
  dias_trabalhados,
  desconto_colaborador, valor_empresa, descontar_6pct,
  status,
  NULL::date AS data_pagamento,
  observacoes,
  NULL::date AS data_inicio,
  NULL::date AS data_fim
FROM vale_transporte_v2;

-- VIEW: colaborador_epi (aponta para colaborador_epis_v2)
CREATE OR REPLACE VIEW colaborador_epi AS
SELECT
  id, created_at, empresa_id, vinculo_id,
  colaborador_id, id_legado,
  NULL::uuid AS epi_id,
  NULL::uuid AS funcao_id,
  tamanho, numero, quantidade,
  data_entrega,
  NULL::date AS data_validade,
  status,
  FALSE AS obrigatorio,
  quantidade AS quantidade_entregue,
  documento_url, observacoes,
  NULL::text AS documento_nome
FROM colaborador_epis_v2;

-- VIEW: documentos_avulsos (aponta para documentos_colaborador_v2)
CREATE OR REPLACE VIEW documentos_avulsos AS
SELECT
  id, created_at, empresa_id, vinculo_id,
  colaborador_id, id_legado,
  tipo::text AS tipo,
  descricao,
  data,
  documento_url,
  documento_nome
FROM documentos_colaborador_v2;

SELECT 'Views de compatibilidade criadas com sucesso!' AS resultado;
