-- =============================================================================
--  ConstrutorRH — FIX: Colunas de arquivo em tabelas de documentos
--  Execute no SQL Editor do Supabase — clique em RUN
--  Seguro para rodar mesmo que as colunas já existam (usa IF NOT EXISTS)
--  Gerado em: 2026-04-03
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
--  PROBLEMA IDENTIFICADO
--  O código TypeScript lê/grava as seguintes colunas que NÃO existem no
--  schema original:
--
--    atestados       → documento_url, documento_nome  (schema só tinha arquivo_url)
--    acidentes       → documento_url, documento_nome  (schema não tinha nenhuma)
--    advertencias    → documento_url, documento_nome  (schema só tinha arquivo_url)
--    documentos      → arquivo_nome                   (schema só tinha arquivo_url)
--    portal_ocorrencias → arquivo_nome                (schema só tinha arquivo_url)
--    portal_documentos  → arquivo_nome                (schema só tinha arquivo_url)
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELA: atestados
--    Adicionar documento_url e documento_nome
--    (arquivo_url é mantido por compatibilidade com dados antigos)
-- ─────────────────────────────────────────────────────────────────────────────
alter table atestados
  add column if not exists documento_url   text,
  add column if not exists documento_nome  text,
  add column if not exists data_inicio     date,   -- data de início do afastamento
  add column if not exists acidente_id     uuid references acidentes(id) on delete set null;

-- Migrar dados antigos: copiar arquivo_url → documento_url
update atestados
   set documento_url = arquivo_url
 where arquivo_url is not null
   and documento_url is null;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABELA: acidentes
--    Adicionar documento_url e documento_nome
-- ─────────────────────────────────────────────────────────────────────────────
alter table acidentes
  add column if not exists documento_url   text,
  add column if not exists documento_nome  text;

-- Migrar dados antigos se houver arquivo_url
-- (acidentes não tinha arquivo_url no schema original, mas por segurança):
-- update acidentes set documento_url = arquivo_url where arquivo_url is not null and documento_url is null;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABELA: advertencias
--    Adicionar documento_url e documento_nome
--    (arquivo_url é mantido por compatibilidade)
-- ─────────────────────────────────────────────────────────────────────────────
alter table advertencias
  add column if not exists documento_url   text,
  add column if not exists documento_nome  text;

-- Migrar dados antigos
update advertencias
   set documento_url = arquivo_url
 where arquivo_url is not null
   and documento_url is null;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABELA: documentos
--    Adicionar arquivo_nome (faltava no schema original)
-- ─────────────────────────────────────────────────────────────────────────────
alter table documentos
  add column if not exists arquivo_nome  text;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TABELA: portal_ocorrencias
--    Adicionar arquivo_nome para exibir o nome original do arquivo
-- ─────────────────────────────────────────────────────────────────────────────
alter table portal_ocorrencias
  add column if not exists arquivo_nome  text;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TABELA: portal_documentos
--    Adicionar arquivo_nome e data para melhor controle
-- ─────────────────────────────────────────────────────────────────────────────
alter table portal_documentos
  add column if not exists arquivo_nome  text,
  add column if not exists data          date,
  add column if not exists updated_at    timestamptz default now();


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ÍNDICES de performance para consultas por colaborador e data
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_atestados_colaborador     on atestados     (colaborador_id);
create index if not exists idx_atestados_data_inicio     on atestados     (data_inicio);
create index if not exists idx_acidentes_colaborador     on acidentes     (colaborador_id);
create index if not exists idx_advertencias_colaborador  on advertencias  (colaborador_id);
create index if not exists idx_documentos_colaborador    on documentos    (colaborador_id);
create index if not exists idx_docs_avulsos_colaborador  on documentos_avulsos (colaborador_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- RESUMO DO QUE FOI ALTERADO
-- ─────────────────────────────────────────────────────────────────────────────
-- ✅ atestados       → +documento_url, +documento_nome, +data_inicio, +acidente_id
-- ✅ acidentes       → +documento_url, +documento_nome
-- ✅ advertencias    → +documento_url, +documento_nome
-- ✅ documentos      → +arquivo_nome
-- ✅ portal_ocorrencias → +arquivo_nome
-- ✅ portal_documentos  → +arquivo_nome, +data, +updated_at
-- ✅ 6 índices de performance adicionados
-- =============================================================================
