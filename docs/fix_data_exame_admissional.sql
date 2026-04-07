-- Adiciona campo data_exame_admissional na tabela colaboradores
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS data_exame_admissional date;

COMMENT ON COLUMN colaboradores.data_exame_admissional IS 'Data de realização do exame admissional (ASO)';
