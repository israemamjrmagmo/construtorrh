import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Executa `fn` sempre que:
 * 1. O pathname mudar (navegação entre rotas)
 * 2. A aba/janela voltar ao foco (visibilitychange)
 * 3. A cada `intervalMs` milissegundos (polling automático)
 *
 * Use em componentes de página para manter dados sempre atualizados.
 *
 * @param fn        Função a executar (ex: () => carregarDados())
 * @param intervalMs Intervalo de polling em ms (padrão: 60.000 = 1 min; 0 desativa)
 */
export function useRefreshOnFocus(fn: () => void, intervalMs = 60_000) {
  const location = useLocation()
  const fnRef = useRef(fn)
  fnRef.current = fn

  // Atualiza ao mudar de rota (pathname)
  useEffect(() => {
    fnRef.current()
  }, [location.pathname])

  // Atualiza ao focar a aba do navegador
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') fnRef.current()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Polling automático
  useEffect(() => {
    if (!intervalMs) return
    const id = setInterval(() => {
      // Só refresca se a aba estiver visível (evita trabalho em background)
      if (document.visibilityState === 'visible') fnRef.current()
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}
