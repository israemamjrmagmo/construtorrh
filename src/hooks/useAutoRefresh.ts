import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Hook de auto-refresh global via React Query.
 *
 * Invalida TODAS as queries ativas em intervalos regulares,
 * mantendo o app sempre com dados frescos sem recarregar a página.
 *
 * Comportamento:
 * - Só age quando a aba está visível (document.visibilityState === 'visible')
 * - Reseta o contador ao voltar ao foco (evita refresh duplo imediato)
 * - Exibe o tempo até o próximo refresh (útil para debug / indicador visual)
 *
 * @param intervalMs  Intervalo entre refreshes em ms (padrão: 120.000 = 2 min)
 */
export function useAutoRefresh(intervalMs = 120_000) {
  const queryClient = useQueryClient()
  const [countdown, setCountdown] = useState(intervalMs / 1000)
  const nextRefreshRef = useRef(Date.now() + intervalMs)

  useEffect(() => {
    function doRefresh() {
      if (document.visibilityState !== 'visible') return
      queryClient.invalidateQueries()
      nextRefreshRef.current = Date.now() + intervalMs
      setCountdown(intervalMs / 1000)
    }

    // Polling principal
    const refreshId = setInterval(doRefresh, intervalMs)

    // Ao voltar ao foco: refresh imediato se passou mais de 30s da última vez
    let lastHiddenAt = 0
    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now()
      } else {
        const away = Date.now() - lastHiddenAt
        if (away > 30_000) doRefresh()
        else {
          // Apenas reinicia o countdown
          nextRefreshRef.current = Date.now() + intervalMs
          setCountdown(intervalMs / 1000)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Countdown visual (atualiza a cada segundo)
    const countId = setInterval(() => {
      const remaining = Math.max(0, Math.round((nextRefreshRef.current - Date.now()) / 1000))
      setCountdown(remaining)
    }, 1000)

    return () => {
      clearInterval(refreshId)
      clearInterval(countId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [intervalMs, queryClient])

  return { countdown }
}
