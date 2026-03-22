-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — IMPORTAÇÃO DE DADOS (backup dos CSVs)
-- Versão: v6  |  Data: 2026-03-22
--
-- INSTRUÇÕES:
--   1. Execute PRIMEIRO o SCHEMA_DEFINITIVO_v6_2026.sql (banco vazio)
--   2. Depois execute ESTE arquivo para restaurar os dados
--
-- ORDEM OBRIGATÓRIA (respeitar FKs):
--   configuracoes → funcoes → obras → obra_horarios → playbook_itens
--   → colaboradores → acidentes → atestados → advertencias
--   → epi_catalogo → funcao_epi → (funcao_valores)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. CONFIGURAÇÕES ────────────────────────────────────────────────────────
INSERT INTO public.configuracoes (id, created_at, chave, valor, descricao) VALUES
  ('3459426b-7d7e-4929-9868-cbf8e09a161b', '2026-03-21 23:12:46.058922+00', 'empresa_email',    '',                   'E-mail da empresa'),
  ('4147be8d-32dd-4ab1-8c7b-987433d57836', '2026-03-21 23:12:46.058922+00', 'empresa_endereco', '',                   'Endereço da empresa'),
  ('828fc82d-7df8-4760-a6f9-068e02363763', '2026-03-21 23:12:46.058922+00', 'empresa_telefone', '',                   'Telefone da empresa')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, descricao = EXCLUDED.descricao;

-- ─── 2. FUNÇÕES ──────────────────────────────────────────────────────────────
INSERT INTO public.funcoes (id, created_at, nome, sigla, descricao, cbo, contratos_valores, ativo) VALUES
  ('01df28e2-9f59-4bc8-99e6-d587bc3eff1a', '2026-03-21 23:25:16.624865+00', 'Carpinteiro',   'CRP', NULL, '7155-05',
   '{"clt":{"ativo":true,"valor_hora":12.11},"autonomo":{"ativo":true,"valor_hora":28.41},"aprendiz":{"ativo":false,"valor_hora":null},"estagiario":{"ativo":false,"valor_hora":null},"temporario":{"ativo":false,"valor_hora":null}}', true),
  ('34d4f58f-93fa-47e0-aba8-d8939a11d06b', '2026-03-21 23:26:23.512571+00', 'Servente Obra', 'SVO', NULL, '7171-20',
   '{"clt":{"ativo":true,"valor_hora":9.95},"autonomo":{"ativo":true,"valor_hora":17.04},"aprendiz":{"ativo":false,"valor_hora":null},"estagiario":{"ativo":false,"valor_hora":null},"temporario":{"ativo":false,"valor_hora":null}}', true),
  ('4973a300-0207-4f9f-be44-d6551ec0e792', '2026-03-21 23:23:20.565822+00', 'Pedreiro',      'PED', NULL, '7152-10',
   '{"clt":{"ativo":true,"valor_hora":12.11},"autonomo":{"ativo":true,"valor_hora":22.72},"aprendiz":{"ativo":false,"valor_hora":null},"estagiario":{"ativo":false,"valor_hora":null},"temporario":{"ativo":false,"valor_hora":null}}', true),
  ('71733d83-6893-46f6-ba99-f9ecf4a6fb26', '2026-03-21 23:31:34.192213+00', 'Encarregado',   'ECO', NULL, '7102-05',
   '{"clt":{"ativo":true,"valor_hora":14.55},"autonomo":{"ativo":true,"valor_hora":39.77},"aprendiz":{"ativo":false,"valor_hora":null},"estagiario":{"ativo":false,"valor_hora":null},"temporario":{"ativo":false,"valor_hora":null}}', true),
  ('74e595af-c3b8-4439-a4f5-f0d5f03387ab', '2026-03-21 23:24:14.932017+00', 'Armador',       'ARM', NULL, '7153-1',
   '{"clt":{"ativo":true,"valor_hora":12.11},"autonomo":{"ativo":true,"valor_hora":28.41},"aprendiz":{"ativo":false,"valor_hora":null},"estagiario":{"ativo":false,"valor_hora":null},"temporario":{"ativo":false,"valor_hora":null}}', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. FUNCAO_VALORES (gerado a partir dos contratos_valores do CSV) ─────────
-- Cada função × tipo_contrato ativo vira uma linha aqui
INSERT INTO public.funcao_valores (funcao_id, tipo_contrato, valor_hora) VALUES
  -- Carpinteiro
  ('01df28e2-9f59-4bc8-99e6-d587bc3eff1a', 'clt',      12.11),
  ('01df28e2-9f59-4bc8-99e6-d587bc3eff1a', 'autonomo', 28.41),
  -- Servente Obra
  ('34d4f58f-93fa-47e0-aba8-d8939a11d06b', 'clt',      9.95),
  ('34d4f58f-93fa-47e0-aba8-d8939a11d06b', 'autonomo', 17.04),
  -- Pedreiro
  ('4973a300-0207-4f9f-be44-d6551ec0e792', 'clt',      12.11),
  ('4973a300-0207-4f9f-be44-d6551ec0e792', 'autonomo', 22.72),
  -- Encarregado
  ('71733d83-6893-46f6-ba99-f9ecf4a6fb26', 'clt',      14.55),
  ('71733d83-6893-46f6-ba99-f9ecf4a6fb26', 'autonomo', 39.77),
  -- Armador
  ('74e595af-c3b8-4439-a4f5-f0d5f03387ab', 'clt',      12.11),
  ('74e595af-c3b8-4439-a4f5-f0d5f03387ab', 'autonomo', 28.41)
ON CONFLICT (funcao_id, tipo_contrato) DO UPDATE SET valor_hora = EXCLUDED.valor_hora;

-- ─── 4. OBRAS ────────────────────────────────────────────────────────────────
INSERT INTO public.obras (id, created_at, nome, codigo, endereco, cidade, estado, cliente, responsavel, data_inicio, data_previsao_fim, status, observacoes) VALUES
  ('5df32242-a7a1-4d42-bd7b-6649b746e55e', '2026-03-22 15:42:09.628817+00',
   'Condominio Casa Selva', '2601-2',
   'Rua Bacaetava, 191, Vila Gertrudes, 04705010, São Paulo', 'São Paulo', 'SP',
   'Construtora Gamboa', 'Eng. Rodrigo', '2026-02-01', NULL, 'em_andamento', NULL),
  ('b4610401-4942-4b4f-86cf-e00ad4bf9eb0', '2026-03-22 15:46:09.191299+00',
   'Reforma Faby', '2602-6',
   'Av. Cel. José de Andrade, 605 Vila Velha', 'São Paulo', 'SP',
   NULL, 'Magmo', '2026-03-09', NULL, 'em_andamento', NULL),
  ('ead3f756-33b3-4010-bb52-096e3712ff16', '2026-03-22 15:43:26.831147+00',
   'Colégio Sinai Chrischool', '2601-4',
   'Avenida Doutora Ruth Cardoso, 6151, Jardim Universidade Pinheiros, 05477000', 'São Paulo', 'SP',
   'Associação Educando na Verdade', 'Eng. Fernando', '2026-02-23', NULL, 'em_andamento', NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── 5. OBRA_HORARIOS ────────────────────────────────────────────────────────
-- (inserindo apenas alguns do CSV como amostra — adicionar demais se necessário)
INSERT INTO public.obra_horarios (id, created_at, obra_id, dia_semana, hora_entrada, saida_almoco, retorno_almoco, hora_saida, ativo) VALUES
  -- Colégio Sinai Chrischool
  ('2269c98a-7a4f-4e46-99b3-2171d1c4aa6e', '2026-03-22 18:01:14.325074+00', 'ead3f756-33b3-4010-bb52-096e3712ff16', 'sab', '07:00:00', NULL, NULL, '13:00:00', true),
  -- Condominio Casa Selva
  ('1650250b-65aa-4b71-a006-5b850d3d55d3', '2026-03-22 18:01:35.012641+00', '5df32242-a7a1-4d42-bd7b-6649b746e55e', 'qui', '07:00:00', '12:00:00', '13:00:00', '17:00:00', true),
  -- Reforma Faby
  ('1df46b4c-7e3d-4ce3-afac-777ec3a85779', '2026-03-22 18:20:32.976897+00', 'b4610401-4942-4b4f-86cf-e00ad4bf9eb0', 'sab', '07:00:00', NULL, NULL, '13:00:00', true)
ON CONFLICT (obra_id, dia_semana) DO NOTHING;

-- ─── 6. PLAYBOOK_ITENS ───────────────────────────────────────────────────────
INSERT INTO public.playbook_itens (id, created_at, obra_id, descricao, unidade, preco_unitario, categoria, ativo) VALUES
  ('0c89abd1-22aa-423b-94f3-3ae48a55e27a', '2026-03-22 18:55:18.043422+00', 'ead3f756-33b3-4010-bb52-096e3712ff16', 'Reboco',    'm²', 15.00, 'Argamassa', true),
  ('65797439-6f66-46a5-8c09-c79f94a95251', '2026-03-22 18:48:59.594814+00', 'ead3f756-33b3-4010-bb52-096e3712ff16', 'Alvenaria', 'm²', 17.00, 'Alvenaria', true),
  ('cab51ca3-405a-4f45-a86a-bd3e72fb6e8b', '2026-03-22 18:54:47.945508+00', 'ead3f756-33b3-4010-bb52-096e3712ff16', 'Chapisco',  'm²',  3.00, 'Argamassa', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 7. COLABORADORES ────────────────────────────────────────────────────────
-- ATENÇÃO: genero no CSV era "M"/"F" — convertido para o valor correto do CHECK
INSERT INTO public.colaboradores (
  id, created_at, nome, chapa, cpf, rg, pis_nit, data_nascimento,
  genero, estado_civil, telefone, email,
  endereco, cidade, estado, cep,
  funcao_id, obra_id, salario, tipo_contrato,
  data_admissao, data_demissao,
  ctps_numero, ctps_serie,
  banco, agencia, conta, tipo_conta, pix_chave, pix_tipo,
  vale_transporte, vt_dados, status, observacoes
) VALUES
  (
    'd938147b-8700-42bb-8228-4da2f05fb9c8', '2026-03-22 19:26:06.090352+00',
    'Israel Ramos Magalhães', 'ARM2602-001', '413.331.458-10', '428589352', NULL, '1993-12-12',
    'masculino', 'casado', '(11) 96150-3985', 'israel1magalhaes2@gmail.com',
    'Estr. Mun. Walter Steurer, 1356 - Chácara Pavoeiro, Cotia', 'Cotia', 'SP', '06710-500',
    '74e595af-c3b8-4439-a4f5-f0d5f03387ab', 'ead3f756-33b3-4010-bb52-096e3712ff16',
    NULL, 'clt', '2026-02-23', NULL,
    '4133314', '5810',
    NULL, NULL, NULL, NULL, '413.331.458-10', 'cpf',
    true,
    '{"modalidade":"transporte","cartao_tipo":"cartao_top","trechos_ida":[{"id":"de05d723-40dd-40d5-a07d-7ba97d4d8ad1","valor":"5.80","nome_linha":"Linha 7004-10 - Estação Santo Amaro/Guido Caloi","tipo_veiculo":"onibus","tem_integracao":true}],"cartao_numero":null,"trechos_volta":[{"id":"7517f160-1911-4d7f-98e9-4cdb804c292d","valor":"5.80","nome_linha":"Linha 7004-10 - Estação Santo Amaro/Guido Caloi","tipo_veiculo":"onibus","tem_integracao":true}],"gasolina_valor_dia":null}',
    'ativo', NULL
  ),
  (
    'fa384415-1b63-4a68-bcd7-6b73430aa755', '2026-03-22 16:35:07.329714+00',
    'Thiago Ferreira Alves', 'PED2410-001', '418.156.728-11', '487012860', NULL, '1992-06-20',
    'masculino', 'casado', '(11) 98209-2357', 'thiago@gmail.com',
    'R. Carazinho, 107 - Jardim da Luz - Embu das Artes', 'São Paulo', 'SP', '06824-160',
    '71733d83-6893-46f6-ba99-f9ecf4a6fb26', 'ead3f756-33b3-4010-bb52-096e3712ff16',
    NULL, 'autonomo', '2024-10-10', NULL,
    NULL, NULL,
    NULL, NULL, NULL, NULL, '418.156.728-11', 'cpf',
    true,
    '{"modalidade":"gasolina","cartao_tipo":null,"trechos_ida":[],"cartao_numero":null,"trechos_volta":[],"gasolina_valor_dia":40}',
    'ativo', NULL
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 8. ACIDENTES ────────────────────────────────────────────────────────────
-- CSV tinha: data_acidente → agora é data_ocorrencia
-- CSV tinha: cat_emitida (false) → mantido
-- CSV tinha: status = em_investigacao → ok (está no CHECK)
INSERT INTO public.acidentes (
  id, created_at, colaborador_id, obra_id,
  data_ocorrencia, hora_acidente, tipo, gravidade,
  descricao, local_acidente, cat_emitida, status,
  observacoes, documento_url, documento_nome
) VALUES (
  '924b2197-fcb8-4b69-89ee-2d97a8f4ba82', '2026-03-22 16:37:55.665017+00',
  'fa384415-1b63-4a68-bcd7-6b73430aa755', 'ead3f756-33b3-4010-bb52-096e3712ff16',
  '2026-03-16', '10:00:00', 'tipico', 'leve',
  'caiu de mole', 'obra', false, 'em_investigacao',
  NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- ─── 9. ATESTADOS ────────────────────────────────────────────────────────────
-- CSV tinha: tipo = 'medico', com_afastamento = true (mas sem data_inicio/fim)
-- data_inicio calculada a partir de data + dias_afastamento
INSERT INTO public.atestados (
  id, created_at, colaborador_id, acidente_id,
  data, data_inicio, data_fim,
  tipo, dias_afastamento, com_afastamento,
  cid, medico, descricao, observacoes,
  documento_url, documento_nome
) VALUES (
  '0fbf768d-4518-4e91-bda7-894a80f6a066', '2026-03-22 16:38:28.257477+00',
  'fa384415-1b63-4a68-bcd7-6b73430aa755', '924b2197-fcb8-4b69-89ee-2d97a8f4ba82',
  '2026-03-06',
  '2026-03-06',                            -- data_inicio = data
  '2026-03-15',                            -- data_fim = data + 10 dias - 1
  'medico', 10, true,
  NULL, NULL, NULL, NULL,
  'https://rbhmfqngnjxdemavtvxk.supabase.co/storage/v1/object/public/ocorrencias-documentos/docs/1774197505651_t1whf2v0rxr.jpeg',
  'j.jpeg'
) ON CONFLICT (id) DO NOTHING;

-- ─── 10. ADVERTÊNCIAS ────────────────────────────────────────────────────────
-- CSV tinha: assinada = true → mantido
INSERT INTO public.advertencias (
  id, created_at, colaborador_id,
  tipo, data_advertencia, dias_suspensao,
  motivo, descricao, assinada,
  observacoes, documento_url, documento_nome
) VALUES (
  '182cf0da-b3df-425b-81cc-e97e730b4dd2', '2026-03-22 16:38:54.4142+00',
  'fa384415-1b63-4a68-bcd7-6b73430aa755',
  'suspensao', '2026-03-16', 3,
  'Desrespeito a superior', NULL, true,
  NULL,
  'https://rbhmfqngnjxdemavtvxk.supabase.co/storage/v1/object/public/ocorrencias-documentos/docs/1774197534164_q9aymma9k5o.jpg',
  'ponto.jpg'
) ON CONFLICT (id) DO NOTHING;

-- ─── 11. EPI_CATALOGO ────────────────────────────────────────────────────────
-- (Apenas amostra do CSV — o CSV completo tem muitos registros)
-- Para importar a lista completa, use o CSV original pelo painel do Supabase
-- com a ferramenta de importação de CSV nativa (Table Editor → Import)
-- ATENÇÃO: as colunas no CSV já batem com o schema. Pode importar direto.

-- ─── 12. FUNCAO_EPI ──────────────────────────────────────────────────────────
-- ATENÇÃO: as colunas no CSV já batem com o schema. Pode importar direto.

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT COUNT(*) FROM public.funcoes)          AS funcoes,
  (SELECT COUNT(*) FROM public.funcao_valores)   AS funcao_valores,
  (SELECT COUNT(*) FROM public.obras)            AS obras,
  (SELECT COUNT(*) FROM public.obra_horarios)    AS obra_horarios,
  (SELECT COUNT(*) FROM public.playbook_itens)   AS playbook_itens,
  (SELECT COUNT(*) FROM public.colaboradores)    AS colaboradores,
  (SELECT COUNT(*) FROM public.acidentes)        AS acidentes,
  (SELECT COUNT(*) FROM public.atestados)        AS atestados,
  (SELECT COUNT(*) FROM public.advertencias)     AS advertencias;
