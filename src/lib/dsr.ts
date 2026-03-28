/**
 * Cálculo do DSR com regra de perda por falta semanal.
 *
 * NOVA REGRA (atualizada):
 *   - Feriados e sábados são DIAS NORMAIS — não entram mais como candidatos a DSR.
 *   - O DSR é calculado apenas sobre os DOMINGOS do período.
 *   - Se o funcionário tiver QUALQUER falta (injustificada) em uma semana
 *     (Segunda a Sábado), perde o direito ao DSR daquele domingo.
 *   - Feriados: tratados separadamente por calcFeriados() em Ponto.tsx.
 *
 * Fórmula:
 *   DSR = (valorHoras / diasUteisComputados) × domingosSemFalta
 */

function expandRange(inicio: string, fim: string): string[] {
  const dias: string[] = []
  const d = new Date(inicio + 'T12:00:00')
  const end = new Date(fim + 'T12:00:00')
  while (d <= end) {
    dias.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dias
}

export interface DSRResult {
  dsr: number          // valor total do DSR a pagar
  diasUteis: number    // Seg–Sab no período (feriados não excluídos)
  domingosPagos: number
  domingosPerdidos: number
}

/**
 * @param valorHoras   total de horas trabalhadas × valor/hora (sem DSR)
 * @param inicio       data início do período "YYYY-MM-DD"
 * @param fim          data fim do período "YYYY-MM-DD"
 * @param datasComFalta Set de datas (YYYY-MM-DD) onde houve falta
 * @param _feriadosSet  ignorado — feriados não são mais candidatos a DSR
 */
export function calcDSRComFaltas(
  valorHoras: number,
  inicio: string,
  fim: string,
  datasComFalta: Set<string>,
  _feriadosSet?: Set<string>   // mantido na assinatura para compatibilidade
): DSRResult {
  const todas = expandRange(inicio, fim)

  // Dias úteis Seg–Sab (feriados INCLUÍDOS — são dias normais)
  const diasUteis = todas.filter(d => {
    const dow = new Date(d + 'T12:00:00').getDay()
    return dow >= 1 && dow <= 6   // Seg-Sab
  }).length

  // Candidatos a DSR: apenas Domingos (feriados não entram mais)
  const domingos = todas.filter(d => new Date(d + 'T12:00:00').getDay() === 0)

  let domingosPagos = 0
  let domingosPerdidos = 0

  for (const cand of domingos) {
    const candDate = new Date(cand + 'T12:00:00')

    // Semana do domingo: Seg a Sab anteriores (dom - 6 dias até dom - 1)
    const seg = new Date(candDate)
    seg.setDate(candDate.getDate() - 6)
    const sab = new Date(seg)
    sab.setDate(seg.getDate() + 5)

    // Verificar se algum dia Seg–Sab tem falta
    let temFalta = false
    const iter = new Date(seg)
    while (iter <= sab) {
      if (datasComFalta.has(iter.toISOString().slice(0, 10))) {
        temFalta = true
        break
      }
      iter.setDate(iter.getDate() + 1)
    }

    if (temFalta) domingosPerdidos++
    else domingosPagos++
  }

  const dsr = diasUteis > 0 && domingosPagos > 0
    ? (valorHoras / diasUteis) * domingosPagos
    : 0

  return { dsr, diasUteis, domingosPagos, domingosPerdidos }
}
