/**
 * EmpresaLogin.tsx — Login para usuários cadastrados pelo SaaS Admin
 * Autentica via tabela empresa_usuarios (email + senha_hash sha256)
 * Se primeiro_acesso = true → redireciona para /empresa-trocar-senha
 */
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseV2 } from '@/lib/supabase-v2'
import { Building2, Eye, EyeOff, Loader2, Lock } from 'lucide-react'

async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const SESSION_KEY = 'empresa_usuario_session'

export function setEmpresaUsuarioSession(data: {
  id: string; nome: string; email: string; role: string; empresa_id: string; primeiro_acesso: boolean
}) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, ts: Date.now() }))
}

export function getEmpresaUsuarioSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (Date.now() - s.ts > 8 * 60 * 60 * 1000) { localStorage.removeItem(SESSION_KEY); return null }
    return s
  } catch { return null }
}

export function empresaUsuarioLogout() {
  localStorage.removeItem(SESSION_KEY)
}

export default function EmpresaLogin() {
  const nav = useNavigate()
  const [email, setEmail]         = useState('')
  const [senha, setSenha]         = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [erro, setErro]           = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !senha.trim()) { setErro('Preencha e-mail e senha'); return }
    setLoading(true); setErro('')

    const hash = await sha256(senha.trim())

    const { data, error } = await supabaseV2
      .from('empresa_usuarios')
      .select('id, nome, email, role, empresa_id, ativo, senha_hash, primeiro_acesso')
      .eq('email', email.trim().toLowerCase())
      .eq('ativo', true)
      .single()

    setLoading(false)

    if (error || !data) { setErro('E-mail inválido ou acesso inativo'); return }
    if (data.senha_hash !== hash) { setErro('Senha incorreta'); return }

    setEmpresaUsuarioSession({
      id:             data.id,
      nome:           data.nome,
      email:          data.email,
      role:           data.role,
      empresa_id:     data.empresa_id,
      primeiro_acesso: data.primeiro_acesso ?? false,
    })

    if (data.primeiro_acesso) {
      nav('/empresa-trocar-senha')
    } else {
      nav('/')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, padding: '0 20px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(59,130,246,0.4)',
          }}>
            <Building2 size={32} color="white" />
          </div>
          <h1 style={{ color: 'white', fontSize: 24, fontWeight: 700, marginTop: 16, marginBottom: 4 }}>
            ConstrutorRH
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>Acesso da Empresa</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'white', borderRadius: 20, padding: 32,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
            Entrar
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
            Use o e-mail e a senha fornecidos pelo administrador
          </p>

          <form onSubmit={handleLogin}>
            {/* E-mail */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                style={{
                  width: '100%', height: 48, border: '2px solid #e5e7eb', borderRadius: 12,
                  padding: '0 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>

            {/* Senha */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Senha
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: '100%', height: 48, border: '2px solid #e5e7eb', borderRadius: 12,
                    padding: '0 48px 0 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <button type="button" onClick={() => setShowSenha(s => !s)} style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0,
                }}>
                  {showSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {erro && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                padding: '10px 14px', marginBottom: 16,
                fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Lock size={14} /> {erro}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', height: 50, borderRadius: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#93c5fd' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: 'white', fontSize: 15, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : '0 4px 14px rgba(59,130,246,0.4)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Verificando...</> : 'Entrar'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 20 }}>
          Administrador SaaS?{' '}
          <a href="#/saas-login" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
            Acesse aqui
          </a>
        </p>
      </div>
    </div>
  )
}
