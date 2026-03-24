/**
 * Cálculo do DSR com regra de perda por falta semanal.
 *
 * Regra (CLT Art. 6º, Lei 605/1949):
 *   Se o funcionário tiver QUALQUER falta (injustificada) em uma semana
 *   (Segunda a Sábado), perde o direito ao DSR daquela semana (Domingo).
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
  diasUteis: number    // Seg–Sex no período
  domingosPagos: number
  domingosPerdidos: number
}

/**
 * @param valorHoras   total de horas trabalhadas × valor/hora (sem DSR)
 * @param inicio       data início do período "YYYY-MM-DD"
 * @param fim          data fim do período "YYYY-MM-DD"
 * @param datasComFalta Set de datas (YYYY-MM-DD) onde houve falta
 * @param feriadosSet  feriados opcionais (contam como DSR extra)
 */
export function calcDSRComFaltas(
  valorHoras: number,
  inicio: string,
  fim: string,
  datasComFalta: Set<string>,
  feriadosSet?: Set<string>
): DSRResult {
  const todas = expandRange(inicio, fim)

  // Dias úteis Seg-Sex (excluindo feriados)
  const diasUteis = todas.filter(d => {
    const dow = new Date(d + 'T12:00:00').getDay()
    if (dow < 1 || dow > 5) return false
    if (feriadosSet?.has(d)) return false
    return true
  }).length

  // Domingos e feriados em dia útil do período
  const domingos = todas.filter(d => new Date(d + 'T12:00:00').getDay() === 0)
  const feriadosUteis = feriadosSet
    ? todas.filter(d => {
        if (!feriadosSet.has(d)) return false
        const dow = new Date(d + 'T12:00:00').getDay()
        return dow >= 1 && dow <= 5
      })
    : []

  const candidatos = [...domingos, ...feriadosUteis]

  let domingosPagos = 0
  let domingosPerdidos = 0

  for (const cand of candidatos) {
    const candDate = new Date(cand + 'T12:00:00')
    const dow = candDate.getDay()

    // Semana do candidato: Segunda (dow-6 para dom, dow-dow+1 para feriado) até Sábado
    let seg: Date
    if (dow === 0) {
      // Domingo → semana = Seg a Sab anteriores (dom - 6 dias até dom - 1)
      seg = new Date(candDate)
      seg.setDate(candDate.getDate() - 6)
    } else {
      // Feriado em dia útil → semana = Seg a Sab da mesma semana
      seg = new Date(candDate)
      seg.setDate(candDate.getDate() - (dow - 1))
    }
    const sab = new Date(seg)
    sab.setDate(seg.getDate() + 5) // Sábado = Seg + 5

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
