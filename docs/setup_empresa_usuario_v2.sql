-- ============================================================
-- SETUP USUARIO MASTER DA EMPRESA NO V2
-- Execute APÓS criar o usuario magmodrive@gmail.com em:
-- Supabase V2 → Authentication → Users → Add User
-- Substitua <USER_ID_AQUI> pelo UUID do usuário criado
-- ============================================================

-- Vincular usuário como master_empresa
INSERT INTO empresa_usuarios (empresa_id, user_id, role, ativo, nome, email)
VALUES (
  'd1282f82-a558-4a1c-b8b6-11a6d88e108b',
  '<USER_ID_AQUI>',
  'master_empresa',
  true,
  'Administrador Magmo',
  'magmodrive@gmail.com'
)
ON CONFLICT (empresa_id, user_id) DO UPDATE SET role = 'master_empresa', ativo = true;

-- Atualizar master_user_id na empresa
UPDATE empresas
SET master_user_id = '<USER_ID_AQUI>'
WHERE id = 'd1282f82-a558-4a1c-b8b6-11a6d88e108b';

SELECT
  e.nome AS empresa,
  eu.role,
  eu.email,
  eu.ativo
FROM empresa_usuarios eu
JOIN empresas e ON e.id = eu.empresa_id
WHERE eu.empresa_id = 'd1282f82-a558-4a1c-b8b6-11a6d88e108b';
