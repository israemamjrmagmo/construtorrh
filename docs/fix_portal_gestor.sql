-- =====================================================================
-- SQL: Tabelas para Portal do Gestor - ConstrutorRH
-- Execute no Supabase SQL Editor
-- =====================================================================

-- Tabela: obra_clima (Estação Meteorológica)
CREATE TABLE IF NOT EXISTS obra_clima (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  data              DATE NOT NULL,
  choveu            BOOLEAN NOT NULL DEFAULT FALSE,
  precipitacao_mm   NUMERIC(6,1),
  temperatura_max   NUMERIC(4,1),
  temperatura_min   NUMERIC(4,1),
  vento_kmh         NUMERIC(5,1),
  umidade_pct       NUMERIC(4,1),
  condicao          TEXT NOT NULL DEFAULT 'ensolarado',
  impacto_obra      TEXT NOT NULL DEFAULT 'nenhum',
  observacoes       TEXT,
  lancado_por       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(obra_id, data)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_obra_clima_obra_data ON obra_clima(obra_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_obra_clima_data ON obra_clima(data DESC);

-- RLS policies para obra_clima
ALTER TABLE obra_clima ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obra_clima_select" ON obra_clima
  FOR SELECT USING (true);

CREATE POLICY "obra_clima_insert" ON obra_clima
  FOR INSERT WITH CHECK (true);

CREATE POLICY "obra_clima_update" ON obra_clima
  FOR UPDATE USING (true);

CREATE POLICY "obra_clima_delete" ON obra_clima
  FOR DELETE USING (true);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER obra_clima_updated_at
  BEFORE UPDATE ON obra_clima
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- Tabela: portal_producao (se não existir)
-- (Pode já existir como outro nome — verifique seu schema)
-- =====================================================================
CREATE TABLE IF NOT EXISTS portal_producao (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id               UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  colaborador_id        UUID REFERENCES colaboradores(id),
  data                  DATE NOT NULL,
  servico_descricao     TEXT,
  playbook_item_id      UUID,
  quantidade            NUMERIC(10,2) NOT NULL DEFAULT 0,
  unidade               TEXT NOT NULL DEFAULT 'un',
  observacoes           TEXT,
  lancado_por           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_producao_obra_data ON portal_producao(obra_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_portal_producao_colab ON portal_producao(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_portal_producao_data ON portal_producao(data DESC);

ALTER TABLE portal_producao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_producao_select" ON portal_producao FOR SELECT USING (true);
CREATE POLICY "portal_producao_insert" ON portal_producao FOR INSERT WITH CHECK (true);
CREATE POLICY "portal_producao_update" ON portal_producao FOR UPDATE USING (true);
CREATE POLICY "portal_producao_delete" ON portal_producao FOR DELETE USING (true);

-- =====================================================================
-- Coluna lancado_por em portal_ponto_diario (se não existir)
-- =====================================================================
ALTER TABLE portal_ponto_diario
  ADD COLUMN IF NOT EXISTS lancado_por TEXT;

-- =====================================================================
-- View útil: vw_presenca_resumo (presença diária consolidada)
-- =====================================================================
CREATE OR REPLACE VIEW vw_presenca_resumo AS
SELECT
  p.data,
  p.obra_id,
  o.nome AS obra_nome,
  COUNT(*) AS total_lancamentos,
  COUNT(*) FILTER (WHERE p.status IN ('presente','meio_periodo','producao')) AS presentes,
  COUNT(*) FILTER (WHERE p.status = 'falta') AS faltas,
  COUNT(*) FILTER (WHERE p.status = 'falta_justificada') AS faltas_justificadas,
  ROUND(
    COUNT(*) FILTER (WHERE p.status IN ('presente','meio_periodo','producao'))::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS taxa_presenca_pct
FROM portal_ponto_diario p
LEFT JOIN obras o ON o.id = p.obra_id
GROUP BY p.data, p.obra_id, o.nome;

-- =====================================================================
-- COMENTÁRIOS FINAIS:
-- 1. Se a tabela portal_producao já existir com outro nome, ajuste
--    as queries no GestorProducao.tsx
-- 2. A tabela obra_clima usa UNIQUE(obra_id, data) para permitir upsert
--    pelo Portal do Encarregado (PortalClima.tsx)
-- =====================================================================
