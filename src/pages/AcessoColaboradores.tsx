import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  Key, KeyRound, Plus, Search, RefreshCw, Loader2,
  Lock, Unlock, Trash2, ExternalLink, Copy, UserCheck, ShieldCheck,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ColaboradorAcesso {
  id: string; colaborador_id: string; cpf: string
  must_change_password: boolean; ativo: boolean
  ultimo_acesso: string | null; created_at: string
  colaborador_nome?: string; colaborador_status?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}
function fmtCPF(cpf: string) {
  const d = cpf.replace(/\D/g,'')
  if (d.length !== 11) return cpf
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
}
function fmtData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

const PORTAL_URL = 'https://construtorrh-magmo.netlify.app/#/portal/contracheque'

// ─── Componente ───────────────────────────────────────────────────────────────
export default function AcessoColaboradores() {
  const [acessos,          setAcessos]          = useState<ColaboradorAcesso[]>([])
  const [loadingAcessos,   setLoadingAcessos]   = useState(true)
  const [busca,            setBusca]            = useState('')
  const [colabsDisp,       setColabsDisp]       = useState<{id:string;nome:string;cpf:string|null}[]>([])
  const [novoColabId,      setNovoColabId]      = useState('')
  const [novoCpf,          setNovoCpf]          = useState('')
  const [salvando,         setSalvando]         = useState(false)
  const [resetandoId,      setResetandoId]      = useState<string | null>(null)
  const [copiouPortal,     setCopiouPortal]     = useState(false)

  // ── Fetch acessos ───────────────────────────────────────────────────────────
  const fetchAcessos = useCallback(async () => {
    setLoadingAcessos(true)
    try {
      const { data, error } = await supabase
        .from('colaborador_acessos')
        .select('id,colaborador_id,cpf,must_change_password,ativo,ultimo_acesso,created_at,colaboradores(nome,status)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setAcessos((data ?? []).map((r: any) => ({
        id: r.id, colaborador_id: r.colaborador_id, cpf: r.cpf,
        must_change_password: r.must_change_password, ativo: r.ativo,
        ultimo_acesso: r.ultimo_acesso, created_at: r.created_at,
        colaborador_nome: r.colaboradores?.nome ?? '—',
        colaborador_status: r.colaboradores?.status ?? '—',
      })))
    } catch (err: any) {
      toast.error('Erro ao carregar: ' + (err?.message ?? ''))
    }
    setLoadingAcessos(false)
  }, [])

  // ── Fetch colaboradores disponíveis (CLT ativos sem acesso) ────────────────
  const fetchColabs = useCallback(async () => {
    const { data } = await supabase
      .from('colaboradores')
      .select('id,nome,cpf,tipo_contrato')
      .eq('status','ativo').eq('tipo_contrato','clt').order('nome')
    setColabsDisp((data ?? []).map((c: any) => ({ id: c.id, nome: c.nome, cpf: c.cpf })))
  }, [])

  useEffect(() => { fetchAcessos(); fetchColabs() }, [fetchAcessos, fetchColabs])

  // ── Criar acesso ────────────────────────────────────────────────────────────
  async function criarAcesso() {
    const cpf = novoCpf.replace(/\D/g,'').trim()
    if (!novoColabId) { toast.error('Selecione um colaborador'); return }
    if (cpf.length !== 11) { toast.error('CPF inválido — informe os 11 dígitos'); return }
    setSalvando(true)
    try {
      const hash = await sha256('123')
      const { error } = await supabase.from('colaborador_acessos').insert({
        colaborador_id: novoColabId, cpf, senha_hash: hash,
        ativo: true, must_change_password: true,
      })
      if (error) throw error
      toast.success('Acesso liberado! Senha inicial: 123')
      setNovoColabId(''); setNovoCpf('')
      fetchAcessos(); fetchColabs()
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message ?? ''))
    }
    setSalvando(false)
  }

  // ── Reset senha ─────────────────────────────────────────────────────────────
  async function resetarSenha(id: string, nome: string) {
    setResetandoId(id)
    try {
      const hash = await sha256('123')
      const { error } = await supabase.from('colaborador_acessos')
        .update({ senha_hash: hash, must_change_password: true }).eq('id', id)
      if (error) throw error
      toast.success(`Senha de ${nome.split(' ')[0]} resetada para 123`)
      fetchAcessos()
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message ?? ''))
    }
    setResetandoId(null)
  }

  // ── Toggle ativo ────────────────────────────────────────────────────────────
  async function toggleAtivo(id: string, ativo: boolean) {
    const { error } = await supabase.from('colaborador_acessos')
      .update({ ativo: !ativo }).eq('id', id)
    if (error) { toast.error('Erro ao alterar'); return }
    toast.success(!ativo ? 'Acesso ativado!' : 'Acesso desativado!')
    setAcessos(prev => prev.map(a => a.id === id ? { ...a, ativo: !ativo } : a))
  }

  // ── Excluir ────────────────────────────────────────────────────────────────
  async function excluirAcesso(id: string, nome: string) {
    if (!confirm(`Remover acesso de ${nome}?`)) return
    const { error } = await supabase.from('colaborador_acessos').delete().eq('id', id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Acesso removido')
    setAcessos(prev => prev.filter(a => a.id !== id))
  }

  // ── Copiar credenciais ──────────────────────────────────────────────────────
  function copiarCredenciais(acesso: ColaboradorAcesso) {
    const txt = `Portal de Holerites\nURL: ${PORTAL_URL}\nCPF: ${fmtCPF(acesso.cpf)}\nSenha padrão: 123`
    navigator.clipboard.writeText(txt).then(() => toast.success('Credenciais copiadas!'))
  }

  const filtrados = acessos.filter(a => {
    const q = busca.toLowerCase()
    return !q || (a.colaborador_nome?.toLowerCase().includes(q) ?? false) || a.cpf.includes(q.replace(/\D/g,''))
  })

  const ativos   = acessos.filter(a => a.ativo).length
  const inativos = acessos.filter(a => !a.ativo).length

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>

      {/* ── Cabeçalho ── */}
      <div style={{ background: 'linear-gradient(135deg, #0d3f56, #1e5c7a)', padding: '24px 32px 28px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KeyRound size={24} color="#fff" />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                  Acesso Colaboradores
                </h1>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,.7)' }}>
                  Portal do Contracheque — gerencie quem pode acessar
                </p>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { label: 'Total', valor: acessos.length, bg: 'rgba(255,255,255,.15)', cor: '#fff' },
                { label: 'Ativos', valor: ativos, bg: 'rgba(34,197,94,.25)', cor: '#86efac' },
                { label: 'Inativos', valor: inativos, bg: 'rgba(239,68,68,.2)', cor: '#fca5a5' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '8px 14px', textAlign: 'center', minWidth: 64 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.cor, lineHeight: 1 }}>{s.valor}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Banner URL do portal */}
          <div style={{ marginTop: 18, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={15} color="#86efac" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.85)' }}>
                URL do Portal: <strong style={{ color: '#fff' }}>{PORTAL_URL}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { navigator.clipboard.writeText(PORTAL_URL); setCopiouPortal(true); setTimeout(() => setCopiouPortal(false), 2000) }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                <Copy size={12}/> {copiouPortal ? '✓ Copiado!' : 'Copiar link'}
              </button>
              <a href={PORTAL_URL} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(255,255,255,.9)', border: 'none', color: '#0d3f56', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>
                <ExternalLink size={12}/> Abrir Portal
              </a>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>

        {/* ── Card: Liberar Novo Acesso ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: 20, boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <UserCheck size={16} color="#16a34a" />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Liberar Novo Acesso</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>
                Colaborador <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '1px 6px', fontWeight: 700, marginLeft: 4 }}>somente CLT</span>
              </label>
              <SearchableSelect
                options={colabsDisp.map(c => ({ value: c.id, label: c.nome, sublabel: c.cpf ? fmtCPF(c.cpf) : '—' }))}
                value={novoColabId}
                onChange={id => {
                  setNovoColabId(id)
                  const c = colabsDisp.find(x => x.id === id)
                  if (c?.cpf) setNovoCpf(c.cpf.replace(/\D/g,''))
                }}
                placeholder="Pesquisar colaborador CLT…"
                emptyLabel="— Nenhum —"
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>CPF (login)</label>
              <input
                type="text" value={novoCpf}
                onChange={e => setNovoCpf(e.target.value.replace(/\D/g,'').slice(0,11))}
                placeholder="somente números" maxLength={11}
                style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button
              onClick={criarAcesso} disabled={salvando}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 18px', borderRadius: 8, background: '#16a34a', color: '#fff', border: 'none', cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {salvando ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
              Liberar Acesso
            </button>
          </div>

          <p style={{ fontSize: 11, color: '#94a3b8', margin: '10px 0 0' }}>
            💡 A senha inicial é <strong>123</strong>. No primeiro acesso, o sistema exigirá que o colaborador crie uma nova senha.
          </p>
        </div>

        {/* ── Card: Lista de Acessos ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Key size={16} color="#f59e0b" />
              <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Acessos Cadastrados</span>
              <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{acessos.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF…"
                  style={{ paddingLeft: 30, paddingRight: 10, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, background: '#f8fafc', width: 220, outline: 'none' }} />
              </div>
              <button onClick={() => { fetchAcessos(); fetchColabs() }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                <RefreshCw size={13}/> Atualizar
              </button>
            </div>
          </div>

          {/* Tabela */}
          {loadingAcessos ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#94a3b8' }}>
              <Loader2 size={24} className="animate-spin" style={{ marginRight: 8 }} /> Carregando acessos…
            </div>
          ) : filtrados.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '52px 20px', gap: 10, color: '#94a3b8' }}>
              <Key size={36} strokeWidth={1} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>
                {busca ? `Nenhum resultado para "${busca}"` : 'Nenhum acesso cadastrado'}
              </div>
              <div style={{ fontSize: 13 }}>
                {!busca && 'Libere o acesso de colaboradores usando o formulário acima.'}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                    {['Colaborador','CPF (login)','Senha','Status','Último Acesso','Ações'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((ac, i) => (
                    <tr key={ac.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      {/* Colaborador */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{ac.colaborador_nome}</div>
                        <div style={{ fontSize: 11, marginTop: 2 }}>
                          {ac.colaborador_status === 'ativo'
                            ? <span style={{ color: '#16a34a' }}>● Ativo</span>
                            : <span style={{ color: '#dc2626' }}>● {ac.colaborador_status}</span>}
                        </div>
                      </td>
                      {/* CPF */}
                      <td style={{ padding: '12px 16px' }}>
                        <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 5, fontSize: 12, letterSpacing: '.04em', color: '#374151' }}>
                          {fmtCPF(ac.cpf)}
                        </code>
                      </td>
                      {/* Senha */}
                      <td style={{ padding: '12px 16px' }}>
                        {ac.must_change_password
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: '#fef3c7', color: '#b45309', padding: '3px 9px', borderRadius: 10, fontWeight: 600 }}>
                              <Lock size={10}/> Trocar senha
                            </span>
                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: '#dcfce7', color: '#16a34a', padding: '3px 9px', borderRadius: 10, fontWeight: 600 }}>
                              <Unlock size={10}/> OK
                            </span>}
                      </td>
                      {/* Status toggle */}
                      <td style={{ padding: '12px 16px' }}>
                        <Switch checked={ac.ativo} onCheckedChange={() => toggleAtivo(ac.id, ac.ativo)} />
                      </td>
                      {/* Último acesso */}
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtData(ac.ultimo_acesso)}
                      </td>
                      {/* Ações */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => copiarCredenciais(ac)} title="Copiar credenciais"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#0d3f56' }}>
                            <Copy size={11}/> Credenciais
                          </button>
                          <button
                            onClick={() => resetarSenha(ac.id, ac.colaborador_nome ?? '')}
                            disabled={resetandoId === ac.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #fde68a', background: '#fefce8', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#b45309' }}>
                            {resetandoId === ac.id ? <Loader2 size={11} className="animate-spin"/> : <RefreshCw size={11}/>}
                            Reset senha
                          </button>
                          <button onClick={() => excluirAcesso(ac.id, ac.colaborador_nome ?? '')}
                            style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', borderRadius: 7, border: '1px solid #fee2e2', background: '#fff1f2', cursor: 'pointer', color: '#dc2626' }}>
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Nota informativa */}
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '16px 0 0', textAlign: 'center' }}>
          🔐 Senha padrão: <strong>123</strong> — o colaborador deverá criar uma senha pessoal no primeiro acesso.
          Use "Reset senha" para devolver ao padrão caso o colaborador perca o acesso.
        </p>
      </div>
    </div>
  )
}
