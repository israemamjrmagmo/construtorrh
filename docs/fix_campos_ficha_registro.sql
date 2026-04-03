-- =============================================================================
--  ConstrutorRH — Novos campos baseados na Ficha de Registro da Contabilidade
--  Execute no SQL Editor do Supabase — clique em RUN
--  Seguro para rodar mesmo que já existam (usa IF NOT EXISTS)
--  Gerado em: 2026-04-03
-- =============================================================================

alter table colaboradores
  -- ── Filiação ─────────────────────────────────────────────────────────────
  add column if not exists nome_pai              text,           -- nome do pai
  add column if not exists nome_mae              text,           -- nome da mãe

  -- ── Dados pessoais complementares ────────────────────────────────────────
  add column if not exists cor_raca              text,
    -- 'branca' | 'preta' | 'parda' | 'amarela' | 'indigena' | 'nao_declarada'
  add column if not exists deficiencia           boolean not null default false,
  add column if not exists tipo_deficiencia      text,           -- descrição quando deficiencia=true
  add column if not exists doc_militar           text,           -- nº do documento militar
  add column if not exists matricula_esocial     text,           -- matrícula eSocial / Reg. Social

  -- ── Rescisão / desligamento ──────────────────────────────────────────────
  add column if not exists tipo_desligamento     text,
    -- 'pedido_demissao' | 'demissao_sem_justa_causa' | 'demissao_justa_causa'
    -- | 'termino_contrato' | 'falecimento' | 'aposentadoria' | 'outros'
  add column if not exists data_aviso_previo     date,           -- data do aviso ind.

  -- ── Horário de trabalho ──────────────────────────────────────────────────
  add column if not exists horario_trabalho      jsonb,
    -- [{dia:'seg', tipo:'trabalhado', entrada:'07:00', saida_almoco:'11:30',
    --   retorno_almoco:'12:30', saida:'17:00'}]

  -- ── Foto de perfil (já pode existir de fix anterior) ─────────────────────
  add column if not exists foto_url              text;

-- Índice para buscas por eSocial
create index if not exists idx_colaboradores_esocial on colaboradores (matricula_esocial)
  where matricula_esocial is not null;

-- =============================================================================
-- ✅ colaboradores → +nome_pai, +nome_mae, +cor_raca, +deficiencia,
--                    +tipo_deficiencia, +doc_militar, +matricula_esocial,
--                    +tipo_desligamento, +data_aviso_previo,
--                    +horario_trabalho (jsonb), +foto_url (se não existir)
-- =============================================================================
