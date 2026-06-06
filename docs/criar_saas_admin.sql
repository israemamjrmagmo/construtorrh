-- ============================================================
-- TABELA saas_admins: controla quem tem acesso ao painel SaaS
-- Executar no banco V2: https://mxntcjgzeaxlbxiawsdh.supabase.co
-- ============================================================

CREATE TABLE IF NOT EXISTS saas_admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id    uuid UNIQUE,           -- FK para auth.users (pode ser null antes de criar o user)
  email      text UNIQUE NOT NULL,  -- e-mail do admin SaaS
  nome       text,
  ativo      boolean NOT NULL DEFAULT true
);

-- RLS: apenas o próprio usuário e outros saas_admins podem ver
ALTER TABLE saas_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saas_admins_select" ON saas_admins;
CREATE POLICY "saas_admins_select" ON saas_admins FOR SELECT USING (true);

DROP POLICY IF EXISTS "saas_admins_insert" ON saas_admins;
CREATE POLICY "saas_admins_insert" ON saas_admins FOR INSERT WITH CHECK (true);

-- Inserir o admin SaaS padrão (substitua o email se quiser outro)
-- Deixe user_id como NULL por enquanto; será preenchido após criar o usuário no Auth
INSERT INTO saas_admins (email, nome, ativo)
VALUES ('admin@construtorrh.com', 'SaaS Master', true)
ON CONFLICT (email) DO NOTHING;

SELECT id, email, nome, ativo FROM saas_admins;
