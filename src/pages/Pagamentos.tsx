import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Pagamento, Colaborador, Obra } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader, BadgeStatus, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { traduzirErro } from '@/lib/erros'
import {
  DollarSign, Plus, Search, Pencil, Trash2, CheckCircle, RotateCcw, Calendar, Building2, Clock,
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type PagamentoRow = Pagamento & {
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
}

type FormData = {
  colaborador_id: string
  obra_id: string
  competencia: string
  data_pagamento: string
  tipo: string
  valor_bruto: string
  inss: string
  fgts: string
  ir: string
  vale_transporte: string
  adiantamento: string
  valor_liquido: string
  status: string
  observacoes: string
}

const TIPO_OPTIONS = [
  { value: 'folha', label: 'Folha' },
  { value: 'adiantamento', label: 'Adiantamento' },
  { value: '13_salario', label: '13º Salário' },
  { value: 'ferias', label: 'Férias' },
  { value: 'rescisao', label: 'Rescisão' },
  { value: 'vale_transporte', label: 'Vale Transporte' },
]

const STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'pago', label: 'Pago' },
  { value: 'cancelado', label: 'Cancelado' },
]

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  obra_id: '',
  competencia: new Date().toISOString().slice(0, 7),
  data_pagamento: '',
  tipo: 'folha',
  valor_bruto: '',
  inss: '',
  fgts: '',
  ir: '',
  vale_transporte: '',
  adiantamento: '',
  valor_liquido: '',
  status: 'pendente',
  observacoes: '',
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function calcLiquido(form: FormData): number {
  const bruto = parseFloat(form.valor_bruto) || 0
  const inss = parseFloat(form.inss) || 0
  const ir = parseFloat(form.ir) || 0
  const vt = parseFloat(form.vale_transporte) || 0
  const adiant = parseFloat(form.adiantamento) || 0
  return Math.max(0, bruto - inss - ir - vt - adiant)
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Pagamentos() {
  const [rows, setRows] = useState<PagamentoRow[]>([])
  const [colaboradores, setColaboradores] = useState<Pick<Colaborador, 'id' | 'nome' | 'chapa'>[]>([])
  const [obras, setObras] = useState<Pick<Obra, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const [filtroCompetencia, setFiltroCompetencia] = useState(new Date().toISOString().slice(0, 7))
  const [filtroColaborador, setFiltroColaborador] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<PagamentoRow | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── lançamentos liberados do Fechamento ────────────────────────────────────
  const [lancsPendentes, setLancsPendentes] = useState<any[]>([])
  const [loadingLancs, setLoadingLancs] = useState(false)

  // ── modal pagar lançamento ─────────────────────────────────────────────────
  const [modalPagarLanc, setModalPagarLanc] = useState<any | null>(null)
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10))
  const [obsPagamento, setObsPagamento] = useState('')
  const [savingPgto, setSavingPgto] = useState(false)

  // ── modal estornar ─────────────────────────────────────────────────────────
  const [modalEstornar, setModalEstornar] = useState<any | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [pagRes, colRes, obrRes] = await Promise.all([
      supabase
        .from('pagamentos')
        .select('*, colaboradores(nome,chapa)')
        .order('competencia', { ascending: false }),
      supabase
        .from('colaboradores')
        .select('id,nome,chapa')
        .eq('status', 'ativo')
        .order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    if (pagRes.error) toast.error('Erro ao carregar pagamentos')
    else setRows((pagRes.data as PagamentoRow[]) ?? [])
    if (colRes.data) setColaboradores(colRes.data)
    if (obrRes.data) setObras(obrRes.data)
    setLoading(false)
  }, [])

  // ─── fetch lançamentos liberados ───────────────────────────────────────────
  const fetchLancsPendentes = useCallback(async () => {
    setLoadingLancs(true)
    const { data } = await supabase
      .from('ponto_lancamentos')
      .select('id, colaborador_id, obra_id, mes_referencia, data_inicio, data_fim, status, motivo_recusa, data_pagamento, obs_pagamento, snap_liquido, snap_valor_total, snap_inss, snap_ir, snap_desconto_vt, snap_desconto_adiant, colaboradores(nome, chapa, tipo_contrato), obras(nome)')
      .in('status', ['liberado', 'pago'])
      .order('mes_referencia', { ascending: false })
    setLancsPendentes(data ?? [])
    setLoadingLancs(false)
  }, [])

  useEffect(() => { fetchData(); fetchLancsPendentes() }, [fetchData, fetchLancsPendentes])

  // ─── filtrar ───────────────────────────────────────────────────────────────
  const filtered = rows.filter((r) => {
    const matchComp = filtroCompetencia ? r.competencia === filtroCompetencia : true
    const matchCol = filtroColaborador
      ? r.colaboradores?.nome.toLowerCase().includes(filtroColaborador.toLowerCase())
      : true
    const matchTipo = filtroTipo !== 'todos' ? r.tipo === filtroTipo : true
    const matchStatus = filtroStatus !== 'todos' ? r.status === filtroStatus : true
    return matchComp && matchCol && matchTipo && matchStatus
  })

  // ─── totalizadores ─────────────────────────────────────────────────────────
  const totalBruto = filtered.reduce((s, r) => s + (r.valor_bruto ?? 0), 0)
  const totalLiquido = filtered.reduce((s, r) => s + (r.valor_liquido ?? 0), 0)
  const totalInss = filtered.reduce((s, r) => s + (r.inss ?? 0), 0)
  const totalFgts = filtered.reduce((s, r) => s + (r.fgts ?? 0), 0)

  // ─── modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(row: PagamentoRow) {
    setEditando(row)
    setForm({
      colaborador_id: row.colaborador_id,
      obra_id: row.obra_id ?? '',
      competencia: row.competencia,
      data_pagamento: row.data_pagamento ?? '',
      tipo: row.tipo ?? 'folha',
      valor_bruto: String(row.valor_bruto ?? ''),
      inss: String(row.inss ?? ''),
      fgts: String(row.fgts ?? ''),
      ir: String(row.ir ?? ''),
      vale_transporte: String(row.vale_transporte ?? ''),
      adiantamento: String(row.adiantamento ?? ''),
      valor_liquido: String(row.valor_liquido ?? ''),
      status: row.status,
      observacoes: row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  function setField(key: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      // recalcula líquido automaticamente
      const liquidoAuto = calcLiquido(next)
      return { ...next, valor_liquido: String(liquidoAuto) }
    })
  }

  // ─── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.competencia) return toast.error('Competência obrigatória')
    setSaving(true)
    const payload = {
      colaborador_id: form.colaborador_id,
      obra_id: form.obra_id || null,
      competencia: form.competencia,
      data_pagamento: form.data_pagamento || null,
      tipo: (form.tipo as Pagamento['tipo']) || null,
      valor_bruto: parseFloat(form.valor_bruto) || null,
      inss: parseFloat(form.inss) || 0,
      fgts: parseFloat(form.fgts) || 0,
      ir: parseFloat(form.ir) || 0,
      vale_transporte: parseFloat(form.vale_transporte) || 0,
      adiantamento: parseFloat(form.adiantamento) || 0,
      valor_liquido: parseFloat(form.valor_liquido) || null,
      status: form.status as Pagamento['status'],
      observacoes: form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('pagamentos').update(payload).eq('id', editando.id)
      : await supabase.from('pagamentos').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? 'Pagamento atualizado!' : 'Pagamento criado!')
    setModalOpen(false)
    fetchData()
  }

  // ─── marcar pago (tabela pagamentos) ──────────────────────────────────────
  async function marcarPago(id: string) {
    const hoje = new Date().toISOString().slice(0, 10)
    // Busca o registro para saber se é VT
    const row = rows.find(r => r.id === id)
    const { error } = await supabase
      .from('pagamentos')
      .update({ status: 'pago', data_pagamento: hoje })
      .eq('id', id)
    if (error) { toast.error('Erro ao confirmar pagamento: ' + error.message); return }
    // Se for VT, marca o vale_transporte como pago também
    if (row?.tipo === 'vale_transporte' && row.colaborador_id && row.competencia) {
      await supabase
        .from('vale_transporte')
        .update({ status: 'pago', data_pagamento: hoje })
        .eq('colaborador_id', row.colaborador_id)
        .eq('competencia', row.competencia)
        .eq('status', 'aguardando_pagamento')
    }
    toast.success('✅ Pagamento confirmado!')
    fetchData()
  }

  // ─── recusar pagamento de VT (devolve para pendente) ─────────────────────
  const [modalRecusarVT, setModalRecusarVT] = useState<PagamentoRow | null>(null)
  async function recusarPagamentoVT() {
    if (!modalRecusarVT) return
    setSavingPgto(true)
    // Exclui o registro de pagamento
    const { error: errDel } = await supabase
      .from('pagamentos').delete().eq('id', modalRecusarVT.id)
    if (errDel) { setSavingPgto(false); toast.error('Erro ao recusar: ' + errDel.message); return }
    // Devolve o VT para pendente
    if (modalRecusarVT.colaborador_id && modalRecusarVT.competencia) {
      await supabase
        .from('vale_transporte')
        .update({ status: 'pendente' })
        .eq('colaborador_id', modalRecusarVT.colaborador_id)
        .eq('competencia', modalRecusarVT.competencia)
        .eq('status', 'aguardando_pagamento')
    }
    setSavingPgto(false)
    setModalRecusarVT(null)
    toast.success('↩ Pagamento recusado — VT voltou para Pendente')
    fetchData()
  }

  // ─── efetivar pagamento de lançamento liberado ─────────────────────────────
  async function efetivarPagamento() {
    if (!modalPagarLanc) return
    setSavingPgto(true)
    const { error } = await supabase.from('ponto_lancamentos')
      .update({ status: 'pago', data_pagamento: dataPagamento, obs_pagamento: obsPagamento || null })
      .eq('id', modalPagarLanc.id)
    setSavingPgto(false)
    if (error) { toast.error('Erro ao efetivar: ' + error.message); return }
    toast.success('💰 Pagamento efetivado!')
    setModalPagarLanc(null); setObsPagamento('')
    fetchLancsPendentes()
  }

  // ─── estornar pagamento ────────────────────────────────────────────────────
  async function estornarPagamento() {
    if (!modalEstornar) return
    setSavingPgto(true)
    const { error } = await supabase.from('ponto_lancamentos')
      .update({ status: 'liberado', data_pagamento: null, obs_pagamento: motivoEstorno || 'Estornado' })
      .eq('id', modalEstornar.id)
    setSavingPgto(false)
    if (error) { toast.error('Erro ao estornar: ' + error.message); return }
    toast.success('↩ Pagamento estornado — voltou para Ag. Pagamento')
    setModalEstornar(null); setMotivoEstorno('')
    fetchLancsPendentes()
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const rowDel = rows.find(r => r.id === deleteId)
    const { error } = await supabase.from('pagamentos').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) { toast.error('Erro ao excluir'); return }
    // Se era VT aguardando, devolve para pendente
    if (rowDel?.tipo === 'vale_transporte' && rowDel.status === 'pendente' && rowDel.colaborador_id && rowDel.competencia) {
      await supabase
        .from('vale_transporte')
        .update({ status: 'pendente' })
        .eq('colaborador_id', rowDel.colaborador_id)
        .eq('competencia', rowDel.competencia)
        .eq('status', 'aguardando_pagamento')
    }
    toast.success('Pagamento excluído!')
    fetchData()
  }

  // ─── render ────────────────────────────────────────────────────────────────
  // ─── aba ativa ──────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<'agendados'|'realizados'>('agendados')

  // ─── filtros avulsos ─────────────────────────────────────────────────────────
  const [filtroNomeLanc, setFiltroNomeLanc]       = useState('')
  const [filtroDataIni, setFiltroDataIni]         = useState('')
  const [filtroDataFim, setFiltroDataFim]         = useState('')
  const [filtroMesLanc, setFiltroMesLanc]         = useState(new Date().toISOString().slice(0, 7))

  // ─── render ────────────────────────────────────────────────────────────────
  // Filtros lançamentos da folha
  const lancsAgendados  = lancsPendentes.filter(l => {
    const matchNome = filtroNomeLanc ? l.colaboradores?.nome?.toLowerCase().includes(filtroNomeLanc.toLowerCase()) : true
    const matchMes  = filtroMesLanc  ? l.mes_referencia === filtroMesLanc : true
    return l.status === 'liberado' && matchNome && matchMes
  })
  const lancsRealizados = lancsPendentes.filter(l => {
    const matchNome = filtroNomeLanc ? l.colaboradores?.nome?.toLowerCase().includes(filtroNomeLanc.toLowerCase()) : true
    const matchMes  = filtroMesLanc  ? l.mes_referencia === filtroMesLanc : true
    const matchDtIni = filtroDataIni ? (l.data_pagamento ?? '') >= filtroDataIni : true
    const matchDtFim = filtroDataFim ? (l.data_pagamento ?? '') <= filtroDataFim : true
    return l.status === 'pago' && matchNome && matchMes && matchDtIni && matchDtFim
  })

  const totalAgendado  = lancsAgendados.reduce((s: number, l: any) => s + (l.snap_liquido ?? l.valor_liquido ?? 0), 0)
  const totalRealizado = lancsRealizados.reduce((s: number, l: any) => s + (l.snap_liquido ?? l.valor_liquido ?? 0), 0)

  return (
    <div className="p-6">
      {/* Header — padrão do sistema */}
      <PageHeader
        title="💰 Pagamentos"
        subtitle="Lançamentos liberados da folha e pagamentos avulsos"
        action={
          <Button onClick={openCreate} className="gap-2">
            <Plus size={15} /> Pagamento Avulso
          </Button>
        }
      />

      {/* Cards resumo — padrão var(--card) / var(--border) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { icon: <Clock size={16}/>,       label: 'Agendados',       value: `${lancsPendentes.filter(l=>l.status==='liberado').length} lançamento(s)`,  color:'#b45309' },
          { icon: <CheckCircle size={16}/>, label: 'Realizados (mês)', value: `${lancsPendentes.filter(l=>l.status==='pago'&&l.mes_referencia===filtroMesLanc).length} lançamento(s)`, color:'#15803d' },
          { icon: <DollarSign size={16}/>,  label: 'Avulsos',         value: `${rows.length} registro(s)`,  color:'#7c3aed' },
        ].map((c,i) => (
          <div key={i} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, color:c.color, marginBottom:4 }}>
              {c.icon}<span style={{ fontSize:11, fontWeight:600 }}>{c.label}</span>
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Abas — padrão do sistema */}
      <div className="flex gap-0 mb-0" style={{ borderBottom:'2px solid var(--border)' }}>
        {([
          { key:'agendados',  label:'⏳ Agendados',  count: lancsPendentes.filter(l=>l.status==='liberado').length },
          { key:'realizados', label:'✅ Realizados', count: lancsPendentes.filter(l=>l.status==='pago').length + rows.filter(r=>r.status==='pago').length },
        ] as {key:'agendados'|'realizados';label:string;count:number}[]).map(tab => (
          <button key={tab.key} onClick={()=>setAba(tab.key)}
            style={{
              padding:'10px 20px', fontSize:13, fontWeight: aba===tab.key?700:500,
              border:'none', background:'transparent', cursor:'pointer',
              borderBottom: aba===tab.key?'2px solid var(--primary)':'2px solid transparent',
              color: aba===tab.key?'var(--primary)':'var(--muted-foreground)', marginBottom:-2,
            }}>
            {tab.label}
            <span style={{ marginLeft:6, fontSize:11, background: aba===tab.key?'hsl(var(--primary)/.1)':'var(--muted)', color: aba===tab.key?'var(--primary)':'var(--muted-foreground)', borderRadius:10, padding:'1px 7px', fontWeight:600 }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filtros — padrão do sistema com componentes Select/Input */}
      <div className="flex flex-wrap items-end gap-3 py-4 mb-4" style={{ borderBottom:'1px solid var(--border)' }}>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Competência</label>
          <input type="month" value={filtroMesLanc} onChange={e=>setFiltroMesLanc(e.target.value)}
            className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground" />
        </div>
        <div className="relative">
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Colaborador</label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="Buscar nome..." value={filtroNomeLanc} onChange={e=>setFiltroNomeLanc(e.target.value)}
              className="h-9 pl-8 pr-3 text-sm border border-input rounded-md bg-background text-foreground w-48" />
          </div>
        </div>
        {aba==='realizados' && (<>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Data pgto de</label>
            <input type="date" value={filtroDataIni} onChange={e=>setFiltroDataIni(e.target.value)}
              className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">até</label>
            <input type="date" value={filtroDataFim} onChange={e=>setFiltroDataFim(e.target.value)}
              className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground" />
          </div>
        </>)}
        {(filtroNomeLanc||filtroDataIni||filtroDataFim) && (
          <Button variant="outline" size="sm" onClick={()=>{setFiltroNomeLanc('');setFiltroDataIni('');setFiltroDataFim('')}}>
            ✕ Limpar
          </Button>
        )}
      </div>

      {/* ══ ABA AGENDADOS ══ */}
      {aba === 'agendados' && (
        loadingLancs ? <LoadingSkeleton /> : <>

          {/* ── Lançamentos da Folha ── */}
          {lancsAgendados.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 1 }}>📄 Folha de Ponto</h3>
            <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead className="text-center">Período</TableHead>
                  <TableHead className="text-center">Competência</TableHead>
                  <TableHead className="text-right">💵 Líquido</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancsAgendados.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-semibold text-sm">{l.colaboradores?.nome ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{l.colaboradores?.chapa} · {l.colaboradores?.tipo_contrato?.toUpperCase()}</div>
                    </TableCell>
                    <TableCell className="text-sm">{l.obras?.nome ?? '—'}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {l.data_inicio?.slice(8)}/{l.data_inicio?.slice(5,7)} → {l.data_fim?.slice(8)}/{l.data_fim?.slice(5,7)}
                    </TableCell>
                    <TableCell className="text-center">
                      <BadgeStatus status="liberado" />
                      <div className="text-xs text-muted-foreground mt-0.5">{l.mes_referencia?.slice(5)}/{l.mes_referencia?.slice(0,4)}</div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>
                      {l.snap_liquido ? formatCurrency(l.snap_liquido) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" className="h-7 text-xs"
                        onClick={() => { setModalPagarLanc(l); setDataPagamento(new Date().toISOString().slice(0,10)); setObsPagamento('') }}>
                        💰 Pagar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-sm font-semibold">Total agendado — {lancsAgendados.length} lançamento(s)</TableCell>
                  <TableCell className="text-right font-bold text-sm" style={{ color:'#b45309' }}>{formatCurrency(totalAgendado)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            </div>
          </div>
          )}

          {/* ── Pagamentos Pendentes (VT e Avulsos) ── */}
          {(() => {
            const pendentes = rows.filter(r =>
              (r.status === 'pendente') &&
              (filtroNomeLanc ? r.colaboradores?.nome?.toLowerCase().includes(filtroNomeLanc.toLowerCase()) : true) &&
              (filtroMesLanc ? r.competencia === filtroMesLanc : true)
            )
            if (pendentes.length === 0 && lancsAgendados.length === 0) return (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
                Nenhum pagamento pendente de confirmação.
              </div>
            )
            if (pendentes.length === 0) return null
            return (
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 1 }}>🚌 Pendente de Pagamento</h3>
                <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Competência</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead className="text-right">💵 Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendentes.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-semibold text-sm">{r.colaboradores?.nome ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.colaboradores?.chapa}</div>
                        </TableCell>
                        <TableCell>
                          <span style={{ background:'#ede9fe', color:'#7c3aed', borderRadius:99, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                            {r.tipo === 'vale_transporte' ? '🚌 Vale Transporte' : r.tipo ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm">{r.competencia?.slice(5)}/{r.competencia?.slice(0,4)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.observacoes ?? '—'}</TableCell>
                        <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>
                          {formatCurrency(r.valor_liquido ?? r.valor_bruto ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                            <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => marcarPago(r.id)}>
                              ✅ Confirmar
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50"
                              onClick={() => setModalRecusarVT(r)}>
                              ✕ Recusar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm font-semibold">Pendente — {pendentes.length} registro(s)</TableCell>
                      <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>
                        {formatCurrency(pendentes.reduce((s, r) => s + (r.valor_liquido ?? r.valor_bruto ?? 0), 0))}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* ══ ABA REALIZADOS ══ */}
      {aba === 'realizados' && (() => {
        // ── Folha de ponto paga ──────────────────────────────────────────────
        const folhaPaga = lancsRealizados

        // ── Pagamentos avulsos pagos (VT, adiantamentos, etc.) ───────────────
        const avulsosPagos = rows.filter(r => {
          if (r.status !== 'pago') return false
          const matchNome = filtroNomeLanc
            ? r.colaboradores?.nome?.toLowerCase().includes(filtroNomeLanc.toLowerCase())
            : true
          const matchMes = filtroMesLanc ? r.competencia === filtroMesLanc : true
          const matchDtIni = filtroDataIni ? (r.data_pagamento ?? '') >= filtroDataIni : true
          const matchDtFim = filtroDataFim ? (r.data_pagamento ?? '') <= filtroDataFim : true
          return matchNome && matchMes && matchDtIni && matchDtFim
        })

        const totalFolha   = folhaPaga.reduce((s: number, l: any) => s + (l.snap_liquido ?? 0), 0)
        const totalAvulsos = avulsosPagos.reduce((s, r) => s + (r.valor_liquido ?? r.valor_bruto ?? 0), 0)
        const totalGeral   = totalFolha + totalAvulsos

        if (folhaPaga.length === 0 && avulsosPagos.length === 0) return (
          <EmptyState
            icon={<CheckCircle size={32} />}
            title="Nenhum pagamento realizado no período"
            description="Pagamentos efetivados aparecerão aqui."
          />
        )

        return (
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

            {/* ── Histórico Folha de Ponto ─────────────────────────── */}
            {folhaPaga.length > 0 && (
              <div>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:1 }}>📄 Folha de Ponto</h3>
                <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Obra</TableHead>
                        <TableHead className="text-center">Período</TableHead>
                        <TableHead className="text-center">Data Pgto</TableHead>
                        <TableHead>Obs</TableHead>
                        <TableHead className="text-right">💵 Líquido</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {folhaPaga.map((l: any) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            <div className="font-semibold text-sm">{l.colaboradores?.nome ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{l.colaboradores?.chapa} · {l.colaboradores?.tipo_contrato?.toUpperCase()}</div>
                          </TableCell>
                          <TableCell className="text-sm">{l.obras?.nome ?? '—'}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {l.data_inicio?.slice(8)}/{l.data_inicio?.slice(5,7)} → {l.data_fim?.slice(8)}/{l.data_fim?.slice(5,7)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm font-semibold" style={{ color:'#15803d' }}>
                              {l.data_pagamento ? formatDate(l.data_pagamento) : '—'}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{l.obs_pagamento ?? '—'}</TableCell>
                          <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>
                            {l.snap_liquido ? formatCurrency(l.snap_liquido) : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/5"
                              onClick={() => { setModalEstornar(l); setMotivoEstorno('') }}>
                              ↩ Estornar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={5} className="text-sm font-semibold">Total — {folhaPaga.length} lançamento(s)</TableCell>
                        <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>{formatCurrency(totalFolha)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>
            )}

            {/* ── Histórico Pagamentos Avulsos (VT, etc.) ──────────── */}
            {avulsosPagos.length > 0 && (
              <div>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:1 }}>🚌 Vale Transporte e Avulsos</h3>
                <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-center">Competência</TableHead>
                        <TableHead className="text-center">Data Pgto</TableHead>
                        <TableHead>Observação</TableHead>
                        <TableHead className="text-right">💵 Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {avulsosPagos.map(r => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-semibold text-sm">{r.colaboradores?.nome ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{r.colaboradores?.chapa}</div>
                          </TableCell>
                          <TableCell>
                            <span style={{ background: r.tipo === 'vale_transporte' ? '#dbeafe' : '#ede9fe', color: r.tipo === 'vale_transporte' ? '#1d4ed8' : '#7c3aed', borderRadius:99, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                              {r.tipo === 'vale_transporte' ? '🚌 Vale Transporte'
                                : r.tipo === 'adiantamento' ? '💵 Adiantamento'
                                : r.tipo === '13_salario'   ? '🎄 13º Salário'
                                : r.tipo === 'ferias'       ? '🏖️ Férias'
                                : r.tipo === 'rescisao'     ? '📋 Rescisão'
                                : r.tipo ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-sm">{r.competencia?.slice(5)}/{r.competencia?.slice(0,4)}</TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm font-semibold" style={{ color:'#15803d' }}>
                              {r.data_pagamento ? formatDate(r.data_pagamento) : '—'}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.observacoes ?? '—'}</TableCell>
                          <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>
                            {formatCurrency(r.valor_liquido ?? r.valor_bruto ?? 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={5} className="text-sm font-semibold">Total — {avulsosPagos.length} registro(s)</TableCell>
                        <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>{formatCurrency(totalAvulsos)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>
            )}

            {/* ── Rodapé geral ─────────────────────────────────────── */}
            {(folhaPaga.length > 0 || avulsosPagos.length > 0) && (
              <div style={{ textAlign:'right', fontWeight:800, fontSize:15, color:'#15803d', paddingRight:4 }}>
                Total geral pago: {formatCurrency(totalGeral)}
              </div>
            )}
          </div>
        )
      })()}

      {/* ══ MODAL EFETIVAR PAGAMENTO ══ */}
      {modalPagarLanc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>💰</div>
              <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>Efetivar Pagamento</h3>
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 8 }}>
                <strong>{modalPagarLanc.colaboradores?.nome}</strong><br />
                {modalPagarLanc.obras?.nome}<br />
                <span style={{ fontSize: 12 }}>{modalPagarLanc.data_inicio?.slice(8)}/{modalPagarLanc.data_inicio?.slice(5,7)} → {modalPagarLanc.data_fim?.slice(8)}/{modalPagarLanc.data_fim?.slice(5,7)}</span>
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>📅 Data de Efetivação *</label>
              <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '2px solid #7c3aed', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Observação (opcional)</label>
              <textarea value={obsPagamento} onChange={e => setObsPagamento(e.target.value)}
                placeholder="Ex.: Pago via Pix, transferência banco X…" rows={3}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalPagarLanc(null)}
                style={{ padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1.5px solid #e5e7eb', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}>Cancelar</button>
              <button disabled={!dataPagamento || savingPgto} onClick={efetivarPagamento}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: (!dataPagamento || savingPgto) ? 0.5 : 1 }}>
                {savingPgto ? 'Salvando…' : '💰 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ESTORNAR ══ */}
      {modalEstornar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>↩</div>
              <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0, color: '#dc2626' }}>Estornar Pagamento</h3>
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 8 }}>
                <strong>{modalEstornar.colaboradores?.nome}</strong><br />
                {modalEstornar.obras?.nome} — pago em {(modalEstornar as any).data_pagamento ?? '—'}
              </p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Motivo do Estorno</label>
              <textarea value={motivoEstorno} onChange={e => setMotivoEstorno(e.target.value)}
                placeholder="Ex.: Pagamento duplicado, erro de valor…" rows={3}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '2px solid #fecaca', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEstornar(null)}
                style={{ padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1.5px solid #e5e7eb', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}>Cancelar</button>
              <button disabled={savingPgto} onClick={estornarPagamento}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', opacity: savingPgto ? 0.5 : 1 }}>
                {savingPgto ? 'Salvando…' : '↩ Confirmar Estorno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CRIAR/EDITAR PAGAMENTO AVULSO ══ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Pagamento Avulso' : '💵 Novo Pagamento Avulso'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={(v) => setField('colaborador_id', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.chapa} — {c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Obra</Label>
              <Select value={form.obra_id} onValueChange={(v) => setField('obra_id', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar obra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Nenhuma</SelectItem>
                  {obras.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setField('tipo', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Competência *</Label>
              <Input type="month" value={form.competencia} onChange={(e) => setField('competencia', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Data Pagamento</Label>
              <Input type="date" value={form.data_pagamento} onChange={(e) => setField('data_pagamento', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Valor Bruto</Label>
              <Input type="number" value={form.valor_bruto} onChange={(e) => setField('valor_bruto', e.target.value)} className="mt-1" placeholder="0,00" />
            </div>
            <div>
              <Label>Adiantamento (desconto)</Label>
              <Input type="number" value={form.adiantamento} onChange={(e) => setField('adiantamento', e.target.value)} className="mt-1" placeholder="0,00" />
            </div>
            <div>
              <Label>Líquido (auto)</Label>
              <Input readOnly value={formatCurrency(calcLiquido(form))} className="mt-1 bg-muted" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setField('observacoes', e.target.value)} className="mt-1" rows={3} placeholder="Detalhes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={handleSave} style={{ background: '#7c3aed', color: '#fff' }}>
              {saving ? 'Salvando…' : editando ? '💾 Salvar' : '+ Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ ALERT DELETE ══ */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ MODAL RECUSAR PAGAMENTO VT ══ */}
      <AlertDialog open={!!modalRecusarVT} onOpenChange={(o) => !o && setModalRecusarVT(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ display:'flex', alignItems:'center', gap:8 }}>
              ✕ Recusar pagamento de VT?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O registro de pagamento será <strong>excluído</strong> e o lançamento de Vale Transporte
              voltará para status <strong>Pendente</strong>, permitindo edição e reenvio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPgto}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingPgto}
              onClick={recusarPagamentoVT}
              className="bg-destructive text-destructive-foreground"
            >
              {savingPgto ? 'Processando…' : '↩ Recusar e devolver VT'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
