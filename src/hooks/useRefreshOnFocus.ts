import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Executa `fn` quando:
 * 1. O pathname mudar (navegação entre rotas)
 * 2. A aba/janela voltar ao foco (visibilitychange)
 *
 * NOTA: Polling automático DESABILITADO para evitar perda de dados durante
 * lançamentos em andamento. A atualização agora só ocorre ao trocar de tela
 * ou ao refocar a aba do navegador.
 *
 * @param fn        Função a executar (ex: () => carregarDados())
 * @param intervalMs Parâmetro mantido por compatibilidade, mas ignorado (polling desabilitado)
 */
export function useRefreshOnFocus(fn: () => void, _intervalMs = 0) {
  const location = useLocation()
  const fnRef = useRef(fn)
  fnRef.current = fn

  // Atualiza ao mudar de rota (pathname)
  useEffect(() => {
    fnRef.current()
  }, [location.pathname])

  // Atualiza ao focar a aba do navegador (volta de outra aba)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') fnRef.current()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Polling automático REMOVIDO — causava perda de dados em lançamentos em andamento.
  // Para reativar futuramente: passar intervalMs > 0 e usar setInterval aqui.
}
