-- ============================================================
-- CONSTRUTORRH V2 – TABELAS COMPLEMENTARES
-- Executar no banco V2 APÓS migration_v2_schema.sql
-- ============================================================

-- OBRAS
CREATE TABLE IF NOT EXISTS obras_v2 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  id_legado       uuid, -- id original do V1 para mapeamento
  nome            text NOT NULL,
  codigo          text,
  endereco        text,
  cidade          text,
  estado          text,
  cliente         text,
  responsavel     text,
  data_inicio     date,
  data_previsao_fim date,
  status          text DEFAULT 'em_andamento',
  considera_sabado_util boolean DEFAULT false,
  desconta_vt     boolean DEFAULT true,
  observacoes     text,
  ativo           boolean DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_obras_v2_empresa ON obras_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_obras_v2_legado  ON obras_v2(id_legado);

-- FUNÇÕES
CREATE TABLE IF NOT EXISTS funcoes_v2 (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  empresa_id            uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  id_legado             uuid,
  nome                  text NOT NULL,
  sigla                 text,
  descricao             text,
  cbo                   text,
  valor_hora_clt        numeric(10,2),
  valor_hora_autonomo   numeric(10,2),
  ativo                 boolean DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_funcoes_v2_empresa ON funcoes_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_funcoes_v2_legado  ON funcoes_v2(id_legado);

-- PRÊMIOS
CREATE TABLE IF NOT EXISTS premios_v2 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vinculo_id      uuid REFERENCES vinculos_empregaticos(id),
  colaborador_id  uuid NOT NULL,
  obra_id         uuid REFERENCES obras_v2(id),
  id_legado       uuid,
  tipo            text,
  descricao       text,
  valor           numeric(12,2),
  data            date,
  competencia     text,
  status          text DEFAULT 'pendente',
  observacoes     text
);
CREATE INDEX IF NOT EXISTS idx_premios_v2_empresa ON premios_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_premios_v2_vinculo ON premios_v2(vinculo_id);
CREATE INDEX IF NOT EXISTS idx_premios_v2_legado  ON premios_v2(id_legado);

-- ADIANTAMENTOS
CREATE TABLE IF NOT EXISTS adiantamentos_v2 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vinculo_id      uuid REFERENCES vinculos_empregaticos(id),
  colaborador_id  uuid NOT NULL,
  obra_id         uuid REFERENCES obras_v2(id),
  id_legado       uuid,
  competencia     text,
  tipo            text,
  valor           numeric(12,2),
  observacoes     text,
  status          text DEFAULT 'pendente',
  data_pagamento  date
);
CREATE INDEX IF NOT EXISTS idx_adiant_v2_empresa ON adiantamentos_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_adiant_v2_legado  ON adiantamentos_v2(id_legado);

-- VALE TRANSPORTE
CREATE TABLE IF NOT EXISTS vale_transporte_v2 (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  empresa_id          uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vinculo_id          uuid REFERENCES vinculos_empregaticos(id),
  colaborador_id      uuid NOT NULL,
  id_legado           uuid,
  competencia         text,
  tipo                text,
  valor               numeric(12,2),
  dias_trabalhados    integer DEFAULT 0,
  desconto_colaborador numeric(12,2),
  valor_empresa       numeric(12,2),
  descontar_6pct      boolean DEFAULT true,
  status              text DEFAULT 'pendente',
  data_pagamento      date,
  observacoes         text
);
CREATE INDEX IF NOT EXISTS idx_vt_v2_empresa ON vale_transporte_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vt_v2_legado  ON vale_transporte_v2(id_legado);

-- REGISTROS DE PONTO (diários)
CREATE TABLE IF NOT EXISTS ponto_registros_v2 (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  empresa_id        uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vinculo_id        uuid REFERENCES vinculos_empregaticos(id),
  colaborador_id    uuid NOT NULL,
  obra_id           uuid REFERENCES obras_v2(id),
  id_legado         uuid,
  data              date NOT NULL,
  hora_entrada      text,
  saida_almoco      text,
  retorno_almoco    text,
  hora_saida        text,
  horas_trabalhadas numeric(5,2),
  horas_extras      numeric(5,2) DEFAULT 0,
  falta             boolean DEFAULT false,
  justificativa     text
);
CREATE INDEX IF NOT EXISTS idx_ponto_v2_empresa ON ponto_registros_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ponto_v2_vinculo ON ponto_registros_v2(vinculo_id);
CREATE INDEX IF NOT EXISTS idx_ponto_v2_data    ON ponto_registros_v2(data);
CREATE INDEX IF NOT EXISTS idx_ponto_v2_legado  ON ponto_registros_v2(id_legado);

-- LANÇAMENTOS DE PONTO (fechamentos mensais)
CREATE TABLE IF NOT EXISTS ponto_lancamentos_v2 (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  empresa_id        uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vinculo_id        uuid REFERENCES vinculos_empregaticos(id),
  colaborador_id    uuid NOT NULL,
  obra_id           uuid REFERENCES obras_v2(id),
  id_legado         uuid,
  mes_referencia    text NOT NULL,
  status            text DEFAULT 'pendente_fechamento',
  horas_normais     numeric(8,2) DEFAULT 0,
  horas_extras      numeric(8,2) DEFAULT 0,
  valor_horas       numeric(12,2) DEFAULT 0,
  faltas            numeric(5,1) DEFAULT 0,
  dias_trabalhados  integer DEFAULT 0,
  snap_valor_total  numeric(12,2),
  snap_liquido      numeric(12,2),
  snap_valor_horas  numeric(12,2),
  snap_inss         numeric(12,2),
  snap_ir           numeric(12,2),
  snap_valor_dsr    numeric(12,2),
  snap_valor_premio numeric(12,2),
  snap_desconto_vt  numeric(12,2),
  snap_faltas       numeric(5,1),
  versao            integer DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_lanc_v2_empresa ON ponto_lancamentos_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lanc_v2_vinculo ON ponto_lancamentos_v2(vinculo_id);
CREATE INDEX IF NOT EXISTS idx_lanc_v2_legado  ON ponto_lancamentos_v2(id_legado);

-- EPIs DO COLABORADOR
CREATE TABLE IF NOT EXISTS colaborador_epis_v2 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vinculo_id      uuid REFERENCES vinculos_empregaticos(id),
  colaborador_id  uuid NOT NULL,
  id_legado       uuid,
  epi_nome        text,
  epi_categoria   text,
  numero_ca       text,
  tamanho         text,
  numero          text,
  quantidade      integer DEFAULT 1,
  data_entrega    date,
  status          text DEFAULT 'ativo',
  documento_url   text,
  observacoes     text
);
CREATE INDEX IF NOT EXISTS idx_epis_v2_empresa ON colaborador_epis_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_epis_v2_vinculo ON colaborador_epis_v2(vinculo_id);
CREATE INDEX IF NOT EXISTS idx_epis_v2_legado  ON colaborador_epis_v2(id_legado);

-- DOCUMENTOS DO COLABORADOR
CREATE TABLE IF NOT EXISTS documentos_colaborador_v2 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vinculo_id      uuid REFERENCES vinculos_empregaticos(id),
  colaborador_id  uuid NOT NULL,
  id_legado       uuid,
  tipo            text,
  descricao       text,
  data            date,
  documento_url   text,
  documento_nome  text
);
CREATE INDEX IF NOT EXISTS idx_docs_v2_empresa ON documentos_colaborador_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_docs_v2_legado  ON documentos_colaborador_v2(id_legado);

-- OCORRÊNCIAS / ADVERTÊNCIAS
CREATE TABLE IF NOT EXISTS ocorrencias_v2 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vinculo_id      uuid REFERENCES vinculos_empregaticos(id),
  colaborador_id  uuid NOT NULL,
  id_legado       uuid,
  tipo            text, -- advertencia | atestado | acidente | ocorrencia
  subtipo         text,
  data_ocorrencia date,
  descricao       text,
  documento_url   text,
  documento_nome  text,
  status          text DEFAULT 'ativo'
);
CREATE INDEX IF NOT EXISTS idx_ocorr_v2_empresa ON ocorrencias_v2(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ocorr_v2_legado  ON ocorrencias_v2(id_legado);

SELECT 'Tabelas complementares V2 criadas com sucesso!' as resultado;
