import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, Clock, DollarSign, Users, ChevronDown, ChevronRight,
  Lock, Unlock, Search, Building2, AlertCircle, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StatusLanc = 'aguardando_aprovacao' | 'aprovado' | 'em_fechamento' | 'pago'

interface LancItem {
  id: string
  colaborador_id: string
  colaborador_nome: string
  colaborador_chapa: string | null
  funcao_nome: string
  tipo_contrato: string
  obra_id: string
  obra_nome: string
  mes_referencia: string
  data_inicio: string
  data_fim: string
  status: StatusLanc
  horas_normais: number
  horas_extras: number
  valor_horas: number
  valor_producao: number
  valor_total: number
  dias_trabalhados: number
}

interface Fechamento {
  id: string
  periodo_inicio: string
  periodo_fim: string
  status: 'aberto' | 'fechado' | 'pago'
  total_colaboradores: number
  total_lancamentos: number
  valor_total: number
  criado_em: string
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtHHMM(horas: number): string {
  const h = Math.floor(horas); const m = Math.round((horas - h) * 60)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function FechamentoPonto() {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [busca, setBusca] = useState('')
  const [tabAtiva, setTabAtiva] = useState<'pendentes' | 'fechamentos'>('pendentes')

  // Lançamentos aprovados pendentes de fechamento
  const [lancamentos, setLancamentos] = useState<LancItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selLancs, setSelLancs] = useState<Set<string>>(new Set())
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  // Fechamentos criados
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([])
  const [loadingFech, setLoadingFech] = useState(false)

  // Modals
  const [modalCriar, setModalCriar] = useState(false)
  const [modalRecusar, setModalRecusar] = useState<string | null>(null)
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [saving, setSaving] = useState(false)

  const mesRef = `${ano}-${String(mes).padStart(2, '0')}`

  // ── Fetch lançamentos aprovados ──────────────────────────────────────────
  const fetchLancamentos = useCallback(async (mr: string) => {
    setLoading(true)
    const { data: lancsRaw } = await supabase
      .from('ponto_lancamentos')
      .select(`
        id, colaborador_id, obra_id, mes_referencia, data_inicio, data_fim, status,
        colaboradores(nome, chapa, tipo_contrato, funcoes(nome)),
        obras(nome)
      `)
      .in('status', ['aprovado', 'em_fechamento'])
      .eq('mes_referencia', mr)
      .order('data_inicio')

    if (!lancsRaw) { setLoading(false); return }

    // Buscar pontos e produção para cada lançamento
    const ids = lancsRaw.map((l: any) => l.id)
    const [{ data: pontosRaw }, { data: prodRaw }] = await Promise.all([
      ids.length ? supabase.from('registro_ponto').select('lancamento_id,horas_trabalhadas,horas_extras').in('lancamento_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('ponto_producao').select('lancamento_id,valor_total').in('lancamento_id', ids) : Promise.resolve({ data: [] }),
    ])

    // Buscar valor/hora por função + contrato
    const funcaoIds = [...new Set(lancsRaw.map((l: any) => l.colaboradores?.funcao_id).filter(Boolean))]
    const { data: valorHoraRaw } = funcaoIds.length
      ? await supabase.from('funcao_valores').select('funcao_id,tipo_contrato,valor_hora').in('funcao_id', funcaoIds)
      : { data: [] as {funcao_id:string;tipo_contrato:string;valor_hora:number}[] }

    const mapaValorH: Record<string, number> = {}
    ;(valorHoraRaw ?? []).forEach((v: any) => { mapaValorH[`${v.funcao_id}_${v.tipo_contrato}`] = v.valor_hora })

    // Agregar por lançamento
    const mapaHoras: Record<string, { norm: number; extra: number; dias: number }> = {}
    ;(pontosRaw ?? []).forEach((p: any) => {
      if (!mapaHoras[p.lancamento_id]) mapaHoras[p.lancamento_id] = { norm: 0, extra: 0, dias: 0 }
      mapaHoras[p.lancamento_id].norm += (p.horas_trabalhadas ?? 0)
      mapaHoras[p.lancamento_id].extra += (p.horas_extras ?? 0)
      mapaHoras[p.lancamento_id].dias += 1
    })
    const mapaProd: Record<string, number> = {}
    ;(prodRaw ?? []).forEach((p: any) => {
      mapaProd[p.lancamento_id] = (mapaProd[p.lancamento_id] ?? 0) + p.valor_total
    })

    const lista: LancItem[] = lancsRaw.map((l: any) => {
      const colab = l.colaboradores
      const horasAgg = mapaHoras[l.id] ?? { norm: 0, extra: 0, dias: 0 }
      const vh = mapaValorH[`${colab?.funcao_id}_${colab?.tipo_contrato}`] ?? 0
      const valorHoras = horasAgg.norm * vh + horasAgg.extra * vh * 1.5
      const valorProd = mapaProd[l.id] ?? 0
      return {
        id: l.id,
        colaborador_id: l.colaborador_id,
        colaborador_nome: colab?.nome ?? '—',
        colaborador_chapa: colab?.chapa ?? null,
        funcao_nome: colab?.funcoes?.nome ?? '—',
        tipo_contrato: colab?.tipo_contrato ?? 'clt',
        obra_id: l.obra_id,
        obra_nome: l.obras?.nome ?? '—',
        mes_referencia: l.mes_referencia,
        data_inicio: l.data_inicio,
        data_fim: l.data_fim,
        status: l.status,
        horas_normais: horasAgg.norm,
        horas_extras: horasAgg.extra,
        valor_horas: valorHoras,
        valor_producao: valorProd,
        valor_total: valorHoras + valorProd,
        dias_trabalhados: horasAgg.dias,
      }
    })
    setLancamentos(lista)
    setLoading(false)
  }, [])

  // ── Fetch fechamentos ─────────────────────────────────────────────────────
  const fetchFechamentos = useCallback(async (mr: string) => {
    setLoadingFech(true)
    const { data } = await supabase
      .from('ponto_fechamentos')
      .select('*')
      .order('criado_em', { ascending: false })
    setFechamentos((data ?? []) as Fechamento[])
    setLoadingFech(false)
  }, [])

  useEffect(() => {
    fetchLancamentos(mesRef)
    fetchFechamentos(mesRef)
  }, [mesRef, fetchLancamentos, fetchFechamentos])

  // ── Agrupamento por colaborador ───────────────────────────────────────────
  const porColaborador = useMemo(() => {
    const q = busca.toLowerCase()
    const filtrados = lancamentos.filter(l =>
      !q || l.colaborador_nome.toLowerCase().includes(q) ||
      (l.colaborador_chapa ?? '').toLowerCase().includes(q) ||
      l.obra_nome.toLowerCase().includes(q)
    )
    const mapa: Record<string, { nome: string; chapa: string | null; funcao: string; tipo: string; lancs: LancItem[] }> = {}
    filtrados.forEach(l => {
      if (!mapa[l.colaborador_id]) mapa[l.colaborador_id] = { nome: l.colaborador_nome, chapa: l.colaborador_chapa, funcao: l.funcao_nome, tipo: l.tipo_contrato, lancs: [] }
      mapa[l.colaborador_id].lancs.push(l)
    })
    return Object.entries(mapa).map(([id, v]) => ({
      id, ...v,
      totalHoras: v.lancs.reduce((s, l) => s + l.horas_normais + l.horas_extras, 0),
      totalValor: v.lancs.reduce((s, l) => s + l.valor_total, 0),
      todos_aprovados: v.lancs.every(l => l.status === 'aprovado'),
    }))
  }, [lancamentos, busca])

  const totalGeral = useMemo(() => lancamentos.reduce((s, l) => s + l.valor_total, 0), [lancamentos])

  // ── Recusar lançamento ────────────────────────────────────────────────────
  async function recusarLanc(id: string) {
    const { error } = await supabase.from('ponto_lancamentos').update({
      status: 'recusado', motivo_recusa: motivoRecusa || 'Recusado no fechamento',
    }).eq('id', id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Lançamento devolvido para edição')
    setModalRecusar(null)
    setMotivoRecusa('')
    fetchLancamentos(mesRef)
  }

  // ── Criar fechamento ──────────────────────────────────────────────────────
  async function criarFechamento() {
    const ids = Array.from(selLancs)
    if (ids.length === 0) { toast.error('Selecione ao menos um lançamento'); return }
    const aprovados = lancamentos.filter(l => ids.includes(l.id) && l.status === 'aprovado')
    if (aprovados.length === 0) { toast.error('Nenhum lançamento aprovado selecionado'); return }

    setSaving(true)
    const total = aprovados.reduce((s, l) => s + l.valor_total, 0)
    const colabs = new Set(aprovados.map(l => l.colaborador_id)).size

    const { data: fech, error: eF } = await supabase.from('ponto_fechamentos').insert({
      mes_referencia: mesRef,
      periodo_inicio: aprovados.reduce((min, l) => l.data_inicio < min ? l.data_inicio : min, aprovados[0].data_inicio),
      periodo_fim: aprovados.reduce((max, l) => l.data_fim > max ? l.data_fim : max, aprovados[0].data_fim),
      status: 'aberto',
      total_colaboradores: colabs,
      total_lancamentos: aprovados.length,
      valor_total: total,
    }).select().single()

    if (eF) { toast.error('Erro: ' + eF.message); setSaving(false); return }

    // Atualizar status dos lançamentos para em_fechamento
    const { error: eL } = await supabase.from('ponto_lancamentos')
      .update({ status: 'em_fechamento', fechamento_id: fech.id })
      .in('id', aprovados.map(l => l.id))

    setSaving(false)
    if (eL) { toast.error('Erro ao vincular lançamentos: ' + eL.message); return }
    toast.success(`Fechamento criado com ${aprovados.length} lançamento(s)!`)
    setModalCriar(false)
    setSelLancs(new Set())
    fetchLancamentos(mesRef)
    fetchFechamentos(mesRef)
  }

  // ── Liberar para pagamento ────────────────────────────────────────────────
  async function liberarPagamento(fechId: string) {
    if (!confirm('Liberar este fechamento para pagamento? Os lançamentos serão marcados como pagos.')) return
    await supabase.from('ponto_fechamentos').update({ status: 'pago' }).eq('id', fechId)
    await supabase.from('ponto_lancamentos').update({ status: 'pago' }).eq('fechamento_id', fechId)
    toast.success('Liberado para pagamento!')
    fetchFechamentos(mesRef)
    fetchLancamentos(mesRef)
  }

  const aprovadosPendentes = lancamentos.filter(l => l.status === 'aprovado')

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader
        title="Fechamento de Ponto"
        subtitle="Consolidação e aprovação final dos registros para pagamento"
        action={
          aprovadosPendentes.length > 0 ? (
            <Button className="gap-2" onClick={() => { setSelLancs(new Set(aprovadosPendentes.map(l => l.id))); setModalCriar(true) }}>
              <Lock size={14} /> Criar Fechamento
            </Button>
          ) : undefined
        }
      />

      {/* ── Filtros + Abas ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Mês/Ano */}
        <div className="flex items-center gap-2">
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Busca */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Colaborador, obra…" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>

        {/* Abas */}
        <div className="flex rounded-lg overflow-hidden border border-border text-sm">
          {(['pendentes', 'fechamentos'] as const).map(tab => (
            <button key={tab} onClick={() => setTabAtiva(tab)} className="px-4 py-1.5 font-medium transition-colors"
              style={{ background: tabAtiva === tab ? 'var(--primary)' : 'transparent', color: tabAtiva === tab ? '#fff' : 'var(--foreground)' }}>
              {tab === 'pendentes' ? `Aprovados (${aprovadosPendentes.length})` : `Fechamentos (${fechamentos.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cards de resumo ── */}
      {tabAtiva === 'pendentes' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { icon: <Users size={16} />, label: 'Colaboradores', value: porColaborador.length, color: '#1d4ed8', bg: '#dbeafe' },
            { icon: <Clock size={16} />, label: 'Lançamentos', value: lancamentos.length, color: '#7c3aed', bg: '#ede9fe' },
            { icon: <CheckCircle2 size={16} />, label: 'Aprovados', value: aprovadosPendentes.length, color: '#15803d', bg: '#dcfce7' },
            { icon: <DollarSign size={16} />, label: 'Total a Pagar', value: formatCurrency(totalGeral), color: '#b45309', bg: '#fef3c7' },
          ].map(card => (
            <div key={card.label} className="rounded-xl border border-border p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: card.bg, color: card.color }}>
                {card.icon}
              </div>
              <div>
                <div className="text-xs text-muted-foreground font-medium">{card.label}</div>
                <div className="text-lg font-bold" style={{ color: card.color }}>{card.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════ ABA: APROVADOS PENDENTES ══════ */}
      {tabAtiva === 'pendentes' && (
        loading ? <LoadingSkeleton rows={4} /> :
        porColaborador.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={28} />}
            title="Nenhum lançamento aprovado pendente"
            description="Aprove lançamentos no Controle de Ponto para que apareçam aqui."
          />
        ) : (
          <div className="space-y-3">
            {porColaborador.map(colab => {
              const exp = expandidos.has(colab.id)
              return (
                <div key={colab.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  {/* Cabeçalho colaborador */}
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50"
                    style={{ background: 'var(--muted)' }}
                    onClick={() => setExpandidos(p => { const n = new Set(p); exp ? n.delete(colab.id) : n.add(colab.id); return n })}>
                    {exp ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{colab.nome}</span>
                        {colab.chapa && <span className="text-xs font-mono text-muted-foreground">#{colab.chapa}</span>}
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium uppercase"
                          style={{ background: 'var(--muted)', fontSize: 10 }}>{colab.tipo}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{colab.funcao} · {colab.lancs.length} lançamento{colab.lancs.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="text-right mr-2">
                      <div className="text-xs text-muted-foreground">{fmtHHMM(colab.totalHoras)}h</div>
                      <div className="font-bold text-sm" style={{ color: '#15803d' }}>{formatCurrency(colab.totalValor)}</div>
                    </div>
                    {colab.todos_aprovados && (
                      <Button size="sm" className="h-7 text-xs gap-1" style={{ background: '#15803d' }}
                        onClick={e => { e.stopPropagation(); setSelLancs(new Set(colab.lancs.map(l => l.id))); setModalCriar(true) }}>
                        <Lock size={11} /> Fechar
                      </Button>
                    )}
                  </div>

                  {/* Lançamentos do colaborador */}
                  {exp && (
                    <Table>
                      <TableHeader>
                        <TableRow style={{ background: 'var(--muted)' }}>
                          {['Obra', 'Período', 'Dias', 'H.Norm', 'H.Extra', 'Vl.Horas', 'Produção', 'Total', 'Status', ''].map((h, i) => (
                            <TableHead key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', textAlign: i >= 2 ? 'center' : undefined, width: i === 9 ? 80 : undefined }}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {colab.lancs.map(l => (
                          <TableRow key={l.id} className="hover:bg-muted/30">
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Building2 size={12} className="text-muted-foreground" />
                                <span className="text-sm font-medium">{l.obra_nome}</span>
                              </div>
                            </TableCell>
                            <TableCell style={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                              {l.data_inicio.slice(8)}/{l.data_inicio.slice(5, 7)} → {l.data_fim.slice(8)}/{l.data_fim.slice(5, 7)}
                            </TableCell>
                            <TableCell style={{ textAlign: 'center', fontSize: 12 }}>{l.dias_trabalhados}</TableCell>
                            <TableCell style={{ textAlign: 'center', fontSize: 12, fontFamily: 'monospace' }}>{fmtHHMM(l.horas_normais)}</TableCell>
                            <TableCell style={{ textAlign: 'center', fontSize: 12, fontFamily: 'monospace', color: l.horas_extras > 0 ? '#1d4ed8' : undefined }}>{fmtHHMM(l.horas_extras)}</TableCell>
                            <TableCell style={{ textAlign: 'center', fontWeight: 600, fontSize: 12 }}>{l.valor_horas > 0 ? formatCurrency(l.valor_horas) : '—'}</TableCell>
                            <TableCell style={{ textAlign: 'center', fontWeight: 600, fontSize: 12, color: l.valor_producao > 0 ? '#b45309' : undefined }}>{l.valor_producao > 0 ? formatCurrency(l.valor_producao) : '—'}</TableCell>
                            <TableCell style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#15803d' }}>{formatCurrency(l.valor_total)}</TableCell>
                            <TableCell style={{ textAlign: 'center' }}>
                              {l.status === 'aprovado'
                                ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dcfce7', color: '#15803d' }}>✅ Aprovado</span>
                                : <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>🔒 Em fechamento</span>
                              }
                            </TableCell>
                            <TableCell>
                              {l.status === 'aprovado' && (
                                <Button variant="ghost" size="icon" style={{ width: 28, height: 28, color: 'var(--destructive)' }}
                                  title="Recusar — devolver para edição"
                                  onClick={() => { setModalRecusar(l.id); setMotivoRecusa('') }}>
                                  <X size={13} />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      {/* Rodapé totais */}
                      <tfoot>
                        <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                          <td colSpan={4} style={{ padding: '8px 16px', fontWeight: 700, fontSize: 12 }}>Total do colaborador</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: 12, fontFamily: 'monospace' }}>{fmtHHMM(colab.lancs.reduce((s, l) => s + l.horas_extras, 0))}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700 }}>{formatCurrency(colab.lancs.reduce((s, l) => s + l.valor_horas, 0))}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#fcd34d' }}>{formatCurrency(colab.lancs.reduce((s, l) => s + l.valor_producao, 0))}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#86efac' }}>{formatCurrency(colab.totalValor)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </Table>
                  )}
                </div>
              )
            })}

            {/* Total geral */}
            {porColaborador.length > 1 && (
              <div className="flex items-center justify-between px-5 py-3 rounded-xl"
                style={{ background: '#1e3a5f', color: '#fff' }}>
                <div className="flex items-center gap-2">
                  <DollarSign size={16} style={{ color: '#fbbf24' }} />
                  <span className="font-bold">Total Geral a Pagar</span>
                  <span className="text-sm opacity-70">— {lancamentos.length} lançamentos · {porColaborador.length} colaboradores</span>
                </div>
                <span className="text-xl font-bold" style={{ color: '#fbbf24' }}>{formatCurrency(totalGeral)}</span>
              </div>
            )}
          </div>
        )
      )}

      {/* ══════ ABA: FECHAMENTOS ══════ */}
      {tabAtiva === 'fechamentos' && (
        loadingFech ? <LoadingSkeleton rows={3} /> :
        fechamentos.length === 0 ? (
          <EmptyState
            icon={<Lock size={28} />}
            title="Nenhum fechamento criado"
            description="Selecione lançamentos aprovados e clique em Criar Fechamento."
          />
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: 'var(--muted)' }}>
                  {['Criado em', 'Período', 'Colaboradores', 'Lançamentos', 'Valor Total', 'Status', ''].map((h, i) => (
                    <TableHead key={i} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: i >= 2 ? 'center' : undefined }}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fechamentos.map(f => (
                  <TableRow key={f.id} className="hover:bg-muted/40">
                    <TableCell style={{ fontSize: 12 }}>{new Date(f.criado_em).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell style={{ fontSize: 11, fontFamily: 'monospace' }}>
                      {f.periodo_inicio ? `${new Date(f.periodo_inicio).toLocaleDateString('pt-BR')} → ${new Date(f.periodo_fim).toLocaleDateString('pt-BR')}` : '—'}
                    </TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <span className="flex items-center justify-center gap-1 text-sm">
                        <Users size={12} /> {f.total_colaboradores}
                      </span>
                    </TableCell>
                    <TableCell style={{ textAlign: 'center', fontSize: 12 }}>{f.total_lancamentos}</TableCell>
                    <TableCell style={{ textAlign: 'center', fontWeight: 700, color: '#15803d' }}>{formatCurrency(f.valor_total)}</TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      {f.status === 'pago'
                        ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dcfce7', color: '#15803d' }}>✅ Pago</span>
                        : f.status === 'fechado'
                          ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>🔒 Fechado</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fef3c7', color: '#92400e' }}>📋 Aberto</span>
                      }
                    </TableCell>
                    <TableCell>
                      {f.status !== 'pago' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" style={{ borderColor: '#15803d', color: '#15803d' }}
                          onClick={() => liberarPagamento(f.id)}>
                          <Unlock size={11} /> Liberar Pgto
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* ═══ MODAL CRIAR FECHAMENTO ═══ */}
      <Dialog open={modalCriar} onOpenChange={setModalCriar}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock size={16} style={{ color: '#1d4ed8' }} /> Criar Fechamento de Ponto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg text-sm" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
              <AlertCircle size={14} className="inline mr-1" />
              Após criar o fechamento, os lançamentos selecionados serão <strong>bloqueados para edição</strong> e ficam aguardando liberação para pagamento.
            </div>
            <div>
              <div className="text-sm font-semibold mb-2">Lançamentos selecionados: {selLancs.size}</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {lancamentos.filter(l => selLancs.has(l.id)).map(l => (
                  <div key={l.id} className="flex items-center justify-between text-xs py-1 px-2 rounded" style={{ background: 'var(--muted)' }}>
                    <span className="font-medium">{l.colaborador_nome}</span>
                    <span className="text-muted-foreground">{l.obra_nome}</span>
                    <span className="font-bold" style={{ color: '#15803d' }}>{formatCurrency(l.valor_total)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg font-bold" style={{ background: '#dcfce7', color: '#15803d' }}>
              <span>Total do Fechamento</span>
              <span className="text-lg">{formatCurrency(lancamentos.filter(l => selLancs.has(l.id)).reduce((s, l) => s + l.valor_total, 0))}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCriar(false)}>Cancelar</Button>
            <Button onClick={criarFechamento} disabled={saving} className="gap-2">
              {saving ? '⏳ Criando…' : <><Lock size={13} /> Confirmar Fechamento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL RECUSAR ═══ */}
      <AlertDialog open={!!modalRecusar} onOpenChange={open => !open && setModalRecusar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O lançamento será devolvido para edição com o motivo informado abaixo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label>Motivo da recusa</Label>
            <Input className="mt-1" placeholder="Ex: Horários inconsistentes, falta de registros…"
              value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => modalRecusar && recusarLanc(modalRecusar)}
              style={{ background: 'var(--destructive)', color: '#fff' }}>
              Recusar e Devolver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
