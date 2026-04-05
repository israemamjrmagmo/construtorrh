-- ══════════════════════════════════════════════════════════════════
-- Modelos de Contratos e Documentos Jurídicos
-- ══════════════════════════════════════════════════════════════════

create table if not exists contratos_modelos (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  numero        int,                        -- ex: 1, 2, 5, 6 ...
  titulo        text not null,              -- nome exibido no sistema
  categoria     text not null default 'admissional',
                                            -- 'admissional' | 'contrato' | 'termo' | 'declaracao' | 'politica' | 'ficha' | 'outro'
  tipo_contrato text[],                     -- null = todos; ['clt'] = só CLT; ['autonomo','pj'] etc.
  descricao     text,
  conteudo      text not null,              -- HTML/Markdown com {{variaveis}}
  variaveis     jsonb default '[]',         -- lista de variáveis usadas: [{chave, label, fonte, obrigatorio}]
  ativo         boolean default true,
  ordem         int default 0
);

-- Índices
create index if not exists idx_contratos_modelos_categoria on contratos_modelos(categoria);
create index if not exists idx_contratos_modelos_ativo on contratos_modelos(ativo);

-- RLS
alter table contratos_modelos enable row level security;
create policy "Autenticados lêem modelos ativos"
  on contratos_modelos for select
  using (auth.role() = 'authenticated');
create policy "Autenticados gerenciam modelos"
  on contratos_modelos for all
  using (auth.role() = 'authenticated');

-- Histórico de contratos gerados (opcional — auditoria)
create table if not exists contratos_gerados (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  modelo_id       uuid references contratos_modelos(id) on delete set null,
  colaborador_id  uuid references colaboradores(id) on delete set null,
  titulo_gerado   text,
  conteudo_final  text,         -- HTML final já com variáveis substituídas
  gerado_por      uuid references auth.users(id)
);

alter table contratos_gerados enable row level security;
create policy "Autenticados acessam contratos gerados"
  on contratos_gerados for all
  using (auth.role() = 'authenticated');
