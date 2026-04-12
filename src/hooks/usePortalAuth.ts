// Hook de autenticação do Portal Externo
// Sessão armazenada em localStorage, sem usar Supabase Auth

export interface PortalUser {
  id: string
  login: string
  nome: string | null
  obras_ids: string[]
  obra_nome?: string | null  // nome da primeira/principal obra para exibição no header
}

const KEY = 'portal_session'

export function getPortalSession(): PortalUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as PortalUser
  } catch {
    return null
  }
}

export function setPortalSession(u: PortalUser) {
  localStorage.setItem(KEY, JSON.stringify(u))
}

export function clearPortalSession() {
  localStorage.removeItem(KEY)
}

/**
 * Re-valida a sessão contra o banco:
 * - Se o usuário foi desativado → limpa sessão e retorna null
 * - Se obras_ids foi alterado no admin → atualiza a sessão com os IDs mais recentes
 * - Se obras_ids=[] → expande para todas as obras do sistema
 */
export async function refreshPortalSession(supabase: any): Promise<PortalUser | null> {
  const current = getPortalSession()
  if (!current) return null

  try {
    const { data } = await supabase
      .from('portal_usuarios')
      .select('id, login, nome, obras_ids, ativo')
      .eq('id', current.id)
      .eq('ativo', true)
      .maybeSingle()

    if (!data) {
      // Usuário inativado ou removido
      clearPortalSession()
      return null
    }

    const novasObrasIds: string[] = data.obras_ids ?? []
    let obrasFinal: string[] = novasObrasIds

    if (novasObrasIds.length === 0) {
      // obras_ids vazio = acesso a todas as obras
      const { data: todasObras } = await supabase
        .from('obras').select('id').order('nome')
      obrasFinal = (todasObras ?? []).map((o: any) => o.id)
    }

    // Se os IDs mudaram, atualizar sessão
    const mudou = JSON.stringify(obrasFinal.sort()) !== JSON.stringify([...current.obras_ids].sort())
    if (mudou || data.nome !== current.nome) {
      let obraNome = current.obra_nome ?? null
      if (obrasFinal.length > 0) {
        const { data: obraData } = await supabase
          .from('obras').select('nome').eq('id', obrasFinal[0]).single()
        obraNome = obraData?.nome ?? null
      }
      const updated: PortalUser = {
        id: data.id, login: data.login, nome: data.nome,
        obras_ids: obrasFinal, obra_nome: obraNome,
      }
      setPortalSession(updated)
      return updated
    }

    return current
  } catch {
    return current // em caso de erro de rede, manter sessão atual
  }
}
