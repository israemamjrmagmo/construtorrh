import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Search, ChevronLeft, ChevronRight, CheckCircle2, Printer, Factory, X, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ColabSimples {
  id: string
  nome: string
  chapa: string | null
  salario: number | null
  obra_id: string | null
  funcao_nome: string
}

interface ObraSimples {
  id: string
  nome: string
}

// Playbook
interface PlaybookItem {
  id: string
  descricao: string
  unidade: string
  preco_unitario: number
  categoria: string | null
}

// Lançamento de produção (salvo no banco)
interface LancProducao {
  id?: string
  colaborador_id: string
  mes_referencia: string   // YYYY-MM
  playbook_item_id: string
  dias: string[]           // datas YYYY-MM-DD
  quantidade: number
  valor_total: number
  observacoes: string | null
  playbook_item?: PlaybookItem
}

// Item de produção no modal (antes de salvar)
interface ItemModalProd {
  playbook_item_id: string
  quantidade: number
}

// Horário padrão por dia da semana (da tabela obra_horarios)
interface HorarioDia {
  dia_semana: string   // 'seg','ter','qua','qui','sex','sab','dom'
  hora_entrada: string
  saida_almoco: string
  retorno_almoco: string
  hora_saida: string
  ativo: boolean
}

// Evento que afeta um dia (atestado ou suspensão)
type TipoEvento = 'atestado' | 'suspensao' | null

interface DiaRegistro {
  id?: string
  colaborador_id: string
  data: string
  presente: boolean
  falta: boolean
  hora_entrada:    string
  saida_almoco:    string
  retorno_almoco:  string
  hora_saida:      string
  he_entrada:      string
  he_saida:        string
  justificativa:   string
  // controle de bloqueio
  evento: TipoEvento        // null = normal, 'atestado' = afastamento, 'suspensao' = suspensão
  bloqueado: boolean        // não pode alterar presença
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

const DIAS_KEY: Record<number, string> = { 1:'seg', 2:'ter', 3:'qua', 4:'qui', 5:'sex', 6:'sab', 0:'dom' }

function toMin(t: string): number | null {
  if (!t || !t.includes(':')) return null
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function diffMin(a: string, b: string): number {
  const ma = toMin(a), mb = toMin(b)
  if (ma === null || mb === null) return 0
  let d = mb - ma
  if (d < 0) d += 1440
  return d
}

function fmtHHMM(min: number): string {
  if (min <= 0) return '00:00'
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`
}

function fmtDecimal(min: number): number {
  return parseFloat((min / 60).toFixed(2))
}

// calcDia retorna:
// normais   = horas seg-sex (regular, sem HE) — multiplicador 1.0
// extras50  = HE (qualquer dia) + horas do sábado — multiplicador 1.5
function calcDia(d: DiaRegistro): { normais: number; extras50: number; extras: number; total: number } {
  if (!d.presente || d.falta) return { normais: 0, extras50: 0, extras: 0, total: 0 }

  const isSab = new Date(d.data + 'T12:00:00').getDay() === 6

  let horasDia = 0
  if (d.hora_entrada && d.hora_saida) {
    let bruto = diffMin(d.hora_entrada, d.hora_saida)
    if (d.saida_almoco && d.retorno_almoco) bruto -= diffMin(d.saida_almoco, d.retorno_almoco)
    else if (d.saida_almoco) bruto -= 60
    horasDia = Math.max(0, bruto)
  }

  // HE (entrada/saída extra)
  let he = 0
  if (d.he_entrada && d.he_saida) he = Math.max(0, diffMin(d.he_entrada, d.he_saida))

  // Sábado: horas do dia vão para extras50 (adicional 50%)
  // Seg-Sex: horas normais = horasDia, HE = extras50
  const normais  = isSab ? 0       : horasDia
  const extras50 = isSab ? horasDia + he : he

  return { normais, extras50, extras: extras50, total: normais + extras50 }
}

function diasDoMes(ano: number, mes: number): string[] {
  const dias: string[] = []
  const total = new Date(ano, mes, 0).getDate()
  for (let d = 1; d <= total; d++)
    dias.push(`${ano}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
  return dias
}

function diaSemana(data: string): string {
  return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(data+'T12:00:00').getDay()]
}

function isFDS(data: string): boolean {
  const d = new Date(data+'T12:00:00').getDay()
  return d === 0 || d === 6
}

// Normaliza campo TIME do Supabase (HH:MM:SS ou HH:MM) → HH:MM
function normTime(t: string | null | undefined): string {
  if (!t) return ''
  return t.slice(0, 5) // pega apenas HH:MM
}

function emptyDia(colaborador_id: string, data: string): DiaRegistro {
  return {
    colaborador_id, data,
    presente: false, falta: false,
    hora_entrada: '', saida_almoco: '', retorno_almoco: '', hora_saida: '',
    he_entrada: '', he_saida: '', justificativa: '',
    evento: null, bloqueado: false,
  }
}

// Expande range de datas em um Set de strings 'YYYY-MM-DD'
function expandRange(inicio: string, fim: string): Set<string> {
  const set = new Set<string>()
  const d = new Date(inicio + 'T12:00:00')
  const end = new Date(fim + 'T12:00:00')
  while (d <= end) {
    set.add(d.toISOString().slice(0,10))
    d.setDate(d.getDate() + 1)
  }
  return set
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Ponto() {
  const hoje = new Date()
  const [ano, setAno]   = useState(hoje.getFullYear())
  const [mes, setMes]   = useState(hoje.getMonth() + 1)
  const [busca, setBusca]       = useState('')
  const [obraFiltro, setObraFiltro] = useState<string>('todas')

  const [colaboradores, setColaboradores] = useState<ColabSimples[]>([])
  const [obras,          setObras]         = useState<ObraSimples[]>([])
  const [loadingColabs,  setLoadingColabs] = useState(true)

  const [colabSel, setColabSel] = useState<ColabSimples | null>(null)
  // horários da obra do colaborador selecionado: mapa dia_semana → HorarioDia
  const [horarioObra, setHorarioObra] = useState<Record<string, HorarioDia>>({})

  const [dias, setDias]     = useState<DiaRegistro[]>([])
  const [loadingDias, setLoadingDias] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Produção ──────────────────────────────────────────────────────────────
  const [playbookItens, setPlaybookItens] = useState<PlaybookItem[]>([])
  const [lancamentos,   setLancamentos]   = useState<LancProducao[]>([])
  const [modalProd,     setModalProd]     = useState(false)
  // seleção de dias no modal
  const [diasSel,       setDiasSel]       = useState<Set<string>>(new Set())
  // itens de produção no modal
  const [itensProd,     setItensProd]     = useState<ItemModalProd[]>([{ playbook_item_id:'', quantidade:0 }])
  const [savingProd,    setSavingProd]    = useState(false)
  const [editLanc,      setEditLanc]      = useState<LancProducao | null>(null)

  // ── Carregar colaboradores e obras ────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [{ data: colsRaw, error: colErr }, { data: obsRaw }] = await Promise.all([
        supabase.from('colaboradores')
          .select('id, nome, chapa, salario, obra_id, funcoes(nome)')
          .order('nome'),
        supabase.from('obras').select('id, nome').order('nome'),
      ])

      if (colErr) { toast.error('Erro: ' + colErr.message); setLoadingColabs(false); return }

      setColaboradores((colsRaw ?? []).map((c: any) => ({
        id: c.id, nome: c.nome, chapa: c.chapa ?? null,
        salario: c.salario ?? null, obra_id: c.obra_id ?? null,
        funcao_nome: c.funcoes?.nome ?? 'Sem função',
      })))
      setObras((obsRaw ?? []) as ObraSimples[])
      setLoadingColabs(false)
    }
    load()
  }, [])

  // ── Filtro ────────────────────────────────────────────────────────────────
  const colabsFiltrados = useMemo(() => {
    let lista = colaboradores
    if (obraFiltro !== 'todas') lista = lista.filter(c => c.obra_id === obraFiltro)
    const q = busca.toLowerCase()
    if (q) lista = lista.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      (c.chapa ?? '').toLowerCase().includes(q) ||
      c.funcao_nome.toLowerCase().includes(q)
    )
    return lista
  }, [colaboradores, busca, obraFiltro])

  // ── Carregar registros do mês + atestados + advertências ──────────────────
  const fetchDias = useCallback(async (colab: ColabSimples, a: number, m: number, horarioObraMap: Record<string, HorarioDia> = {}) => {
    setLoadingDias(true)
    const inicio = `${a}-${String(m).padStart(2,'0')}-01`
    const fim    = `${a}-${String(m).padStart(2,'0')}-${new Date(a, m, 0).getDate()}`

    const [
      { data: pontosRaw },
      { data: atestadosRaw },
      { data: advertenciasRaw },
    ] = await Promise.all([
      supabase.from('registro_ponto').select('*').eq('colaborador_id', colab.id).gte('data', inicio).lte('data', fim),
      supabase.from('atestados').select('data, dias_afastamento').eq('colaborador_id', colab.id),
      supabase.from('advertencias').select('data_advertencia, tipo, dias_suspensao').eq('colaborador_id', colab.id).eq('tipo', 'suspensao'),
    ])

    // Montar mapa de pontos existentes
    const mapaPonto: Record<string, any> = {}
    ;(pontosRaw ?? []).forEach((r: any) => { mapaPonto[r.data] = r })

    // Montar set de dias de atestado (apenas seg-sex)
    const diasAtestado = new Set<string>()
    ;(atestadosRaw ?? []).forEach((at: any) => {
      if (!at.data) return
      const diasAfast = at.dias_afastamento ?? 0
      if (diasAfast > 0) {
        const fim2 = new Date(at.data + 'T12:00:00')
        fim2.setDate(fim2.getDate() + diasAfast - 1)
        expandRange(at.data, fim2.toISOString().slice(0,10)).forEach(d => {
          // apenas dias úteis (seg-sex)
          const dow = new Date(d + 'T12:00:00').getDay()
          if (dow !== 0 && dow !== 6) diasAtestado.add(d)
        })
      } else {
        const dow = new Date(at.data + 'T12:00:00').getDay()
        if (dow !== 0 && dow !== 6) diasAtestado.add(at.data)
      }
    })

    // Montar set de dias de suspensão
    const diasSuspensao = new Set<string>()
    ;(advertenciasRaw ?? []).forEach((adv: any) => {
      const dataAdv = adv.data_advertencia
      if (!dataAdv || !adv.dias_suspensao || adv.dias_suspensao <= 0) return
      const fim2 = new Date(dataAdv + 'T12:00:00')
      fim2.setDate(fim2.getDate() + (adv.dias_suspensao - 1))
      expandRange(dataAdv, fim2.toISOString().slice(0,10)).forEach(d => diasSuspensao.add(d))
    })

    setDias(diasDoMes(a, m).map(d => {
      const r = mapaPonto[d]
      const isAtestado  = diasAtestado.has(d)
      const isSuspensao = diasSuspensao.has(d)
      const evento: TipoEvento = isSuspensao ? 'suspensao' : isAtestado ? 'atestado' : null

      if (!r) {
        const base = emptyDia(colab.id, d)
        // Atestado: marca como presente + preenche horários da obra + bloqueia edição
        if (isAtestado) {
          const diaSem = DIAS_KEY[new Date(d + 'T12:00:00').getDay()]
          const hor = horarioObraMap[diaSem]
          return {
            ...base,
            presente:       true,
            evento,
            bloqueado:      true,
            hora_entrada:   hor?.hora_entrada   ?? '',
            saida_almoco:   hor?.saida_almoco   ?? '',
            retorno_almoco: hor?.retorno_almoco ?? '',
            hora_saida:     hor?.hora_saida     ?? '',
          }
        }
        // Suspensão: bloqueia presença
        if (isSuspensao) return { ...base, presente: false, falta: false, evento, bloqueado: true }
        return { ...base, evento, bloqueado: false }
      }

      // Dia com registro já salvo
      // Se for atestado: garante que os horários da obra estejam preenchidos (seg-sex)
      if (isAtestado) {
        const diaSem = DIAS_KEY[new Date(d + 'T12:00:00').getDay()]
        const hor = horarioObraMap[diaSem]
        return {
          id: r.id, colaborador_id: colab.id, data: d,
          presente:       true,
          falta:          false,
          hora_entrada:   hor?.hora_entrada   || r.hora_entrada   || '',
          saida_almoco:   hor?.saida_almoco   || r.saida_almoco   || '',
          retorno_almoco: hor?.retorno_almoco || r.retorno_almoco || '',
          hora_saida:     hor?.hora_saida     || r.hora_saida     || '',
          he_entrada:     '',
          he_saida:       '',
          justificativa:  r.justificativa ?? '',
          evento,
          bloqueado: true,
        } as DiaRegistro
      }

      return {
        id: r.id, colaborador_id: colab.id, data: d,
        presente:       !!(r.hora_entrada || r.hora_saida),
        falta:          r.falta ?? false,
        hora_entrada:   r.hora_entrada   ?? '',
        saida_almoco:   r.saida_almoco   ?? '',
        retorno_almoco: r.retorno_almoco ?? '',
        hora_saida:     r.hora_saida     ?? '',
        he_entrada:     r.he_entrada     ?? '',
        he_saida:       r.he_saida       ?? '',
        justificativa:  r.justificativa  ?? '',
        evento,
        bloqueado: isSuspensao,
      } as DiaRegistro
    }))
    setLoadingDias(false)
  }, [])

  useEffect(() => {
    if (!colabSel) return
    const load = async () => {
      // Carrega horários da obra primeiro, depois usa no fetchDias
      let horMap: Record<string, HorarioDia> = {}
      if (colabSel.obra_id) {
        const { data } = await supabase.from('obra_horarios').select('*').eq('obra_id', colabSel.obra_id)
        ;(data ?? []).forEach((h: any) => {
          horMap[h.dia_semana] = {
            ...h,
            hora_entrada:   normTime(h.hora_entrada),
            saida_almoco:   normTime(h.saida_almoco),
            retorno_almoco: normTime(h.retorno_almoco),
            hora_saida:     normTime(h.hora_saida),
          }
        })
        setHorarioObra(horMap)
      } else {
        setHorarioObra({})
      }
      fetchDias(colabSel, ano, mes, horMap)
    }
    load()
  }, [colabSel, ano, mes, fetchDias])

  // ── Toggle presença (preenche horários da obra automaticamente) ───────────
  function togglePresente(idx: number) {
    setDias(prev => prev.map((d, i) => {
      if (i !== idx) return d
      if (d.bloqueado) {
        if (d.evento === 'atestado') toast.info('Dia de afastamento — não é possível alterar a presença')
        if (d.evento === 'suspensao') toast.info('Dia de suspensão — não é possível marcar presença')
        return d
      }
      if (d.presente) {
        // desmarca
        return { ...d, presente: false, falta: false, hora_entrada: '', saida_almoco: '', retorno_almoco: '', hora_saida: '', he_entrada: '', he_saida: '' }
      }
      // Marca presença — preenche horários da obra conforme o dia da semana
      const diaSem = DIAS_KEY[new Date(d.data + 'T12:00:00').getDay()]
      const hor = horarioObra[diaSem]
      return {
        ...d, presente: true, falta: false,
        hora_entrada:   hor?.hora_entrada   ?? '',
        saida_almoco:   hor?.saida_almoco   ?? '',
        retorno_almoco: hor?.retorno_almoco ?? '',
        hora_saida:     hor?.hora_saida     ?? '',
      }
    }))
  }

  function toggleFalta(idx: number) {
    setDias(prev => prev.map((d, i) => {
      if (i !== idx) return d
      if (d.bloqueado) {
        toast.info(d.evento === 'atestado' ? 'Dia de afastamento' : 'Dia de suspensão')
        return d
      }
      return { ...d, falta: !d.falta, presente: false,
        hora_entrada: '', saida_almoco: '', retorno_almoco: '', hora_saida: '', he_entrada: '', he_saida: '' }
    }))
  }

  function updDia(idx: number, field: keyof DiaRegistro, value: unknown) {
    setDias(prev => prev.map((d, i) => i !== idx ? d : { ...d, [field]: value }))
  }

  // ── Totais ────────────────────────────────────────────────────────────────
  const totais = useMemo(() => {
    let normais = 0, extras50 = 0, faltas = 0, presentes = 0, atestados = 0, suspensoes = 0
    dias.forEach(d => {
      const c = calcDia(d)
      normais  += c.normais
      extras50 += c.extras50
      if (d.presente && !d.falta) presentes++
      if (d.falta) faltas++
      if (d.evento === 'atestado' && !isFDS(d.data)) atestados++
      if (d.evento === 'suspensao') suspensoes++
    })
    const total = normais + extras50
    return { normais, extras50, extras: extras50, total, presentes, faltas, atestados, suspensoes }
  }, [dias])

  // Valor hora base = salário ÷ 220h
  const valorHora    = colabSel?.salario ? colabSel.salario / 220 : 0
  // Valores de recebimento
  const valorNormal  = valorHora > 0 ? fmtDecimal(totais.normais)  * valorHora        : 0
  const valorExtra   = valorHora > 0 ? fmtDecimal(totais.extras50) * valorHora * 1.5  : 0
  const valorTotal   = valorNormal + valorExtra

  // ── Salvar ────────────────────────────────────────────────────────────────
  const handleSalvar = async () => {
    if (!colabSel) return
    setSaving(true)

    const upserts = dias
      .filter(d => d.presente || d.falta || d.id)
      .map(d => {
        const c = calcDia(d)
        return {
          ...(d.id ? { id: d.id } : {}),
          colaborador_id:    d.colaborador_id,
          data:              d.data,
          hora_entrada:      d.hora_entrada   || null,
          saida_almoco:      d.saida_almoco   || null,
          retorno_almoco:    d.retorno_almoco || null,
          hora_saida:        d.hora_saida     || null,
          horas_trabalhadas: fmtDecimal(c.normais),
          horas_extras:      fmtDecimal(c.extras),
          falta:             d.falta,
          justificativa:     d.justificativa  || null,
        }
      })

    if (upserts.length === 0) { toast.info('Nenhum registro para salvar'); setSaving(false); return }

    const { error } = await supabase
      .from('registro_ponto')
      .upsert(upserts, { onConflict: 'colaborador_id,data' })

    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success('Ponto salvo!')
    fetchDias(colabSel, ano, mes)
  }

  function mesAnterior() { if (mes===1){setAno(a=>a-1);setMes(12)}else setMes(m=>m-1) }
  function mesSeguinte() { if (mes===12){setAno(a=>a+1);setMes(1)}else setMes(m=>m+1) }

  // ── Funções de produção ───────────────────────────────────────────────────

  // Carregar playbook e lançamentos quando colaborador ou mês mudar
  const fetchProducao = useCallback(async (colab: ColabSimples, a: number, m: number) => {
    const mesRef = `${a}-${String(m).padStart(2,'0')}`
    const obraId = colab.obra_id

    const [{ data: pbRaw }, { data: lancRaw }] = await Promise.all([
      obraId
        ? supabase.from('playbook_itens').select('*').eq('obra_id', obraId).eq('ativo', true).order('categoria').order('descricao')
        : Promise.resolve({ data: [] }),
      supabase.from('ponto_producao').select('*, playbook_item:playbook_itens(*)').eq('colaborador_id', colab.id).eq('mes_referencia', mesRef),
    ])
    setPlaybookItens((pbRaw ?? []) as PlaybookItem[])
    setLancamentos((lancRaw ?? []) as LancProducao[])
  }, [])

  // Chama fetchProducao quando seleciona colaborador / muda mês
  useEffect(() => {
    if (colabSel) fetchProducao(colabSel, ano, mes)
  }, [colabSel, ano, mes, fetchProducao])

  function abrirModalProd() {
    setEditLanc(null)
    setDiasSel(new Set())
    setItensProd([{ playbook_item_id: playbookItens[0]?.id ?? '', quantidade: 0 }])
    setModalProd(true)
  }

  async function salvarProducao() {
    if (!colabSel) return
    if (diasSel.size === 0) { toast.error('Selecione ao menos um dia de produção'); return }
    const itensValidos = itensProd.filter(i => i.playbook_item_id && i.quantidade > 0)
    if (itensValidos.length === 0) { toast.error('Informe ao menos um item com quantidade > 0'); return }
    setSavingProd(true)

    const mesRef = `${ano}-${String(mes).padStart(2,'0')}`
    const diasArr = Array.from(diasSel).sort()

    // Remove lançamentos anteriores para os mesmos dias (substitui)
    if (editLanc?.id) {
      await supabase.from('ponto_producao').delete().eq('id', editLanc.id)
    }

    const rows = itensValidos.map(item => {
      const pb = playbookItens.find(p => p.id === item.playbook_item_id)
      return {
        colaborador_id:   colabSel.id,
        mes_referencia:   mesRef,
        playbook_item_id: item.playbook_item_id,
        dias:             diasArr,
        quantidade:       item.quantidade,
        valor_total:      (pb?.preco_unitario ?? 0) * item.quantidade,
        observacoes:      null as string | null,
      }
    })

    const { error } = await supabase.from('ponto_producao').insert(rows)
    setSavingProd(false)
    if (error) { toast.error('Erro ao salvar produção: ' + error.message); return }
    toast.success('Produção lançada!')
    setModalProd(false)
    fetchProducao(colabSel, ano, mes)
  }

  async function deletarLanc(id: string) {
    const { error } = await supabase.from('ponto_producao').delete().eq('id', id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Lançamento removido')
    if (colabSel) fetchProducao(colabSel, ano, mes)
  }

  // Calcula o resumo financeiro considerando tipo_contrato
  const resumoFinanceiro = useMemo(() => {
    if (!colabSel || valorHora === 0) return null

    const tipoContrato = (colabSel as any).tipo_contrato ?? 'clt'
    const totalProd = lancamentos.reduce((s, l) => s + l.valor_total, 0)

    // Dias que têm lançamento de produção
    const diasComProd = new Set(lancamentos.flatMap(l => l.dias))

    // Horas sem produção (dias normais não cobertos por produção)
    let minSemProd = 0
    dias.forEach(d => {
      if (!diasComProd.has(d.data)) {
        const c = calcDia(d)
        minSemProd += c.normais + c.extras50
      }
    })
    const valorHorasSemProd = fmtDecimal(minSemProd) * valorHora

    if (tipoContrato === 'autonomo' || tipoContrato === 'pj') {
      // Autônomo: horas sem produção + valor da produção
      return {
        tipo: 'autonomo' as const,
        valorHorasSemProd,
        totalProd,
        totalPagar: valorHorasSemProd + totalProd,
        premio: 0,
      }
    } else {
      // CLT: salário base pelas horas totais
      // Horas nos dias de produção
      let minComProd = 0
      dias.forEach(d => {
        if (diasComProd.has(d.data)) {
          const c = calcDia(d)
          minComProd += c.normais + c.extras50
        }
      })
      const valorHorasProd = fmtDecimal(minComProd) * valorHora
      const valorHoraTotal = fmtDecimal(totais.normais + totais.extras50) * valorHora

      // Compara produção vs horas nos dias de produção
      const excedente = totalProd - valorHorasProd
      const premio = excedente > 0 ? excedente : 0

      return {
        tipo: 'clt' as const,
        valorHoraTotal,      // base CLT (nunca recebe menos)
        valorHorasProd,      // valor das horas nos dias de produção
        totalProd,           // valor apurado por produção
        premio,              // excedente pago como prêmio
        totalPagar: valorHoraTotal + premio,
      }
    }
  }, [colabSel, lancamentos, dias, totais, valorHora])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
    <div style={{ display:'flex', height:'calc(100vh - 80px)', overflow:'hidden' }}>

      {/* ── Painel esquerdo ──────────────────────────────────────────────── */}
      <div style={{ width:280, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 12px 10px', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontWeight:700, fontSize:14 }}>🕐 Controle de Ponto</div>
          <Select value={obraFiltro} onValueChange={setObraFiltro}>
            <SelectTrigger style={{ fontSize:12, height:32 }}><SelectValue placeholder="Todas as obras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <div style={{ position:'relative' }}>
            <Search size={12} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--muted-foreground)' }} />
            <Input placeholder="Buscar nome ou chapa…" value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft:26, fontSize:12, height:32 }} />
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>
          {loadingColabs ? (
            <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--muted-foreground)' }}>Carregando…</div>
          ) : colabsFiltrados.length === 0 ? (
            <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--muted-foreground)' }}>Nenhum colaborador</div>
          ) : colabsFiltrados.map(c => (
            <button key={c.id} onClick={() => setColabSel(c)} style={{
              width:'100%', textAlign:'left', padding:'10px 12px',
              border:'none', borderBottom:'1px solid var(--border)',
              background: colabSel?.id===c.id ? 'var(--primary)' : 'transparent',
              color: colabSel?.id===c.id ? '#fff' : 'var(--foreground)',
              cursor:'pointer',
            }}>
              <div style={{ fontSize:10, fontFamily:'monospace', fontWeight:700, opacity:0.65 }}>{c.chapa ?? '—'}</div>
              <div style={{ fontSize:13, fontWeight:600 }}>{c.nome}</div>
              <div style={{ fontSize:11, opacity:0.7 }}>{c.funcao_nome}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Painel direito ───────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {!colabSel ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, color:'var(--muted-foreground)' }}>
            <span style={{ fontSize:44 }}>👈</span>
            <div style={{ fontSize:15, fontWeight:600 }}>Selecione um colaborador</div>
            <div style={{ fontSize:13 }}>para lançar o ponto do mês</div>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{colabSel.nome}</div>
                <div style={{ fontSize:12, color:'var(--muted-foreground)' }}>
                  {colabSel.chapa && <><span style={{ fontFamily:'monospace', fontWeight:600 }}>{colabSel.chapa}</span> · </>}
                  {colabSel.funcao_nome}
                  {valorHora>0 && <> · <strong>R$ {valorHora.toFixed(2)}/h</strong></>}
                  {Object.keys(horarioObra).length > 0 && <span style={{ marginLeft:8, background:'#dcfce7', color:'#15803d', borderRadius:4, padding:'1px 6px', fontSize:10, fontWeight:600 }}>✓ Horários da obra</span>}
                </div>
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <button onClick={mesAnterior} style={{ border:'1px solid var(--border)', borderRadius:6, background:'none', cursor:'pointer', padding:'4px 8px', display:'flex' }}><ChevronLeft size={14}/></button>
                <span style={{ fontWeight:700, fontSize:13, minWidth:130, textAlign:'center' }}>{MESES[mes-1]} / {ano}</span>
                <button onClick={mesSeguinte} style={{ border:'1px solid var(--border)', borderRadius:6, background:'none', cursor:'pointer', padding:'4px 8px', display:'flex' }}><ChevronRight size={14}/></button>
              </div>

              <Button variant="outline" size="sm" onClick={() => window.print()} style={{ gap:5 }}><Printer size={13}/> Imprimir</Button>
              {playbookItens.length > 0 && (
                <Button variant="outline" size="sm" onClick={abrirModalProd} style={{ gap:5, borderColor:'#f59e0b', color:'#b45309' }}>
                  <Factory size={13}/> Lançar Produção
                </Button>
              )}
              <Button size="sm" onClick={handleSalvar} disabled={saving}>{saving ? '⏳ Salvando…' : '💾 Salvar Ponto'}</Button>
            </div>

            {/* Legenda */}
            <div style={{ padding:'6px 16px', background:'var(--muted)', borderBottom:'1px solid var(--border)', display:'flex', gap:16, fontSize:11, flexShrink:0, flexWrap:'wrap' }}>
              <span>○ Ausente</span>
              <span style={{ color:'#16a34a' }}>✓ Presente</span>
              <span style={{ color:'#dc2626' }}>✗ Falta</span>
              <span style={{ background:'rgba(59,130,246,0.12)', padding:'1px 6px', borderRadius:3, color:'#1d4ed8' }}>🩺 Afastamento (atestado)</span>
              <span style={{ background:'rgba(239,68,68,0.12)', padding:'1px 6px', borderRadius:3, color:'#b91c1c' }}>⛔ Suspensão</span>
            </div>

            {/* Tabela */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {loadingDias ? (
                <div style={{ padding:32, textAlign:'center', color:'var(--muted-foreground)' }}>Carregando…</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#1e3a5f', color:'#fff', position:'sticky', top:0, zIndex:10 }}>
                      <th style={TH}>Dia</th>
                      <th style={TH}>Data</th>
                      <th style={{ ...TH, width:70 }}>Presente</th>
                      <th style={{ ...TH, width:60 }}>Falta</th>
                      <th style={TH}>Entrada</th>
                      <th style={TH}>Saída Alm.</th>
                      <th style={TH}>Ret. Alm.</th>
                      <th style={TH}>Saída</th>
                      <th style={{ ...TH, background:'#2d5a9e' }}>H.E. Entrada</th>
                      <th style={{ ...TH, background:'#2d5a9e' }}>H.E. Saída</th>
                      <th style={{ ...TH, background:'#1a4a1a' }}>Normais</th>
                      <th style={{ ...TH, background:'#2d5a1a' }} title="HE + Sábado (+50%)">Extras</th>
                      <th style={{ ...TH, background:'#0f3320' }}>Total</th>
                      <th style={{ ...TH, width:90 }}>Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dias.map((d, idx) => {
                      const fds  = isFDS(d.data)
                      const calc = calcDia(d)

                      // cor de fundo por estado
                      const bg = d.evento === 'suspensao'
                        ? 'rgba(239,68,68,0.09)'
                        : d.evento === 'atestado'
                          ? 'rgba(59,130,246,0.09)'
                          : fds
                            ? 'rgba(100,100,100,0.05)'
                            : d.falta
                              ? 'rgba(239,68,68,0.06)'
                              : d.presente
                                ? 'rgba(22,163,74,0.04)'
                                : 'transparent'

                      return (
                        <tr key={d.data} style={{ borderBottom:'1px solid var(--border)', background:bg }}>
                          <td style={{ ...TD, fontWeight:700, textAlign:'center', color:fds?'#9ca3af':undefined }}>{diaSemana(d.data)}</td>
                          <td style={{ ...TD, textAlign:'center', fontFamily:'monospace', fontWeight:600 }}>{d.data.slice(8)}/{d.data.slice(5,7)}</td>

                          {/* Presença */}
                          <td style={{ ...TD, textAlign:'center' }}>
                            {fds ? <span style={{ fontSize:10, color:'#9ca3af' }}>FDS</span>
                              : d.evento === 'atestado' ? <span title="Afastamento por atestado" style={{ fontSize:13 }}>🩺</span>
                              : d.evento === 'suspensao' ? <span title="Suspensão" style={{ fontSize:13 }}>⛔</span>
                              : (
                                <button onClick={() => togglePresente(idx)} style={{ border:'none', background:'none', cursor:'pointer', padding:2, color:d.presente?'#16a34a':'#9ca3af' }}>
                                  {d.presente ? <CheckCircle2 size={17}/> : <span style={{ fontSize:17, opacity:0.35 }}>○</span>}
                                </button>
                              )}
                          </td>

                          {/* Falta */}
                          <td style={{ ...TD, textAlign:'center' }}>
                            {!fds && !d.bloqueado && (
                              <button onClick={() => toggleFalta(idx)} style={{ border:'none', background:'none', cursor:'pointer', padding:2, color:d.falta?'#dc2626':'#9ca3af' }}>
                                <span style={{ fontSize:16, opacity:d.falta?1:0.3 }}>✗</span>
                              </button>
                            )}
                          </td>

                          <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado} value={d.hora_entrada}    onChange={v=>updDia(idx,'hora_entrada',v)}/></td>
                          <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado} value={d.saida_almoco}   onChange={v=>updDia(idx,'saida_almoco',v)}/></td>
                          <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado} value={d.retorno_almoco} onChange={v=>updDia(idx,'retorno_almoco',v)}/></td>
                          <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado} value={d.hora_saida}     onChange={v=>updDia(idx,'hora_saida',v)}/></td>
                          <td style={{ ...TD, background:'rgba(45,90,158,0.04)' }}><TI disabled={!d.presente||d.falta||d.bloqueado} value={d.he_entrada} onChange={v=>updDia(idx,'he_entrada',v)}/></td>
                          <td style={{ ...TD, background:'rgba(45,90,158,0.04)' }}><TI disabled={!d.presente||d.falta||d.bloqueado} value={d.he_saida}   onChange={v=>updDia(idx,'he_saida',v)}/></td>

                          <td style={{ ...TD, textAlign:'center', fontWeight:600, color:calc.normais>0?'#15803d':'#9ca3af', background:'rgba(22,163,74,0.05)' }}>{calc.normais>0?fmtHHMM(calc.normais):'—'}</td>
                          <td style={{ ...TD, textAlign:'center', fontWeight:600, color:calc.extras50>0?'#1d4ed8':'#9ca3af', background:'rgba(45,90,158,0.05)' }} title={calc.extras50>0?'+50%':''}>{calc.extras50>0?fmtHHMM(calc.extras50)+'*':'—'}</td>
                          <td style={{ ...TD, textAlign:'center', fontWeight:700, background:'rgba(0,0,0,0.03)' }}>{calc.total>0?fmtHHMM(calc.total):'—'}</td>

                          {/* Obs / indicador */}
                          <td style={{ ...TD, fontSize:10 }}>
                            {d.evento === 'atestado' && <span style={{ color:'#1d4ed8', fontWeight:600 }}>Afastamento</span>}
                            {d.evento === 'suspensao' && <span style={{ color:'#b91c1c', fontWeight:600 }}>Suspensão</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    {/* Linha 1: horas */}
                    <tr style={{ background:'#1e3a5f', color:'#fff', fontWeight:700 }}>
                      <td colSpan={4} style={{ padding:'10px 14px', fontSize:12 }}>
                        TOTAIS — {totais.presentes} dia{totais.presentes!==1?'s':''} trabalhado{totais.presentes!==1?'s':''}
                        {totais.faltas>0    && <span style={{ color:'#fca5a5', marginLeft:8 }}>· {totais.faltas} falta{totais.faltas!==1?'s':''}</span>}
                        {totais.atestados>0 && <span style={{ color:'#93c5fd', marginLeft:8 }}>· {totais.atestados} afastamento{totais.atestados!==1?'s':''}</span>}
                        {totais.suspensoes>0 && <span style={{ color:'#fca5a5', marginLeft:8 }}>· {totais.suspensoes} suspensão</span>}
                      </td>
                      <td colSpan={6} style={{ padding:'10px 14px', textAlign:'right', fontSize:11, opacity:0.7 }}>
                        {valorHora>0 && <><strong>R$ {valorHora.toFixed(4)}/h</strong> base</>}
                      </td>
                      <td style={{ padding:'10px 8px', textAlign:'center', background:'rgba(22,163,74,0.3)', fontSize:13 }}>{fmtHHMM(totais.normais)}</td>
                      <td style={{ padding:'10px 8px', textAlign:'center', background:'rgba(45,90,158,0.4)', fontSize:13 }}>{fmtHHMM(totais.extras50)}</td>
                      <td style={{ padding:'10px 8px', textAlign:'center', background:'rgba(0,0,0,0.2)', fontSize:13 }}>{fmtHHMM(totais.total)}</td>
                      <td />
                    </tr>

                    {/* Linha 2: valores em R$ */}
                    {valorHora>0 && (
                      <tr style={{ background:'#0f2d4a', color:'#fff' }}>
                        <td colSpan={4} style={{ padding:'8px 14px', fontSize:12 }}>
                          <span style={{ opacity:0.8 }}>
                            {fmtDecimal(totais.normais)}h normais × R$ {valorHora.toFixed(4)}
                            &nbsp;+&nbsp;
                            {fmtDecimal(totais.extras50)}h extras/sáb × R$ {valorHora.toFixed(4)} × 1,5
                          </span>
                        </td>

                        {/* Valor Normal */}
                        <td colSpan={3} style={{ padding:'8px 10px', textAlign:'right' }}>
                          <div style={{ fontSize:10, opacity:0.6, marginBottom:1 }}>HORAS NORMAIS</div>
                          <div style={{ fontSize:14, fontWeight:700, color:'#86efac' }}>
                            {formatCurrency(valorNormal)}
                          </div>
                        </td>

                        {/* Valor Extra (+50%) */}
                        <td colSpan={3} style={{ padding:'8px 10px', textAlign:'right', background:'rgba(45,90,158,0.3)' }}>
                          <div style={{ fontSize:10, opacity:0.6, marginBottom:1 }}>EXTRAS / SÁB +50%</div>
                          <div style={{ fontSize:14, fontWeight:700, color:'#93c5fd' }}>
                            {formatCurrency(valorExtra)}
                          </div>
                        </td>

                        {/* Total */}
                        <td colSpan={3} style={{ padding:'8px 14px', textAlign:'right', background:'rgba(255,255,255,0.08)' }}>
                          <div style={{ fontSize:10, opacity:0.6, marginBottom:1 }}>💰 TOTAL A RECEBER</div>
                          <div style={{ fontSize:16, fontWeight:800, color:'#fbbf24' }}>
                            {formatCurrency(valorTotal)}
                          </div>
                        </td>
                      </tr>
                    )}

                    {valorHora === 0 && (
                      <tr style={{ background:'#0f2d4a', color:'#fff' }}>
                        <td colSpan={14} style={{ padding:'10px 14px', fontSize:12, opacity:0.6, textAlign:'center' }}>
                          Cadastre o salário do colaborador para calcular os valores a receber
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              )}
            </div>

            {/* ── Painel de Produção ──────────────────────────────────── */}
            {lancamentos.length > 0 && (
              <div style={{ flexShrink:0, borderTop:'2px solid #f59e0b', background:'#fffbeb' }}>
                <div style={{ padding:'8px 16px 4px', display:'flex', alignItems:'center', gap:8 }}>
                  <Factory size={14} style={{ color:'#b45309' }}/>
                  <span style={{ fontWeight:700, fontSize:13, color:'#92400e' }}>Produção lançada no mês</span>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#fef3c7' }}>
                      <th style={{ padding:'5px 16px', textAlign:'left', fontWeight:700, fontSize:11 }}>Serviço</th>
                      <th style={{ padding:'5px 8px',  textAlign:'left', fontWeight:700, fontSize:11 }}>Dias</th>
                      <th style={{ padding:'5px 8px',  textAlign:'right',fontWeight:700, fontSize:11 }}>Qtd</th>
                      <th style={{ padding:'5px 8px',  textAlign:'right',fontWeight:700, fontSize:11 }}>Preço unit.</th>
                      <th style={{ padding:'5px 16px', textAlign:'right',fontWeight:700, fontSize:11 }}>Total</th>
                      <th style={{ padding:'5px 8px',  width:40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentos.map(l => (
                      <tr key={l.id} style={{ borderTop:'1px solid #fde68a' }}>
                        <td style={{ padding:'6px 16px', fontWeight:600 }}>{l.playbook_item?.descricao ?? '—'}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, color:'#92400e' }}>{l.dias.map(d=>d.slice(8)+'/'+d.slice(5,7)).join(', ')}</td>
                        <td style={{ padding:'6px 8px', textAlign:'right' }}>{l.quantidade} {l.playbook_item?.unidade}</td>
                        <td style={{ padding:'6px 8px', textAlign:'right', color:'#92400e' }}>R$ {(l.playbook_item?.preco_unitario??0).toFixed(2)}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', fontWeight:700, color:'#b45309' }}>{formatCurrency(l.valor_total)}</td>
                        <td style={{ padding:'6px 8px' }}>
                          <button onClick={()=>l.id && deletarLanc(l.id)} style={{ border:'none', background:'none', cursor:'pointer', color:'#ef4444', padding:2 }}>
                            <Trash2 size={13}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#fde68a', fontWeight:700 }}>
                      <td colSpan={4} style={{ padding:'8px 16px' }}>Total apurado por produção</td>
                      <td style={{ padding:'8px 16px', textAlign:'right', fontSize:14, color:'#92400e' }}>
                        {formatCurrency(lancamentos.reduce((s,l)=>s+l.valor_total,0))}
                      </td>
                      <td/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ── Resumo financeiro com regra CLT/Autônomo ─────────── */}
            {resumoFinanceiro && (
              <div style={{ flexShrink:0, borderTop:'2px solid #1e3a5f', background:'#0f2d4a', color:'#fff', padding:'10px 16px' }}>
                {resumoFinanceiro.tipo === 'autonomo' ? (
                  <div style={{ display:'flex', gap:24, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:11, opacity:0.7 }}>AUTÔNOMO / PJ</span>
                    <span>🕐 Horas sem produção: <strong>{formatCurrency(resumoFinanceiro.valorHorasSemProd)}</strong></span>
                    <span>🏗️ Produção: <strong>{formatCurrency(resumoFinanceiro.totalProd)}</strong></span>
                    <span style={{ marginLeft:'auto', fontSize:16, fontWeight:800, color:'#fbbf24' }}>
                      💰 TOTAL: {formatCurrency(resumoFinanceiro.totalPagar)}
                    </span>
                  </div>
                ) : (
                  <div style={{ display:'flex', gap:24, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:11, opacity:0.7 }}>CLT</span>
                    <span>🕐 Horas base: <strong style={{ color:'#86efac' }}>{formatCurrency(resumoFinanceiro.valorHoraTotal)}</strong></span>
                    <span>🏗️ Produção apurada: <strong style={{ color:'#fcd34d' }}>{formatCurrency(resumoFinanceiro.totalProd)}</strong></span>
                    {resumoFinanceiro.premio > 0 && (
                      <span>🏆 Prêmio (excedente): <strong style={{ color:'#f59e0b' }}>+{formatCurrency(resumoFinanceiro.premio)}</strong></span>
                    )}
                    <span style={{ marginLeft:'auto', fontSize:16, fontWeight:800, color:'#fbbf24' }}>
                      💰 TOTAL: {formatCurrency(resumoFinanceiro.totalPagar)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  {/* ═══════ MODAL DE LANÇAMENTO DE PRODUÇÃO ════════════════════════════════ */}
  {modalProd && colabSel && (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--background)', borderRadius:14, width:680, maxHeight:'85vh', overflow:'auto', boxShadow:'0 24px 80px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div style={{ padding:'18px 24px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <Factory size={18} style={{ color:'#b45309' }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:16 }}>Lançar Produção</div>
            <div style={{ fontSize:12, color:'var(--muted-foreground)' }}>{colabSel.nome} · {MESES[mes-1]}/{ano}</div>
          </div>
          <button onClick={()=>setModalProd(false)} style={{ border:'none', background:'none', cursor:'pointer' }}><X size={18}/></button>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* Seleção de dias */}
          <div>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>
              1. Selecione os dias de produção
              <span style={{ fontWeight:400, fontSize:11, color:'var(--muted-foreground)', marginLeft:8 }}>
                (dias com atestado ou suspensão não estão disponíveis)
              </span>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {dias.filter(d => !isFDS(d.data) && d.evento !== 'atestado' && d.evento !== 'suspensao' && d.presente).map(d => {
                const sel = diasSel.has(d.data)
                return (
                  <button key={d.data} onClick={() => {
                    setDiasSel(prev => {
                      const next = new Set(prev)
                      sel ? next.delete(d.data) : next.add(d.data)
                      return next
                    })
                  }} style={{
                    padding:'4px 10px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', border:'2px solid',
                    borderColor: sel ? '#b45309' : 'var(--border)',
                    background:  sel ? '#fef3c7' : 'transparent',
                    color:       sel ? '#92400e' : 'var(--foreground)',
                  }}>
                    {d.data.slice(8)}/{d.data.slice(5,7)} {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(d.data+'T12:00:00').getDay()]}
                  </button>
                )
              })}
              {dias.filter(d => !isFDS(d.data) && d.evento !== 'atestado' && d.evento !== 'suspensao' && d.presente).length === 0 && (
                <span style={{ fontSize:12, color:'var(--muted-foreground)' }}>Nenhum dia com presença disponível para produção</span>
              )}
            </div>
          </div>

          {/* Itens de produção */}
          <div>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>2. Informe os serviços produzidos</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {itensProd.map((item, idx) => {
                const pb = playbookItens.find(p => p.id === item.playbook_item_id)
                const valorCalc = pb ? pb.preco_unitario * item.quantidade : 0
                return (
                  <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 130px 120px 32px', gap:8, alignItems:'center' }}>
                    <select value={item.playbook_item_id} onChange={e => setItensProd(prev => prev.map((it,i) => i===idx ? {...it, playbook_item_id:e.target.value} : it))}
                      style={{ padding:'7px 10px', fontSize:13, border:'1px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)' }}>
                      <option value="">— Selecionar serviço —</option>
                      {playbookItens.map(p => <option key={p.id} value={p.id}>{p.descricao} ({p.unidade})</option>)}
                    </select>
                    <div style={{ display:'flex', flexDirection:'column' }}>
                      <input type="number" min="0" step="0.01" placeholder={`Qtd (${pb?.unidade??'un'})`}
                        value={item.quantidade || ''}
                        onChange={e => setItensProd(prev => prev.map((it,i) => i===idx ? {...it, quantidade:parseFloat(e.target.value)||0} : it))}
                        style={{ padding:'7px 10px', fontSize:13, border:'1px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', textAlign:'right' }}
                      />
                    </div>
                    <div style={{ textAlign:'right', fontWeight:700, color:'#b45309', fontSize:13 }}>
                      {valorCalc > 0 ? formatCurrency(valorCalc) : '—'}
                    </div>
                    <button onClick={() => setItensProd(prev => prev.filter((_,i) => i!==idx))}
                      disabled={itensProd.length<=1}
                      style={{ border:'none', background:'none', cursor:'pointer', color:'#ef4444', opacity: itensProd.length<=1?0.3:1 }}>
                      <X size={14}/>
                    </button>
                  </div>
                )
              })}
              <Button variant="outline" size="sm" onClick={() => setItensProd(prev => [...prev, { playbook_item_id: playbookItens[0]?.id??'', quantidade:0 }])} style={{ width:'fit-content', gap:4, fontSize:12 }}>
                <Plus size={12}/> Adicionar serviço
              </Button>
            </div>
          </div>

          {/* Resumo do modal */}
          {diasSel.size > 0 && itensProd.some(i=>i.quantidade>0) && (() => {
            const totalProd = itensProd.reduce((s,i) => {
              const pb = playbookItens.find(p=>p.id===i.playbook_item_id)
              return s + (pb ? pb.preco_unitario * i.quantidade : 0)
            }, 0)
            return (
              <div style={{ background:'#fef3c7', borderRadius:8, padding:'12px 16px', border:'1px solid #fde68a' }}>
                <div style={{ fontSize:12, color:'#92400e', marginBottom:4 }}>
                  <strong>{diasSel.size}</strong> dias selecionados · <strong>{itensProd.filter(i=>i.quantidade>0).length}</strong> serviço(s)
                </div>
                <div style={{ fontSize:16, fontWeight:800, color:'#b45309' }}>
                  Total de produção: {formatCurrency(totalProd)}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Footer modal */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end' }}>
          <Button variant="outline" onClick={()=>setModalProd(false)}>Cancelar</Button>
          <Button onClick={salvarProducao} disabled={savingProd} style={{ background:'#b45309', color:'#fff' }}>
            {savingProd ? '⏳ Salvando…' : '🏗️ Salvar Produção'}
          </Button>
        </div>
      </div>
    </div>
  )}
  </>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const TH: React.CSSProperties = { padding:'8px 5px', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.04em', textAlign:'center', whiteSpace:'nowrap' }
const TD: React.CSSProperties = { padding:'3px 4px' }

function TI({ value, onChange, disabled }: { value: string; onChange:(v:string)=>void; disabled:boolean }) {
  return (
    <input type="time" value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}
      style={{
        width:78, padding:'3px 4px', fontSize:12,
        border:'1px solid var(--border)', borderRadius:4,
        background: disabled?'transparent':'var(--background)',
        color: disabled?'#9ca3af':'var(--foreground)',
        fontFamily:'monospace', textAlign:'center',
        cursor: disabled?'not-allowed':'text', outline:'none',
      }}
    />
  )
}
