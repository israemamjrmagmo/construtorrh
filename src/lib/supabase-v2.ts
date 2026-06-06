import { createClient } from '@supabase/supabase-js'

// Credenciais públicas (anon key) — seguro para frontend
// GitHub Pages não lê .env, por isso estão embutidas aqui
const supabaseV2Url     = import.meta.env.VITE_SUPABASE_V2_URL      as string
                       || 'https://mxntcjgzeaxlbxiawsdh.supabase.co'
const supabaseV2AnonKey = import.meta.env.VITE_SUPABASE_V2_ANON_KEY  as string
                       || 'sb_publishable_hgWoK3potvPigssZD6w4zw_W1104kkh'

export const supabaseV2 = createClient(supabaseV2Url, supabaseV2AnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: true,
  },
})

// ─── Tipos V2 ─────────────────────────────────────────────────────────────────

export interface EmpresaV2 {
  id:             string
  created_at:     string
  nome:           string
  cnpj:           string | null
  email:          string | null
  telefone:       string | null
  endereco:       string | null
  cidade:         string | null
  estado:         string | null
  logo_url:       string | null
  plano:          'basico' | 'profissional' | 'enterprise'
  ativo:          boolean
  configuracoes:  Record<string, unknown> | null
  master_user_id: string | null
}

export interface PessoaV2 {
  id:              string
  created_at:      string
  cpf:             string
  nome:            string
  data_nascimento: string | null
  telefone:        string | null
  email:           string | null
  endereco:        string | null
  cidade:          string | null
  estado:          string | null
  cep:             string | null
  rg:              string | null
  pis_nit:         string | null
  genero:          string | null
  estado_civil:    string | null
  foto_url:        string | null
  nome_pai:        string | null
  nome_mae:        string | null
  banco:           string | null
  agencia:         string | null
  conta:           string | null
  tipo_conta:      string | null
  pix_chave:       string | null
  pix_tipo:        string | null
  vt_dados:        Record<string, unknown> | null
  updated_at:      string | null
}

export interface VinculoEmpregaticioV2 {
  id:                  string
  created_at:          string
  pessoa_id:           string
  empresa_id:          string
  obra_id:             string | null
  funcao_id:           string | null
  chapa:               string | null
  tipo_contrato:       string
  salario:             number | null
  data_admissao:       string
  data_demissao:       string | null
  status:              'ativo' | 'inativo' | 'afastado' | 'ferias' | 'encerrado'
  observacoes:         string | null
  vinculo_anterior_id: string | null
  updated_at:          string | null
}

export interface ResumoFechamentoV2 {
  id:               string
  empresa_id:       string
  obra_id:          string
  vinculo_id:       string
  colaborador_id:   string
  competencia_mes:  number
  competencia_ano:  number
  competencia:      string
  salario_base:     number
  horas_extras:     number
  valor_horas_extras: number
  faltas:           number
  premios:          number
  vale_transporte:  number
  desconto_vt:      number
  encargos:         number
  inss:             number
  ir:               number
  dsr:              number
  valor_liquido:    number
  status:           string
  versao:           number
  data_aprovacao:   string | null
  data_pagamento:   string | null
}
