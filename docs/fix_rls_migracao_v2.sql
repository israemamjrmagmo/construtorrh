-- ============================================================
-- FIX: Policies RLS para permitir migração via frontend
-- Execute no banco V2: https://mxntcjgzeaxlbxiawsdh.supabase.co
-- ============================================================

-- 1. Permite SELECT em empresas (frontend precisa buscar pelo CNPJ)
CREATE POLICY IF NOT EXISTS "empresas_select_public"
  ON empresas FOR SELECT USING (true);

-- 2. Permite INSERT em empresas (caso precise criar durante migração)
CREATE POLICY IF NOT EXISTS "empresas_insert_public"
  ON empresas FOR INSERT WITH CHECK (true);

-- 3. Habilita RLS nas tabelas V2 complementares e permite tudo via anon
-- (tabelas criadas sem RLS — garantir que anon pode inserir)

ALTER TABLE obras_v2              ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcoes_v2            ENABLE ROW LEVEL SECURITY;
ALTER TABLE premios_v2            ENABLE ROW LEVEL SECURITY;
ALTER TABLE adiantamentos_v2      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vale_transporte_v2    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto_registros_v2    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto_lancamentos_v2  ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaborador_epis_v2   ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_colaborador_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocorrencias_v2        ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "obras_v2_all"              ON obras_v2              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "funcoes_v2_all"            ON funcoes_v2            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "premios_v2_all"            ON premios_v2            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "adiantamentos_v2_all"      ON adiantamentos_v2      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "vale_transporte_v2_all"    ON vale_transporte_v2    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "ponto_registros_v2_all"    ON ponto_registros_v2    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "ponto_lancamentos_v2_all"  ON ponto_lancamentos_v2  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "colaborador_epis_v2_all"   ON colaborador_epis_v2   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "docs_colaborador_v2_all"   ON documentos_colaborador_v2 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "ocorrencias_v2_all"        ON ocorrencias_v2        FOR ALL USING (true) WITH CHECK (true);

-- 4. Permitir INSERT em pessoas e vinculos_empregaticos (necessário para migração)
CREATE POLICY IF NOT EXISTS "pessoas_insert_migracao"
  ON pessoas FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "pessoas_select_migracao"
  ON pessoas FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "vinculos_insert_migracao"
  ON vinculos_empregaticos FOR INSERT WITH CHECK (true);

-- 5. Permitir INSERT em resumo_fechamento
CREATE POLICY IF NOT EXISTS "resumo_insert_migracao"
  ON resumo_fechamento FOR INSERT WITH CHECK (true);

SELECT 'Policies de migração criadas com sucesso!' AS resultado;
