/**
 * EmpresaTrocarSenha.tsx — Tela forçada no primeiro acesso
 * Exige que o usuário troque a senha padrão (primeiros 5 dígitos do CNPJ)
 * Após trocar: primeiro_acesso = false, redireciona para /
 */
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseV2 } from '@/lib/supabase-v2'
import { ShieldCheck, Eye, EyeOff, Loader2, KeyRound, CheckCircle2 } from 'lucide-react'
import { getEmpresaUsuarioSession, setEmpresaUsuarioSession, empresaUsuarioLogout } from './EmpresaLogin'

async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function Req({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: ok ? '#16a34a' : '#94a3b8' }}>
      <CheckCircle2 size={13} style={{ color: ok ? '#16a34a' : '#cbd5e1' }} />
      {text}
    </div>
  )
}

export default function EmpresaTrocarSenha() {
  const nav     = useNavigate()
  const session = getEmpresaUsuarioSession()
  const [nova,     setNova]     = useState('')
  const [confirma, setConfirma] = useState('')
  const [showNova,     setShowNova]     = useState(false)
  const [showConfirma, setShowConfirma] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [erro,     setErro]     = useState('')

  // Se não tem sessão → volta para login
  if (!session) {
    nav('/empresa-login')
    return null
  }

  const temMin8   = nova.length >= 8
  const temLetra  = /[a-zA-Z]/.test(nova)
  const temNumero = /[0-9]/.test(nova)
  const coincide  = nova === confirma && nova.length > 0

  async function handleTrocar(e: React.FormEvent) {
    e.preventDefault()
    if (!temMin8 || !temLetra || !temNumero) { setErro('A senha não atende aos requisitos mínimos'); return }
    if (!coincide) { setErro('As senhas não coincidem'); return }

    setLoading(true); setErro('')

    const hash = await sha256(nova)

    const { error } = await supabaseV2
      .from('empresa_usuarios')
      .update({ senha_hash: hash, primeiro_acesso: false })
      .eq('id', session.id)

    setLoading(false)

    if (error) { setErro('Erro ao salvar: ' + error.message); return }

    // Atualiza sessão
    setEmpresaUsuarioSession({ ...session, primeiro_acesso: false })
    nav('/')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 440, padding: '0 20px' }}>

        {/* Ícone */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 68, height: 68, borderRadius: 20,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(245,158,11,0.4)',
          }}>
            <ShieldCheck size={34} color="white" />
          </div>
          <h1 style={{ color: 'white', fontSize: 22, fontWeight: 700, marginTop: 14, marginBottom: 4 }}>
            Crie sua nova senha
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>
            Olá, <strong style={{ color: '#e2e8f0' }}>{session.nome}</strong>! <br />
            Este é seu primeiro acesso. Defina uma senha pessoal para continuar.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'white', borderRadius: 20, padding: 32,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>

          {/* Banner informativo */}
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
            padding: '10px 14px', marginBottom: 24,
            fontSize: 12, color: '#92400e',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <KeyRound size={14} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>
              Sua senha padrão foram os <strong>5 primeiros dígitos do CNPJ</strong> da empresa.
              Agora crie uma senha pessoal e segura.
            </span>
          </div>

          <form onSubmit={handleTrocar}>

            {/* Nova senha */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Nova Senha
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNova ? 'text' : 'password'}
                  value={nova}
                  onChange={e => setNova(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  style={{
                    width: '100%', height: 48, border: '2px solid #e5e7eb', borderRadius: 12,
                    padding: '0 48px 0 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                    borderColor: nova.length > 0 ? (temMin8 && temLetra && temNumero ? '#22c55e' : '#f87171') : '#e5e7eb',
                  }}
                />
                <button type="button" onClick={() => setShowNova(s => !s)} style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0,
                }}>
                  {showNova ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Requisitos */}
            <div style={{
              background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 16,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <Req ok={temMin8}   text="Mínimo 8 caracteres" />
              <Req ok={temLetra}  text="Pelo menos 1 letra" />
              <Req ok={temNumero} text="Pelo menos 1 número" />
            </div>

            {/* Confirmar senha */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Confirmar Senha
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirma ? 'text' : 'password'}
                  value={confirma}
                  onChange={e => setConfirma(e.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                  style={{
                    width: '100%', height: 48, border: '2px solid #e5e7eb', borderRadius: 12,
                    padding: '0 48px 0 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                    borderColor: confirma.length > 0 ? (coincide ? '#22c55e' : '#f87171') : '#e5e7eb',
                  }}
                />
                <button type="button" onClick={() => setShowConfirma(s => !s)} style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0,
                }}>
                  {showConfirma ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {erro && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626',
              }}>
                {erro}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading || !temMin8 || !temLetra || !temNumero || !coincide}
              style={{
                width: '100%', height: 50, borderRadius: 12, border: 'none',
                cursor: (loading || !temMin8 || !temLetra || !temNumero || !coincide) ? 'not-allowed' : 'pointer',
                background: (temMin8 && temLetra && temNumero && coincide && !loading)
                  ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                  : '#e5e7eb',
                color: (temMin8 && temLetra && temNumero && coincide) ? 'white' : '#9ca3af',
                fontSize: 15, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s',
                boxShadow: (temMin8 && temLetra && temNumero && coincide && !loading)
                  ? '0 4px 14px rgba(34,197,94,0.4)' : 'none',
              }}
            >
              {loading
                ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</>
                : <><ShieldCheck size={18} /> Definir Nova Senha</>}
            </button>
          </form>

          {/* Sair */}
          <button
            onClick={() => { empresaUsuarioLogout(); nav('/empresa-login') }}
            style={{
              display: 'block', width: '100%', textAlign: 'center',
              marginTop: 16, fontSize: 12, color: '#94a3b8',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            Sair e voltar ao login
          </button>
        </div>
      </div>
    </div>
  )
}
