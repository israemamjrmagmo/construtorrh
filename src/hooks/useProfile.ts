import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ─── Roles disponíveis ────────────────────────────────────────────────────────
export type Role = 'admin' | 'master_empresa' | 'rh' | 'gestor' | 'financeiro' | 'almoxarifado' | 'colaborador' | 'obra' | 'visualizador'

export interface Profile {
  id: string
  nome: string
  email: string
  role: Role
  ativo: boolean
}

// ─── Mapa de permissões por role ──────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<Role, {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canViewFinanceiro: boolean
  label: string
  color: string
  bg: string
}> = {
  admin: {
    canCreate: true, canEdit: true, canDelete: true, canViewFinanceiro: true,
    label: 'Administrador', color: '#7c3aed', bg: '#f5f3ff',
  },
  master_empresa: {
    canCreate: true, canEdit: true, canDelete: true, canViewFinanceiro: true,
    label: 'Master', color: '#7c3aed', bg: '#f5f3ff',
  },
  financeiro: {
    canCreate: true, canEdit: true, canDelete: false, canViewFinanceiro: true,
    label: 'Financeiro', color: '#0369a1', bg: '#e0f2fe',
  },
  almoxarifado: {
    canCreate: true, canEdit: true, canDelete: false, canViewFinanceiro: false,
    label: 'Almoxarifado', color: '#b45309', bg: '#fef3c7',
  },
  colaborador: {
    canCreate: false, canEdit: false, canDelete: false, canViewFinanceiro: false,
    label: 'Colaborador', color: '#16a34a', bg: '#dcfce7',
  },
  rh: {
    canCreate: true, canEdit: true, canDelete: false, canViewFinanceiro: true,
    label: 'RH', color: '#0369a1', bg: '#e0f2fe',
  },
  gestor: {
    canCreate: true, canEdit: true, canDelete: false, canViewFinanceiro: true,
    label: 'Gestor', color: '#16a34a', bg: '#dcfce7',
  },
  obra: {
    canCreate: true, canEdit: false, canDelete: false, canViewFinanceiro: false,
    label: 'Obra', color: '#b45309', bg: '#fef3c7',
  },
  visualizador: {
    canCreate: false, canEdit: false, canDelete: false, canViewFinanceiro: false,
    label: 'Visualizador', color: '#4b5563', bg: '#f3f4f6',
  },
}

export const ROLE_DESCRIPTIONS: Record<Role, string[]> = {
  admin:       ['Acesso total', 'Criar / Editar / Excluir', 'Financeiro visível', 'Gerenciar usuários'],
  master_empresa: ['Controle total da empresa', 'Criar / Editar / Excluir', 'Financeiro visível', 'Gerenciar usuários'],
  financeiro:  ['Pagamentos e conferências', 'Financeiro visível', 'Criar e editar', 'Não pode excluir'],
  almoxarifado:['EPIs e estoque', 'Criar e editar', 'Sem financeiro', 'Não pode excluir'],
  colaborador: ['Portal do colaborador', 'Ver próprias informações', 'Sem financeiro', 'Sem criação/edição'],
  rh:          ['Criar e editar registros', 'Visualizar tudo', 'Financeiro visível', 'Não pode excluir'],
  gestor:      ['Aprovar/reprovar lançamentos', 'Criar e editar registros', 'Financeiro visível', 'Pode excluir documentos'],
  obra:        ['Registrar ocorrências', 'Visualizar própria obra', 'Sem acesso financeiro', 'Não pode editar/excluir'],
  visualizador:['Apenas visualização', 'Sem criação/edição', 'Sem financeiro', 'Sem exclusão'],
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [isSaasAdmin, setIsSaasAdmin] = useState(false)

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return }

    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(async ({ data, error }) => {
        if (error || !data) {
          // Sem perfil em 'profiles' → checar empresa_usuario_session (usuários de empresa)
          try {
            const raw = localStorage.getItem('empresa_usuario_session')
            if (raw) {
              const eu = JSON.parse(raw)
              const euRole = (eu?.role ?? 'admin') as Role
              setProfile({
                id: user.id,
                nome: eu?.nome ?? user.email ?? 'Usuário',
                email: eu?.email ?? user.email ?? '',
                role: euRole,
                ativo: true,
              })
            } else {
              setProfile({ id: user.id, nome: user.email ?? 'Usuário', email: user.email ?? '', role: 'admin', ativo: true })
            }
          } catch {
            setProfile({ id: user.id, nome: user.email ?? 'Usuário', email: user.email ?? '', role: 'admin', ativo: true })
          }
        } else {
          setProfile(data as Profile)
        }

        // Verificar se é SaaS Admin
        if (user) {
          const { data: saasData } = await supabase
            .from('saas_admins')
            .select('id')
            .eq('email', user.email ?? '')
            .eq('ativo', true)
            .maybeSingle()
          setIsSaasAdmin(!!saasData)
        }

        setLoading(false)
      })
  }, [user])

  const permissions = profile ? (ROLE_PERMISSIONS[profile.role] ?? ROLE_PERMISSIONS['admin']) : {
    canCreate: false, canEdit: false, canDelete: false, canViewFinanceiro: false,
    label: '', color: '', bg: '',
  }

  const isAdmin = profile?.role === 'admin'

  return { profile, loading, permissions, isAdmin, isSaasAdmin }
}
