-- =============================================================================
--  ConstrutorRH — FIX: Colunas de arquivo em tabelas de documentos
--  Execute no SQL Editor do Supabase — clique em RUN
--  Seguro para rodar mesmo que as colunas já existam (usa IF NOT EXISTS)
--  Gerado em: 2026-04-03
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELA: atestados
-- ─────────────────────────────────────────────────────────────────────────────
alter table atestados
  add column if not exists documento_url   text,
  add column if not exists documento_nome  text,
  add column if not exists data_inicio     date,
  add column if not exists acidente_id     uuid references acidentes(id) on delete set null;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABELA: acidentes
-- ─────────────────────────────────────────────────────────────────────────────
alter table acidentes
  add column if not exists documento_url   text,
  add column if not exists documento_nome  text;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABELA: advertencias
-- ─────────────────────────────────────────────────────────────────────────────
alter table advertencias
  add column if not exists documento_url   text,
  add column if not exists documento_nome  text;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABELA: documentos
-- ─────────────────────────────────────────────────────────────────────────────
alter table documentos
  add column if not exists arquivo_nome  text;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TABELA: portal_ocorrencias
-- ─────────────────────────────────────────────────────────────────────────────
alter table portal_ocorrencias
  add column if not exists arquivo_nome  text;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TABELA: portal_documentos
-- ─────────────────────────────────────────────────────────────────────────────
alter table portal_documentos
  add column if not exists arquivo_nome  text,
  add column if not exists data          date,
  add column if not exists updated_at    timestamptz default now();


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ÍNDICES de performance
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_atestados_colaborador     on atestados     (colaborador_id);
create index if not exists idx_atestados_data_inicio     on atestados     (data_inicio);
create index if not exists idx_acidentes_colaborador     on acidentes     (colaborador_id);
create index if not exists idx_advertencias_colaborador  on advertencias  (colaborador_id);
create index if not exists idx_documentos_colaborador    on documentos    (colaborador_id);
create index if not exists idx_docs_avulsos_colaborador  on documentos_avulsos (colaborador_id);


-- =============================================================================
-- ✅ atestados       → +documento_url, +documento_nome, +data_inicio, +acidente_id
-- ✅ acidentes       → +documento_url, +documento_nome
-- ✅ advertencias    → +documento_url, +documento_nome
-- ✅ documentos      → +arquivo_nome
-- ✅ portal_ocorrencias → +arquivo_nome
-- ✅ portal_documentos  → +arquivo_nome, +data, +updated_at
-- ✅ 6 índices de performance adicionados
-- =============================================================================
