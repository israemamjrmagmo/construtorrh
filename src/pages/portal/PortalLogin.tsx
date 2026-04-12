import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPortalSession } from '@/hooks/usePortalAuth'
import { HardHat, Eye, EyeOff, Loader2, Key, Lock } from 'lucide-react'

async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function PortalLogin() {
  const nav = useNavigate()

  const [loading, setLoading]   = useState(false)
  const [erro, setErro]         = useState('')
  const [login, setLogin]       = useState('')
  const [senha, setSenha]       = useState('')
  const [showSenha, setShowSenha] = useState(false)

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 48, border: '2px solid #e5e7eb', borderRadius: 10,
    padding: '0 14px', fontSize: 15, boxSizing: 'border-box',
    outline: 'none', background: '#f9fafb', transition: 'border-color 0.2s',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: '#374151', display: 'block',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!login.trim() || !senha.trim()) { setErro('Preencha login e senha'); return }
    setLoading(true); setErro('')

    const hash = await sha256(senha.trim())

    // Tentar login com campo login, depois com CPF/chapa
    const loginVal = login.trim()
    const loginLower = loginVal.toLowerCase()
    const cpfLimpo = loginVal.replace(/\D/g, '')

    let { data, error } = await supabase
      .from('portal_usuarios')
      .select('id, login, nome, obras_ids, ativo, senha_hash')
      .eq('login', loginLower)
      .eq('ativo', true)
      .maybeSingle()

    // fallback: buscar por cpf se o campo existir
    if (!data && cpfLimpo.length >= 8) {
      const { data: d2 } = await supabase
        .from('portal_usuarios')
        .select('id, login, nome, obras_ids, ativo, senha_hash')
        .ilike('login', cpfLimpo)
        .eq('ativo', true)
        .maybeSingle()
      if (d2) data = d2
    }

    setLoading(false)

    if (!data) { setErro('Login inválido ou usuário inativo'); return }
    if (data.senha_hash !== hash) { setErro('Senha incorreta'); return }

    const obrasIds: string[] = data.obras_ids ?? []
    let obraNome: string | null = null

    if (obrasIds.length === 0) {
      // obras_ids vazio = acesso a TODAS as obras do sistema
      const { data: todasObras } = await supabase
        .from('obras')
        .select('id, nome')
        .order('nome')
      const ids = (todasObras ?? []).map((o: any) => o.id)
      obraNome = todasObras?.[0]?.nome ?? null
      setPortalSession({ id: data.id, login: data.login, nome: data.nome, obras_ids: ids, obra_nome: obraNome })
    } else {
      const { data: obraData } = await supabase
        .from('obras').select('nome').eq('id', obrasIds[0]).single()
      obraNome = obraData?.nome ?? null
      setPortalSession({ id: data.id, login: data.login, nome: data.nome, obras_ids: obrasIds, obra_nome: obraNome })
    }

    nav('/portal/home')
  }

  return (
    <div style={{
      minHeight: '100dvh', background: 'linear-gradient(135deg, #1e3a5f 0%, #2d6a4f 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: 'sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d6a4f)', padding: '32px 24px 28px', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, background: 'rgba(255,255,255,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <HardHat size={30} color="#fff" />
          </div>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: '-0.5px' }}>Portal da Obra</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4 }}>ConstrutorRH · Acesso Restrito</div>
        </div>

        {/* Info */}
        <div style={{ padding: '14px 24px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock size={13} color="#6b7280" />
          <span style={{ fontSize: 11, color: '#6b7280' }}>Acesso exclusivo por login e senha liberados pelo master</span>
        </div>

        {/* Erro */}
        {erro && (
          <div style={{ margin: '14px 24px 0', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#dc2626', fontWeight:600, textAlign:'center' }}>
            {erro}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} style={{ padding: '20px 24px 28px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Login</label>
            <input
              type="text" value={login} onChange={e => setLogin(e.target.value)}
              autoComplete="username" autoCapitalize="none" autoFocus
              placeholder="Seu ID de acesso"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
              onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showSenha ? 'text' : 'password'}
                value={senha} onChange={e => setSenha(e.target.value)}
                autoComplete="current-password" placeholder="Sua senha"
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
                onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
              />
              <button type="button" onClick={() => setShowSenha(s => !s)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                {showSenha ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading}
            style={{ width:'100%', height:52, background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1e3a5f, #2d6a4f)', color:'#fff', border:'none', borderRadius:12, fontSize:16, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, letterSpacing:'.01em' }}>
            {loading ? <><Loader2 size={18} className="animate-spin"/>Verificando…</> : 'Entrar no Portal'}
          </button>
        </form>

        <p style={{ textAlign:'center', fontSize:11, color:'#9ca3af', padding:'0 24px 20px', margin:0 }}>
          Acesso fornecido pelo RH · ConstrutorRH
        </p>
      </div>
    </div>
  )
}
