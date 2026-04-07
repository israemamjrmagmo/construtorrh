import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Receipt, LogOut, Download, AlertCircle, Key, Eye, EyeOff, Loader2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Sessao = {
  colaborador_id: string
  acesso_id: string
  login: string
  nome: string
  chapa: string
}

type Contracheque = {
  id: string
  competencia: string
  tipo: string
  descricao: string | null
  arquivo_url: string | null
  arquivo_nome: string | null
  bruto: number | null
  liquido: number | null
  descontos: number | null
  inss: number | null
  fgts: number | null
  irrf: number | null
  publicado_em: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function fmtCompetencia(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${meses[parseInt(m, 10) - 1]} / ${y}`
}

function fmtMoeda(v: number | null): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarCPF(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
}

const TIPO_LABEL: Record<string, string> = {
  mensal:     'Mensal',
  '13o_1a':   '13º Salário — 1ª Parcela',
  '13o_2a':   '13º Salário — 2ª Parcela',
  ferias:     'Férias',
  adiantamento: 'Adiantamento',
}

const SESSION_KEY = 'contracheque_session'

// ─── Tela de Troca de Senha ───────────────────────────────────────────────────
function TrocaSenha({
  acessoId,
  nome,
  onConcluido,
}: {
  acessoId: string
  nome: string
  onConcluido: (sessao: Sessao) => void
}) {
  const [nova,    setNova]    = useState('')
  const [conf,    setConf]    = useState('')
  const [showN,   setShowN]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState('')

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (nova.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return }
    if (nova !== conf)   { setErro('As senhas não conferem.'); return }
    setLoading(true); setErro('')

    const hash = await sha256(nova)
    const { error } = await supabase
      .from('colaborador_acessos')
      .update({
        senha_hash: hash,
        must_change_password: false,
        ultimo_acesso: new Date().toISOString(),
      })
      .eq('id', acessoId)

    setLoading(false)
    if (error) { setErro('Erro ao salvar. Tente novamente.'); return }

    // Buscar colaborador_id e dados para criar sessão
    const { data: acesso } = await supabase
      .from('colaborador_acessos')
      .select('colaborador_id, cpf, colaboradores(nome, chapa)')
      .eq('id', acessoId)
      .single()

    if (!acesso) { setErro('Sessão inválida. Faça login novamente.'); return }

    const colab = acesso.colaboradores as { nome: string; chapa: string } | null
    const sessao: Sessao = {
      colaborador_id: acesso.colaborador_id,
      acesso_id:      acessoId,
      login:          acesso.cpf,
      nome:           colab?.nome ?? nome,
      chapa:          colab?.chapa ?? '',
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
    onConcluido(sessao)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d3f56 0%, #1e3a5f 50%, #0f2d4a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px',
        width: '100%', maxWidth: 400, boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #b45309, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Key size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Criar Nova Senha</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0', lineHeight: 1.5 }}>
            Bem-vindo(a), <strong>{nome.split(' ')[0]}</strong>!<br />
            Crie uma senha pessoal para continuar.
          </p>
        </div>

        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10,
          padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 20, fontWeight: 600,
        }}>
          🔐 Este é seu primeiro acesso. Defina uma senha com ao menos 6 caracteres.
        </div>

        <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Nova Senha
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showN ? 'text' : 'password'}
                value={nova} onChange={e => setNova(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                style={{
                  width: '100%', height: 44, borderRadius: 10, border: '1.5px solid #e2e8f0',
                  padding: '0 44px 0 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button type="button" onClick={() => setShowN(s => !s)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4,
              }}>
                {showN ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Confirmar Senha
            </label>
            <input
              type="password"
              value={conf} onChange={e => setConf(e.target.value)}
              placeholder="Repita a senha"
              autoComplete="new-password"
              style={{
                width: '100%', height: 44, borderRadius: 10, border: '1.5px solid #e2e8f0',
                padding: '0 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box',
              }}
            />
            {conf && nova !== conf && (
              <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4, margin: '4px 0 0' }}>
                As senhas não conferem
              </p>
            )}
          </div>

          {erro && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, color: '#dc2626', fontSize: 13,
            }}>
              <AlertCircle size={14} /> {erro}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            height: 46, borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? '#94a3b8' : 'linear-gradient(135deg, #b45309, #d97706)',
            color: '#fff', fontWeight: 700, fontSize: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {loading ? <><Loader2 size={18} className="animate-spin"/>Salvando…</> : <><Key size={16}/>Salvar Senha e Entrar</>}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Tela de Login ────────────────────────────────────────────────────────────
function TelaLogin({ onLogin }: { onLogin: (s: Sessao) => void }) {
  const [cpfInput,  setCpfInput]  = useState('')
  const [senha,     setSenha]     = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [erro,      setErro]      = useState('')

  // Estado para troca de senha obrigatória
  const [trocar, setTrocar] = useState<{ acessoId: string; nome: string } | null>(null)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    const cpf = cpfInput.replace(/\D/g, '')
    if (cpf.length !== 11)     { setErro('CPF inválido — informe os 11 dígitos.'); return }
    if (!senha.trim())          { setErro('Informe a senha.'); return }
    setLoading(true); setErro('')

    try {
      const hash = await sha256(senha.trim())

      const { data: acesso, error: errAcesso } = await supabase
        .from('colaborador_acessos')
        .select('id, colaborador_id, cpf, senha_hash, must_change_password, ativo, colaboradores(id, nome, chapa, status)')
        .eq('cpf', cpf)
        .single()

      if (errAcesso || !acesso) {
        setErro('CPF não encontrado ou sem acesso cadastrado.')
        setLoading(false); return
      }
      if (!acesso.ativo) {
        setErro('Acesso desativado. Contate o RH.')
        setLoading(false); return
      }
      if (acesso.senha_hash !== hash) {
        setErro('Senha incorreta.')
        setLoading(false); return
      }

      const colab = acesso.colaboradores as { id: string; nome: string; chapa: string; status: string } | null

      // Primeiro acesso — redirecionar para troca de senha
      if (acesso.must_change_password) {
        setTrocar({ acessoId: acesso.id, nome: colab?.nome ?? 'Colaborador' })
        setLoading(false); return
      }

      // Login completo
      await supabase
        .from('colaborador_acessos')
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq('id', acesso.id)

      const sessao: Sessao = {
        colaborador_id: acesso.colaborador_id,
        acesso_id:      acesso.id,
        login:          cpf,
        nome:           colab?.nome ?? 'Colaborador',
        chapa:          colab?.chapa ?? '',
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
      onLogin(sessao)
    } catch {
      setErro('Erro ao autenticar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Redirecionar para tela de troca de senha se necessário
  if (trocar) {
    return (
      <TrocaSenha
        acessoId={trocar.acessoId}
        nome={trocar.nome}
        onConcluido={onLogin}
      />
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d3f56 0%, #1e3a5f 50%, #0f2d4a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px',
        width: '100%', maxWidth: 400, boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
      }}>
        {/* Logo / Título */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #0d3f56, #1e3a5f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Receipt size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Portal do Colaborador</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0', lineHeight: 1.5 }}>
            Acesse seus holerites com segurança
          </p>
        </div>

        <form onSubmit={entrar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              CPF
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={cpfInput}
              onChange={e => setCpfInput(formatarCPF(e.target.value))}
              placeholder="000.000.000-00"
              maxLength={14}
              autoComplete="username"
              style={{
                width: '100%', height: 44, borderRadius: 10, border: '1.5px solid #e2e8f0',
                padding: '0 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showSenha ? 'text' : 'password'}
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="Sua senha (padrão: 123)"
                autoComplete="current-password"
                style={{
                  width: '100%', height: 44, borderRadius: 10, border: '1.5px solid #e2e8f0',
                  padding: '0 44px 0 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button type="button" onClick={() => setShowSenha(s => !s)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4,
              }}>
                {showSenha ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 5, margin: '5px 0 0' }}>
              Primeiro acesso? Use a senha <strong>123</strong> e crie sua senha pessoal.
            </p>
          </div>

          {erro && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, color: '#dc2626', fontSize: 13,
            }}>
              <AlertCircle size={14} /> {erro}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            height: 46, borderRadius: 10, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0d3f56, #1e5c7a)',
            color: '#fff', fontWeight: 700, fontSize: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: loading ? 0.8 : 1,
          }}>
            {loading ? <><Loader2 size={18} className="animate-spin"/>Verificando…</> : 'Entrar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 20 }}>
          Problemas com acesso? Fale com o RH da empresa.
        </p>
      </div>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function PortalContracheque() {
  const [sessao, setSessao] = useState<Sessao | null>(() => {
    try {
      const s = localStorage.getItem(SESSION_KEY)
      return s ? JSON.parse(s) : null
    } catch { return null }
  })
  const [holerites, setHolerites] = useState<Contracheque[]>([])
  const [loading, setLoading] = useState(false)

  const carregarHolerites = useCallback(async (colaboradorId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('contracheques')
      .select('id,competencia,tipo,descricao,arquivo_url,arquivo_nome,bruto,liquido,descontos,inss,fgts,irrf,publicado_em')
      .eq('colaborador_id', colaboradorId)
      .eq('publicado', true)
      .order('competencia', { ascending: false })
    setHolerites((data as Contracheque[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (sessao) carregarHolerites(sessao.colaborador_id)
  }, [sessao, carregarHolerites])

  function sair() {
    localStorage.removeItem(SESSION_KEY)
    setSessao(null)
    setHolerites([])
  }

  if (!sessao) return <TelaLogin onLogin={setSessao} />

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0d3f56, #1e3a5f)',
        padding: '0 20px',
      }}>
        <div style={{
          maxWidth: 700, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 64,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Receipt size={22} color="#fff" />
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Meus Holerites</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                {sessao.nome}{sessao.chapa ? ` · Chapa ${sessao.chapa}` : ''}
              </div>
            </div>
          </div>
          <button
            onClick={sair}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 8, padding: '7px 14px', color: '#fff', cursor: 'pointer', fontSize: 13,
            }}
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px', display: 'block', color: '#0d3f56' }} />
            Carregando holerites…
          </div>
        ) : holerites.length === 0 ? (
          <div style={{
            background: '#fff', borderRadius: 14, padding: 48, textAlign: 'center',
            border: '1px solid #e2e8f0',
          }}>
            <Receipt size={48} strokeWidth={1} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: '#475569' }}>Nenhum holerite disponível</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
              Seus holerites aparecerão aqui quando forem publicados pelo RH.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {holerites.map(h => (
              <div key={h.id} style={{
                background: '#fff', borderRadius: 14, padding: '20px 22px',
                border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                {/* Topo */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                      {fmtCompetencia(h.competencia)}
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: '#1d4ed8',
                      background: '#dbeafe', padding: '2px 8px', borderRadius: 10,
                      display: 'inline-block', marginTop: 4,
                    }}>
                      {TIPO_LABEL[h.tipo] ?? h.tipo}
                    </div>
                  </div>
                  {h.arquivo_url && (
                    <a href={h.arquivo_url} target="_blank" rel="noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', background: '#0d3f56', color: '#fff',
                        borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600,
                      }}>
                      <Download size={14} /> PDF
                    </a>
                  )}
                </div>

                {/* Valores */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 12,
                }}>
                  <ValorCard label="Salário Bruto"   valor={h.bruto}     />
                  <ValorCard label="Descontos"        valor={h.descontos} negativo />
                  <ValorCard label="INSS"             valor={h.inss}      negativo />
                  <ValorCard label="IRRF"             valor={h.irrf}      negativo />
                  <ValorCard label="FGTS"             valor={h.fgts}      cor="#0369a1" />
                  <ValorCard label="Salário Líquido"  valor={h.liquido}   destaque cor="#16a34a" />
                </div>

                {h.descricao && (
                  <div style={{
                    marginTop: 14, padding: '10px 14px', background: '#f8fafc',
                    borderRadius: 8, fontSize: 12, color: '#64748b', borderLeft: '3px solid #e2e8f0',
                  }}>
                    {h.descricao}
                  </div>
                )}

                {h.publicado_em && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, textAlign: 'right' }}>
                    Publicado em {new Date(h.publicado_em).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Componente auxiliar ──────────────────────────────────────────────────────
function ValorCard({
  label, valor, destaque, negativo, cor,
}: {
  label: string; valor: number | null; destaque?: boolean; negativo?: boolean; cor?: string
}) {
  const color = cor ?? (negativo ? '#dc2626' : destaque ? '#16a34a' : '#0f172a')
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10,
      background: destaque ? '#f0fdf4' : negativo ? '#fff1f2' : '#f8fafc',
      border: `1px solid ${destaque ? '#bbf7d0' : negativo ? '#fecaca' : '#e2e8f0'}`,
    }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{fmtMoeda(valor)}</div>
    </div>
  )
}
