import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { calcINSS, calcIR, fetchTabelasEncargos } from '@/lib/encargos'
import { traduzirErro } from '@/lib/erros'
import { getUltimoDia } from '@/lib/dateUtils'
import { toast } from 'sonner'

// ─── Tipos exportados ──────────────────────────────────────────────────────────

export interface LinhaEncargo {
  colaborador_id: string
  nome:           string
  chapa:          string | null
  funcao_nome:    string
  funcao_id:      string | null
  obra_nome:      string
  obra_id:        string | null
  tipo_contrato:  string
  // remuneração
  valorHoras:     number
  valorDSR:       number
  valorProducao:  number
  valorPremio:    number
  salarioBruto:   number
  // descontos do funcionário
  descontoVT:     number
  descontoAD:     number
  inss:           number
  ir:             number
  liquido:        number
  // encargos da empresa
  fgts:           number
  inssPatronal:   number
  rat:            number
  terceiros:      number
  totalEmpresa:   number
  // metadados
  mesRef:         string
  lancamento_id:  string
}

export interface FolhaMensalResult {
  linhas:                LinhaEncargo[]
  loading:               boolean
  erro:                  string | null
  calculado:             boolean
  refetch:               () => void
  // totalizadores
  totalBruto:            number
  totalLiquido:          number
  totalEncargosEmpresa:  number
  totalFolha:            number   // bruto + encargos empresa
  // alíquotas expostas para uso na UI
  fgtsAliq:              number
  inssPatronalAliq:      number
  ratAliq:               number
  terceirosAliq:         number
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function expandRange(inicio: string, fim: string): string[] {
  const dias: string[] = []
  const d   = new Date(inicio + 'T12:00:00')
  const end = new Date(fim    + 'T12:00:00')
  while (d <= end) {
    dias.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dias
}

function diasUteisPeriodo(inicio: string, fim: string, feriados: Set<string>): number {
  return expandRange(inicio, fim).filter(d => {
    const dow = new Date(d + 'T12:00:00').getDay()
    return dow >= 1 && dow <= 6 && !feriados.has(d)
  }).length
}

function domingosFeriadosPeriodo(inicio: string, fim: string, feriados: Set<string>): number {
  const dias = expandRange(inicio, fim)
  const domingos = dias.filter(d => new Date(d + 'T12:00:00').getDay() === 0).length
  const feriadosUteis = dias.filter(d => {
    if (!feriados.has(d)) return false
    const dow = new Date(d + 'T12:00:00').getDay()
    return dow >= 1 && dow <= 5
  }).length
  return domingos + feriadosUteis
}

// ─── Cache em módulo (persiste durante a sessão) ───────────────────────────────

interface CacheEntry {
  linhas:          LinhaEncargo[]
  fgtsAliq:        number
  inssPatronalAliq: number
  ratAliq:         number
  terceirosAliq:   number
}

// ─── Hook principal ────────────────────────────────────────────────────────────

export function useFolhaMensal(mes: number, ano: number): FolhaMensalResult {
  const [linhas,   setLinhas]   = useState<LinhaEncargo[]>([])
  const [loading,  setLoading]  = useState(false)
  const [erro,     setErro]     = useState<string | null>(null)
  const [calculado, setCalculado] = useState(false)

  // Alíquotas carregadas do banco — expostas para renderização (e.g. tooltips)
  const [fgtsAliq,         setFgtsAliq]         = useState(0.08)
  const [inssPatronalAliq, setInssPatronalAliq]  = useState(0.20)
  const [ratAliq,          setRatAliq]           = useState(0.035)
  const [terceirosAliq,    setTerceirosAliq]     = useState(0)
  const [heCoef50,         setHeCoef50]          = useState(1.6)
  const [heCoef100,        setHeCoef100]         = useState(2.0)

  // Flag para forçar re-fetch quando refetch() for chamado
  const [forceRefetch, setForceRefetch] = useState(0)

  // Cache por mesRef — evita re-fetch na mesma sessão
  const cacheRef = useRef<Record<string, CacheEntry>>({})

  // Carrega alíquotas e coeficientes configurados no banco (uma única vez)
  useEffect(() => {
    supabase.from('configuracoes').select('chave, valor')
      .in('chave', ['fgts_aliquota', 'inss_patronal_aliquota', 'rat_aliquota', 'terceiros_aliquota', 'he_percentual_60', 'he_percentual_100'])
      .then(({ data }) => {
        const m: Record<string, string> = {}
        ;(data ?? []).forEach((r: any) => { m[r.chave] = r.valor })
        if (m['fgts_aliquota'])          setFgtsAliq(parseFloat(m['fgts_aliquota']) / 100 || 0.08)
        if (m['inss_patronal_aliquota']) setInssPatronalAliq(parseFloat(m['inss_patronal_aliquota']) / 100 || 0.20)
        if (m['rat_aliquota'])           setRatAliq(parseFloat(m['rat_aliquota']) / 100 || 0.035)
        if (m['terceiros_aliquota'])      setTerceirosAliq(parseFloat(m['terceiros_aliquota']) / 100 || 0)
        if (m['he_percentual_60'])  setHeCoef50 (1 + (parseFloat(m['he_percentual_60'])  || 60)  / 100)
        if (m['he_percentual_100']) setHeCoef100(1 + (parseFloat(m['he_percentual_100']) || 100) / 100)
      })
  }, [])

  // ── Função principal de cálculo ────────────────────────────────────────────
  const calcular = useCallback(async () => {
    const mesRef    = `${ano}-${String(mes).padStart(2, '0')}`
    const mesRefIni = `${mesRef}-01`
    const mesRefFim = `${getUltimoDia(mesRef)}`

    // Verifica cache (a menos que forceRefetch tenha sido chamado — o cache foi limpo)
    if (cacheRef.current[mesRef]) {
      const cached = cacheRef.current[mesRef]
      setLinhas(cached.linhas)
      setFgtsAliq(cached.fgtsAliq)
      setInssPatronalAliq(cached.inssPatronalAliq)
      setRatAliq(cached.ratAliq)
      setTerceirosAliq(cached.terceirosAliq)
      setCalculado(true)
      return
    }

    setLoading(true)
    setErro(null)
    try {
      // 1. Todos os lançamentos do mês (qualquer status válido)
      const { data: lancsRaw, error: errL } = await supabase
        .from('ponto_lancamentos')
        .select(`
          id, colaborador_id, data_inicio, data_fim, mes_referencia, status,
          snap_valor_horas, snap_valor_dsr, snap_valor_producao, snap_valor_premio,
          snap_valor_total, snap_inss, snap_ir, snap_desconto_vt, snap_desconto_adiant,
          snap_liquido, snap_valor_hora,
          colaboradores(nome, chapa, tipo_contrato, funcao_id, funcoes(nome)),
          obras(id, nome)
        `)
        .in('status', ['aprovado', 'em_fechamento', 'liberado', 'pago'])
        .eq('mes_referencia', mesRef)

      if (errL) throw new Error(traduzirErro(errL?.message ?? String(errL)))
      if (!lancsRaw || lancsRaw.length === 0) {
        setLinhas([])
        setCalculado(true)
        return
      }

      // 2. Somente CLT — autônomos/PJ sem tipo_contrato definido são excluídos
      const lancsCLT = (lancsRaw as any[]).filter(
        l => l.colaboradores?.tipo_contrato === 'clt'
      )
      if (lancsCLT.length === 0) {
        setLinhas([])
        setCalculado(true)
        return
      }

      // ── Dados complementares para lançamentos SEM snap (em aberto) ──────────
      const semSnap = lancsCLT.filter(l => l.snap_valor_total == null)

      let pontosMap:    Record<string, { normais: number; extras: number }> = {}
      let valorHoraMap: Record<string, number> = {}
      let feriadosSet = new Set<string>()

      if (semSnap.length > 0) {
        const semSnapIds = semSnap.map((l: any) => l.id)
        const funcaoIds  = [...new Set(semSnap.map((l: any) => l.colaboradores?.funcao_id).filter(Boolean) as string[])]

        const [{ data: pontosRaw }, { data: fvRaw }, { data: feriadosRaw }] = await Promise.all([
          supabase.from('registro_ponto')
            .select('lancamento_id, horas_trabalhadas, horas_extras')
            .in('lancamento_id', semSnapIds),
          supabase.from('funcao_valores')
            .select('funcao_id, tipo_contrato, valor_hora')
            .in('funcao_id', funcaoIds),
          supabase.from('feriados')
            .select('data')
            .gte('data', mesRefIni)
            .lte('data', mesRefFim),
        ])

        ;(feriadosRaw ?? []).forEach((f: any) => feriadosSet.add(f.data))

        ;(pontosRaw ?? []).forEach((p: any) => {
          if (!pontosMap[p.lancamento_id]) pontosMap[p.lancamento_id] = { normais: 0, extras: 0 }
          pontosMap[p.lancamento_id].normais += p.horas_trabalhadas ?? 0
          pontosMap[p.lancamento_id].extras  += p.horas_extras      ?? 0
        })

        ;(fvRaw ?? []).forEach((fv: any) => {
          if (fv.tipo_contrato === 'clt' || !valorHoraMap[fv.funcao_id]) {
            valorHoraMap[fv.funcao_id] = fv.valor_hora ?? 0
          }
        })
      }

      // 3. Busca tabelas INSS/IR salvas no banco
      const { tabelaInss, tabelaIR } = await fetchTabelasEncargos(supabase)

      // 4. Processar cada lançamento individualmente (1 linha por lançamento)
      const resultado: LinhaEncargo[] = []

      for (const l of lancsCLT) {
        const colab = l.colaboradores as any

        let valorHoras    = 0
        let valorDSR      = 0
        let valorProducao = 0
        let valorPremio   = 0
        let salarioBruto  = 0
        let descontoVT    = 0
        let descontoAD    = 0
        let inss          = 0
        let ir            = 0
        let liquido       = 0

        if (l.snap_valor_total != null) {
          // Snapshot: valores fixos do momento do fechamento — não recalcula
          valorHoras    = l.snap_valor_horas    ?? 0
          valorDSR      = l.snap_valor_dsr      ?? 0
          valorProducao = l.snap_valor_producao  ?? 0
          valorPremio   = l.snap_valor_premio    ?? 0
          salarioBruto  = valorHoras + valorDSR
          descontoVT    = l.snap_desconto_vt     ?? 0
          descontoAD    = l.snap_desconto_adiant ?? 0
          inss          = l.snap_inss            ?? 0
          ir            = l.snap_ir              ?? 0
          liquido       = l.snap_liquido         ?? (salarioBruto - descontoVT - descontoAD - inss - ir)
        } else {
          // Lançamento ainda em aberto — recalcula com tabelas atuais
          const funcaoId = colab?.funcao_id ?? null
          const vh       = funcaoId ? (valorHoraMap[funcaoId] ?? 0) : (l.snap_valor_hora ?? 0)
          const pt       = pontosMap[l.id] ?? { normais: 0, extras: 0 }
          const duDias   = diasUteisPeriodo(l.data_inicio, l.data_fim, feriadosSet)
          const domFer   = domingosFeriadosPeriodo(l.data_inicio, l.data_fim, feriadosSet)

          valorHoras   = pt.normais * vh + pt.extras * vh * heCoef50
          valorDSR     = duDias > 0 ? (valorHoras / duDias) * domFer : 0
          salarioBruto = valorHoras + valorDSR
          inss         = calcINSS(salarioBruto, tabelaInss)
          ir           = calcIR(salarioBruto, inss, tabelaIR)
          liquido      = salarioBruto - inss - ir
        }

        // Encargos da empresa — usa alíquotas do banco
        const fgts         = salarioBruto * fgtsAliq
        const inssPatronal = salarioBruto * inssPatronalAliq
        const rat          = salarioBruto * ratAliq
        const terceiros    = salarioBruto * terceirosAliq
        const totalEmpresa = fgts + inssPatronal + rat + terceiros

        resultado.push({
          lancamento_id:   l.id,
          colaborador_id:  l.colaborador_id,
          nome:            colab?.nome        ?? '—',
          chapa:           colab?.chapa       ?? null,
          funcao_nome:     colab?.funcoes?.nome ?? 'Sem função',
          funcao_id:       colab?.funcao_id   ?? null,
          obra_nome:       (l.obras as any)?.nome ?? '—',
          obra_id:         (l.obras as any)?.id   ?? null,
          tipo_contrato:   colab?.tipo_contrato ?? 'clt',
          mesRef,
          valorHoras,
          valorDSR,
          valorProducao,
          valorPremio,
          salarioBruto,
          descontoVT,
          descontoAD,
          inss,
          ir,
          liquido,
          fgts,
          inssPatronal,
          rat,
          terceiros,
          totalEmpresa,
        })
      }

      resultado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

      // Salva no cache
      cacheRef.current[mesRef] = {
        linhas: resultado,
        fgtsAliq,
        inssPatronalAliq,
        ratAliq,
        terceirosAliq,
      }

      setLinhas(resultado)
    } catch (err: any) {
      const msg = err?.message ?? 'Erro ao carregar encargos'
      setErro(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
      setCalculado(true)
    }
  }, [mes, ano, fgtsAliq, inssPatronalAliq, ratAliq, terceirosAliq, heCoef50, heCoef100, forceRefetch])

  // Carrega automaticamente quando muda o período ou forceRefetch
  useEffect(() => { calcular() }, [calcular])

  // ── refetch: invalida cache do período atual e dispara re-busca ────────────
  const refetch = useCallback(() => {
    const mesRef = `${ano}-${String(mes).padStart(2, '0')}`
    delete cacheRef.current[mesRef]
    setForceRefetch(n => n + 1)
  }, [mes, ano])

  // ── Totalizadores ──────────────────────────────────────────────────────────
  const totalBruto           = linhas.reduce((s, l) => s + l.salarioBruto,  0)
  const totalLiquido         = linhas.reduce((s, l) => s + l.liquido,       0)
  const totalEncargosEmpresa = linhas.reduce((s, l) => s + l.totalEmpresa,  0)
  const totalFolha           = totalBruto + totalEncargosEmpresa

  return {
    linhas,
    loading,
    erro,
    calculado,
    refetch,
    totalBruto,
    totalLiquido,
    totalEncargosEmpresa,
    totalFolha,
    fgtsAliq,
    inssPatronalAliq,
    ratAliq,
    terceirosAliq,
  }
}
