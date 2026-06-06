import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const EU_SESSION_KEY = 'empresa_usuario_session'

/**
 * Retorna o empresa_id do usuário logado:
 * 1. Primeiro tenta ler da sessão localStorage (empresa_usuario_session)
 * 2. Fallback: busca em empresa_usuarios pelo email do auth user
 */
export function useEmpresaId() {
  const { user } = useAuth()
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!user) {
      setEmpresaId(null)
      setLoading(false)
      return
    }

    // 1. Sessão localStorage (definida pelo Login.tsx após autenticar)
    try {
      const raw = localStorage.getItem(EU_SESSION_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s?.empresa_id && Date.now() - s.ts < 8 * 60 * 60 * 1000) {
          setEmpresaId(s.empresa_id)
          setLoading(false)
          return
        }
      }
    } catch { /* ignora parse error */ }

    // 2. Fallback: consulta empresa_usuarios pelo email
    supabase
      .from('empresa_usuarios')
      .select('empresa_id')
      .eq('email', (user.email ?? '').toLowerCase())
      .eq('ativo', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.empresa_id) {
          setEmpresaId(data.empresa_id)
        } else {
          setEmpresaId(null)
        }
        setLoading(false)
      })
  }, [user])

  return { empresaId, loading }
}
