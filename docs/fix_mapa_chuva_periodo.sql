-- ════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: Mapa Pluviométrico — adicionar coluna periodo em obra_clima
-- Permite até 3 lançamentos por dia (manha / tarde / noite)
-- ════════════════════════════════════════════════════════════════════

-- 1. Adicionar coluna periodo (default 'manha' para registros existentes)
ALTER TABLE obra_clima
  ADD COLUMN IF NOT EXISTS periodo TEXT NOT NULL DEFAULT 'manha'
  CHECK (periodo IN ('manha', 'tarde', 'noite'));

-- 2. Remover a constraint UNIQUE antiga (obra_id, data)
ALTER TABLE obra_clima
  DROP CONSTRAINT IF EXISTS obra_clima_obra_id_data_key;

-- 3. Criar nova UNIQUE incluindo periodo
ALTER TABLE obra_clima
  ADD CONSTRAINT obra_clima_obra_data_periodo_key
  UNIQUE (obra_id, data, periodo);

-- 4. Recriar index otimizado
DROP INDEX IF EXISTS idx_obra_clima_obra_data;
CREATE INDEX idx_obra_clima_obra_data ON obra_clima (obra_id, data DESC, periodo);

-- 5. Verificação
SELECT 'OK — coluna periodo adicionada, UNIQUE(obra_id,data,periodo) criada' AS status;
