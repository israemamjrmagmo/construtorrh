import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { useFolhaMensal, LinhaEncargo, FolhaMensalResult } from '@/hooks/useFolhaMensal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FolhaContextValue {
  mes:    number
  ano:    number
  setMes: (m: number) => void
  setAno: (a: number) => void
  folha:  FolhaMensalResult
  // helpers de filtro
  linhasPorObra:         (obraId: string)        => LinhaEncargo[]
  linhasPorFuncao:       (funcaoId: string)       => LinhaEncargo[]
  linhasPorColaborador:  (colaboradorId: string)  => LinhaEncargo[]
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const FolhaContext = createContext<FolhaContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FolhaProvider({ children }: { children: React.ReactNode }) {
  const hoje = new Date()
  const [mes, setMes] = useState<number>(hoje.getMonth() + 1)
  const [ano, setAno] = useState<number>(hoje.getFullYear())

  const folha = useFolhaMensal(mes, ano)

  // ── Helpers de filtro memoizados ────────────────────────────────────────────
  const linhasPorObra = useCallback(
    (obraId: string): LinhaEncargo[] =>
      folha.linhas.filter(l => l.obra_id === obraId),
    [folha.linhas]
  )

  const linhasPorFuncao = useCallback(
    (funcaoId: string): LinhaEncargo[] =>
      folha.linhas.filter(l => l.funcao_id === funcaoId),
    [folha.linhas]
  )

  const linhasPorColaborador = useCallback(
    (colaboradorId: string): LinhaEncargo[] =>
      folha.linhas.filter(l => l.colaborador_id === colaboradorId),
    [folha.linhas]
  )

  const value = useMemo<FolhaContextValue>(
    () => ({
      mes,
      ano,
      setMes,
      setAno,
      folha,
      linhasPorObra,
      linhasPorFuncao,
      linhasPorColaborador,
    }),
    [mes, ano, folha, linhasPorObra, linhasPorFuncao, linhasPorColaborador]
  )

  return (
    <FolhaContext.Provider value={value}>
      {children}
    </FolhaContext.Provider>
  )
}

// ─── Hook de consumo ──────────────────────────────────────────────────────────

export function useFolhaContext(): FolhaContextValue {
  const ctx = useContext(FolhaContext)
  if (!ctx) {
    throw new Error('useFolhaContext deve ser usado dentro de <FolhaProvider>')
  }
  return ctx
}

// Re-exporta os tipos para conveniência dos consumidores
export type { LinhaEncargo, FolhaMensalResult }
export { FolhaContext }
