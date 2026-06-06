-- ============================================================
-- CONSTRUTORRH – MIGRATION V2 – BANCO DE DADOS REESTRUTURADO
-- FASES 7, 8, 9, 10 – SaaS Multiempresa
-- Executar no ambiente DATABASE_V2 (não no banco principal)
-- ============================================================

-- ──────────────────────────────────────────────────
-- FASE 10 – MULTIEMPRESA
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  nome            text NOT NULL,
  cnpj            text UNIQUE,
  email           text,
  telefone        text,
  endereco        text,
  cidade          text,
  estado          text,
  logo_url        text,
  plano           text NOT NULL DEFAULT 'basico', -- basico | profissional | enterprise
  ativo           boolean NOT NULL DEFAULT true,
  configuracoes   jsonb,
  master_user_id  uuid -- FK para auth.users
);

CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj);

-- ──────────────────────────────────────────────────
-- FASE 7 – ENTIDADE PESSOA (separar Pessoa de Vínculo)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pessoas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  cpf             text UNIQUE NOT NULL,
  nome            text NOT NULL,
  data_nascimento date,
  telefone        text,
  email           text,
  endereco        text,
  cidade          text,
  estado          text,
  cep             text,
  rg              text,
  pis_nit         text,
  genero          text,
  estado_civil    text,
  foto_url        text,
  -- Campos complementares
  nome_pai        text,
  nome_mae        text,
  cor_raca        text,
  deficiencia     boolean DEFAULT false,
  tipo_deficiencia text,
  doc_militar     text,
  banco           text,
  agencia         text,
  conta           text,
  tipo_conta      text,
  pix_chave       text,
  pix_tipo        text,
  vt_dados        jsonb,
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pessoas_cpf ON pessoas(cpf);
CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON pessoas(nome);

-- ──────────────────────────────────────────────────
-- VÍNCULOS EMPREGATÍCIOS
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vinculos_empregaticos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  pessoa_id       uuid NOT NULL REFERENCES pessoas(id) ON DELETE RESTRICT,
  empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  obra_id         uuid, -- FK para obras_v2
  funcao_id       uuid, -- FK para funcoes_v2
  chapa           text,
  tipo_contrato   text NOT NULL DEFAULT 'clt',
  salario         numeric(12,2),
  data_admissao   date NOT NULL,
  data_demissao   date,
  data_aviso_previo date,
  tipo_desligamento text,
  motivo_encerramento text,
  status          text NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo','inativo','afastado','ferias','encerrado')),
  observacoes     text,
  ctps_numero     text,
  ctps_serie      text,
  horario_trabalho jsonb,
  matricula_esocial text,
  vinculo_anterior_id uuid REFERENCES vinculos_empregaticos(id),
  updated_at      timestamptz DEFAULT now(),
  
  -- CONSTRAINT: apenas um vínculo ATIVO por CPF dentro da mesma empresa
  CONSTRAINT uq_vinculo_ativo_empresa 
    EXCLUDE USING btree (pessoa_id WITH =, empresa_id WITH =)
    WHERE (status = 'ativo')
);

CREATE INDEX IF NOT EXISTS idx_vinculos_pessoa ON vinculos_empregaticos(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_empresa ON vinculos_empregaticos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_obra ON vinculos_empregaticos(obra_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_status ON vinculos_empregaticos(status);

-- ──────────────────────────────────────────────────
-- FASE 7 – RESUMO DE FECHAMENTO (fonte única da verdade)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resumo_fechamento (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  empresa_id        uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  obra_id           uuid NOT NULL,
  vinculo_id        uuid NOT NULL REFERENCES vinculos_empregaticos(id) ON DELETE RESTRICT,
  colaborador_id    uuid NOT NULL, -- id legado para compatibilidade
  competencia_mes   integer NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  competencia_ano   integer NOT NULL,
  competencia       text GENERATED ALWAYS AS (
    lpad(competencia_ano::text, 4, '0') || '-' || lpad(competencia_mes::text, 2, '0')
  ) STORED,
  
  -- Financeiro
  salario_base      numeric(12,2) NOT NULL DEFAULT 0,
  horas_extras      numeric(10,2) DEFAULT 0,
  valor_horas_extras numeric(12,2) DEFAULT 0,
  faltas            numeric(5,1) DEFAULT 0,
  desconto_faltas   numeric(12,2) DEFAULT 0,
  premios           numeric(12,2) DEFAULT 0,
  vale_transporte   numeric(12,2) DEFAULT 0,
  desconto_vt       numeric(12,2) DEFAULT 0,
  encargos          numeric(12,2) DEFAULT 0,
  provisoes         numeric(12,2) DEFAULT 0,
  adiantamentos     numeric(12,2) DEFAULT 0,
  inss              numeric(12,2) DEFAULT 0,
  ir                numeric(12,2) DEFAULT 0,
  dsr               numeric(12,2) DEFAULT 0,
  valor_producao    numeric(12,2) DEFAULT 0,
  outros_proventos  numeric(12,2) DEFAULT 0,
  outros_descontos  numeric(12,2) DEFAULT 0,
  valor_bruto       numeric(12,2) GENERATED ALWAYS AS (
    salario_base + horas_extras + premios + dsr + valor_producao + outros_proventos
  ) STORED,
  valor_liquido     numeric(12,2) NOT NULL DEFAULT 0,
  
  -- Controle
  status            text NOT NULL DEFAULT 'pendente_fechamento'
                    CHECK (status IN (
                      'rascunho','em_fechamento','pendente_fechamento',
                      'liberado_fechamento','aprovado','liberado_pagamento','pago','recusado'
                    )),
  versao            integer NOT NULL DEFAULT 1,
  aprovado_por      uuid,
  data_aprovacao    timestamptz,
  pago_por          uuid,
  data_pagamento    timestamptz,
  observacoes       text,
  
  -- Metadados
  calculado_em      timestamptz DEFAULT now(),
  snapshot_dados    jsonb, -- snapshot completo dos dados no momento do fechamento
  
  updated_at        timestamptz DEFAULT now(),
  
  -- Anti-duplicidade: único resumo por vínculo+competência por versão
  CONSTRAINT uq_resumo_vinculo_competencia_versao
    UNIQUE (vinculo_id, competencia_mes, competencia_ano, versao)
);

CREATE INDEX IF NOT EXISTS idx_resumo_empresa ON resumo_fechamento(empresa_id);
CREATE INDEX IF NOT EXISTS idx_resumo_obra ON resumo_fechamento(obra_id);
CREATE INDEX IF NOT EXISTS idx_resumo_vinculo ON resumo_fechamento(vinculo_id);
CREATE INDEX IF NOT EXISTS idx_resumo_competencia ON resumo_fechamento(competencia);
CREATE INDEX IF NOT EXISTS idx_resumo_status ON resumo_fechamento(status);

-- ──────────────────────────────────────────────────
-- FASE 8 – HISTÓRICO DE VERSÕES
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resumo_fechamento_historico (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  resumo_id         uuid NOT NULL REFERENCES resumo_fechamento(id) ON DELETE CASCADE,
  versao            integer NOT NULL,
  status_anterior   text,
  status_novo       text,
  alterado_por      uuid,
  motivo            text,
  snapshot_anterior jsonb, -- todos os valores antes da mudança
  snapshot_novo     jsonb  -- todos os valores após a mudança
);

CREATE INDEX IF NOT EXISTS idx_hist_resumo ON resumo_fechamento_historico(resumo_id);

-- Trigger para criar histórico automaticamente
CREATE OR REPLACE FUNCTION fn_registrar_historico_fechamento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status 
       OR OLD.valor_liquido IS DISTINCT FROM NEW.valor_liquido
       OR OLD.versao IS DISTINCT FROM NEW.versao THEN
      INSERT INTO resumo_fechamento_historico (
        resumo_id, versao, status_anterior, status_novo,
        snapshot_anterior, snapshot_novo
      ) VALUES (
        OLD.id, OLD.versao, OLD.status, NEW.status,
        row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb
      );
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_historico_fechamento ON resumo_fechamento;
CREATE TRIGGER tg_historico_fechamento
  BEFORE UPDATE ON resumo_fechamento
  FOR EACH ROW EXECUTE FUNCTION fn_registrar_historico_fechamento();

-- ──────────────────────────────────────────────────
-- AUDITORIA GERAL
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auditoria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  empresa_id  uuid REFERENCES empresas(id),
  usuario_id  uuid,
  tabela      text NOT NULL,
  registro_id uuid,
  acao        text NOT NULL CHECK (acao IN ('INSERT','UPDATE','DELETE')),
  dados_antes jsonb,
  dados_depois jsonb,
  ip          text
);

CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria(empresa_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela ON auditoria(tabela);
CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria(created_at DESC);

-- ──────────────────────────────────────────────────
-- FASE 10 – PERFIS E PERMISSÕES SaaS
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresa_usuarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL, -- FK auth.users
  role        text NOT NULL DEFAULT 'rh'
              CHECK (role IN ('master_empresa','gestor','rh','almoxarifado','financeiro','colaborador')),
  ativo       boolean NOT NULL DEFAULT true,
  nome        text,
  email       text,
  
  UNIQUE(empresa_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_usuarios_empresa ON empresa_usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_usuarios_user ON empresa_usuarios(user_id);

-- ──────────────────────────────────────────────────
-- ROW LEVEL SECURITY – isolamento por empresa
-- ──────────────────────────────────────────────────
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vinculos_empregaticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumo_fechamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresa_usuarios ENABLE ROW LEVEL SECURITY;

-- Função helper: retorna empresa_id do usuário atual
CREATE OR REPLACE FUNCTION get_user_empresa_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT empresa_id FROM empresa_usuarios WHERE user_id = auth.uid() AND ativo = true LIMIT 1;
$$;

-- Políticas de isolamento
CREATE POLICY "usuarios_veem_propria_empresa" ON empresa_usuarios
  FOR ALL USING (empresa_id = get_user_empresa_id() OR user_id = auth.uid());

CREATE POLICY "vinculos_isolamento_empresa" ON vinculos_empregaticos
  FOR ALL USING (empresa_id = get_user_empresa_id());

CREATE POLICY "resumo_isolamento_empresa" ON resumo_fechamento
  FOR ALL USING (empresa_id = get_user_empresa_id());

-- ──────────────────────────────────────────────────
-- FASE 9 – MIGRAÇÃO SEGURA (script de importação)
-- ──────────────────────────────────────────────────
-- INSTRUÇÃO: Este script cria o schema V2 sem tocar no banco atual.
-- Para migrar dados, execute as queries abaixo APÓS criar uma empresa no sistema:
-- 
-- PASSO 1: Inserir empresa
-- INSERT INTO empresas (nome, cnpj) VALUES ('Nome da Empresa', 'XX.XXX.XXX/XXXX-XX');
-- 
-- PASSO 2: Migrar pessoas (deduplicar por CPF)
-- INSERT INTO pessoas (cpf, nome, data_nascimento, telefone, email, ...)
-- SELECT DISTINCT ON (cpf) cpf, nome, data_nascimento, telefone, email, ...
-- FROM colaboradores_legado
-- WHERE cpf IS NOT NULL
-- ORDER BY cpf, created_at ASC;
-- 
-- PASSO 3: Migrar vínculos
-- INSERT INTO vinculos_empregaticos (pessoa_id, empresa_id, obra_id, funcao_id, data_admissao, data_demissao, status, salario, ...)
-- SELECT p.id, '<empresa_id_uuid>', c.obra_id, c.funcao_id, c.data_admissao, c.data_demissao,
--        CASE WHEN c.status = 'ativo' THEN 'ativo' ELSE 'encerrado' END,
--        c.salario, ...
-- FROM colaboradores_legado c
-- JOIN pessoas p ON p.cpf = c.cpf;
-- 
-- PASSO 4: Gerar resumos retroativos
-- (Executar função de cálculo para Jan/2026, Fev/2026, Mar/2026, etc.)

COMMENT ON TABLE resumo_fechamento IS 'FONTE ÚNICA DA VERDADE – todos os módulos financeiros devem consumir dados desta tabela';
COMMENT ON TABLE pessoas IS 'Entidade Pessoa separada de Vínculo – preserva histórico completo';
COMMENT ON TABLE vinculos_empregaticos IS 'Vínculo empregatício – um por contratação, múltiplos por pessoa permitido';
COMMENT ON TABLE empresas IS 'Multiempresa SaaS – cada empresa tem isolamento total via RLS';

SELECT 'ConstrutorRH V2 Schema criado com sucesso! Execute as migrações de dados conforme FASE 9.' as resultado;
