import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff, Lock } from 'lucide-react'
import { toast } from 'sonner'

// PIN do SaaS Master — altere aqui se quiser mudar a senha
const SAAS_PIN = 'ConstrutorRH@2024'
const SAAS_TOKEN_KEY = 'saas_admin_token'

export default function SaasLogin() {
  const navigate = useNavigate()
  const [pin, setPin]         = useState('')
  const [show, setShow]       = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      if (pin === SAAS_PIN) {
        localStorage.setItem(SAAS_TOKEN_KEY, btoa(Date.now().toString()))
        toast.success('Acesso autorizado!')
        navigate('/saas-admin')
      } else {
        toast.error('PIN incorreto')
        setPin('')
      }
      setLoading(false)
    }, 600)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 24,
        padding: '48px 40px',
        width: '100%', maxWidth: 400,
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
          }}>
            <Shield size={32} color="white" />
          </div>
          <h1 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>
            ConstrutorRH
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 6 }}>
            Painel Administrativo SaaS
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
              PIN de Acesso
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type={show ? 'text' : 'password'}
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Digite o PIN do SaaS Admin"
                required
                style={{
                  width: '100%', padding: '12px 44px 12px 40px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10, color: 'white', fontSize: 14,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                }}
              >
                {show
                  ? <EyeOff size={16} color="#64748b" />
                  : <Eye size={16} color="#64748b" />
                }
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !pin}
            style={{
              width: '100%', padding: '13px',
              background: loading ? '#4338ca' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', borderRadius: 10, color: 'white',
              fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', opacity: (!pin || loading) ? 0.7 : 1,
            }}
          >
            {loading ? 'Verificando...' : 'Entrar no Painel SaaS'}
          </button>
        </form>

        <p style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
          Acesso restrito — somente administradores da plataforma
        </p>
      </div>
    </div>
  )
}
