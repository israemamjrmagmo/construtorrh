import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
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
import {
  DollarSign, Plus, Search, Pencil, Trash2, CheckCircle, Clock, XCircle, RefreshCw,
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type AdiantRow = {
  id: string
  colaborador_id: string
  obra_id: string | null
  competencia: string
  data_solicitacao: string
  data_pagamento: string | null
  valor: number
  status: 'pendente' | 'aprovado' | 'cancelado'
  tipo: string
  observacoes: string | null
  descontado_em: string | null
  pagamento_id: string | null      // referência ao registro criado em pagamentos
  colaboradores?: { nome: string; chapa: string }
  obras?: { nome: string } | null
}

type FormData = {
  colaborador_id: string
  obra_id: string
  competencia: string
  data_solicitacao: string
  valor: string
  tipo: string
  observacoes: string
}

const TIPOS = [
  { value: 'adiantamento', label: '💵 Adiantamento Salarial' },
  { value: 'vale',         label: '🎫 Vale' },
  { value: 'ajuda_custo',  label: '🚗 Ajuda de Custo' },
  { value: 'outro',        label: '📋 Outro' },
]

const TIPO_LABEL: Record<string, string> = {
  adiantamento: '💵 Adiantamento Salarial',
  vale:         '🎫 Vale',
  ajuda_custo:  '🚗 Ajuda de Custo',
  outro:        '📋 Outro',
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string; icon: React.ReactNode }> = {
  pendente:  { bg: '#fef3c7', color: '#b45309', label: 'Pendente',  icon: <Clock    size={11}/> },
  aprovado:  { bg: '#dcfce7', color: '#15803d', label: 'Aprovado',  icon: <CheckCircle size={11}/> },
  cancelado: { bg: '#fee2e2', color: '#dc2626', label: 'Cancelado', icon: <XCircle  size={11}/> },
}

function mesLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[+m - 1]}/${y}`
}
function fmtDate(d?: string | null) {
  if (!d) return '—'
  return d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4)
}

const EMPTY: FormData = {
  colaborador_id: '',
  obra_id: '',
  competencia: new Date().toISOString().slice(0, 7),
  data_solicitacao: new Date().toISOString().slice(0, 10),
  valor: '',
  tipo: 'adiantamento',
  observacoes: '',
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Adiantamentos() {
  const [rows,    setRows]    = useState<AdiantRow[]>([])
  const [colabs,  setColabs]  = useState<{ id: string; nome: string; chapa: string }[]>([])
  const [obras,   setObras]   = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const [filtroComp,   setFiltroComp]   = useState(new Date().toISOString().slice(0, 7))
  const [filtroNome,   setFiltroNome]   = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo,   setFiltroTipo]   = useState('todos')

  // modal criar/editar
  const [modalOpen, setModalOpen] = useState(false)
  const [editando,  setEditando]  = useState<AdiantRow | null>(null)
  const [form,      setForm]      = useState<FormData>(EMPTY)
  const [saving,    setSaving]    = useState(false)

  // confirmações
  const [deleteId,    setDeleteId]    = useState<string | null>(null)
  const [aprovarRow,  setAprovarRow]  = useState<AdiantRow | null>(null)
  const [cancelarRow, setCancelarRow] = useState<AdiantRow | null>(null)

  // ─── fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: aData }, { data: cData }, { data: oData }] = await Promise.all([
      supabase.from('adiantamentos')
        .select('*, colaboradores(nome,chapa), obras(nome)')
        .order('data_solicitacao', { ascending: false }),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status','ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    setRows((aData ?? []) as AdiantRow[])
    setColabs(cData ?? [])
    setObras(oData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── filtro ──────────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    const matchComp   = filtroComp   ? r.competencia === filtroComp : true
    const matchNome   = filtroNome   ? r.colaboradores?.nome.toLowerCase().includes(filtroNome.toLowerCase()) : true
    const matchStatus = filtroStatus !== 'todos' ? r.status === filtroStatus : true
    const matchTipo   = filtroTipo   !== 'todos' ? r.tipo   === filtroTipo   : true
    return matchComp && matchNome && matchStatus && matchTipo
  })

  const totalPendente = filtered.filter(r => r.status === 'pendente').reduce((s, r) => s + r.valor, 0)
  const totalAprovado = filtered.filter(r => r.status === 'aprovado').reduce((s, r) => s + r.valor, 0)
  const totalGeral    = filtered.reduce((s, r) => s + r.valor, 0)

  // ─── modal helpers ────────────────────────────────────────────────────────
  function setF(k: keyof FormData, v: string) { setForm(p => ({ ...p, [k]: v })) }

  function openCreate() {
    setEditando(null)
    setForm({ ...EMPTY, competencia: filtroComp || EMPTY.competencia })
    setModalOpen(true)
  }
  function openEdit(r: AdiantRow) {
    setEditando(r)
    setForm({
      colaborador_id: r.colaborador_id,
      obra_id:        r.obra_id ?? '',
      competencia:    r.competencia,
      data_solicitacao: r.data_solicitacao,
      valor:          String(r.valor),
      tipo:           r.tipo,
      observacoes:    r.observacoes ?? '',
    })
    setModalOpen(true)
  }

  // ─── save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.valor || +form.valor <= 0) return toast.error('Valor deve ser maior que zero')
    setSaving(true)
    const payload: any = {
      colaborador_id:   form.colaborador_id,
      obra_id:          form.obra_id || null,
      competencia:      form.competencia,
      data_solicitacao: form.data_solicitacao || null,
      valor:            parseFloat(form.valor),
      tipo:             form.tipo,
      observacoes:      form.observacoes || null,
      status:           'pendente',
    }
    const { error } = editando
      ? await supabase.from('adiantamentos').update(payload).eq('id', editando.id)
      : await supabase.from('adiantamentos').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editando ? 'Adiantamento atualizado!' : 'Adiantamento registrado! Aguardando aprovação.')
    setModalOpen(false)
    fetchData()
  }

  // ─── aprovar → cria em pagamentos ─────────────────────────────────────────
  async function confirmarAprovar() {
    if (!aprovarRow) return
    const colab = colabs.find(c => c.id === aprovarRow.colaborador_id)

    // 1. Cria registro na tabela pagamentos (tipo adiantamento, status pendente)
    const { data: pag, error: errPag } = await supabase.from('pagamentos').insert({
      colaborador_id: aprovarRow.colaborador_id,
      obra_id:        aprovarRow.obra_id ?? null,
      competencia:    aprovarRow.competencia,
      tipo:           'adiantamento',
      valor_bruto:    aprovarRow.valor,
      valor_liquido:  aprovarRow.valor,
      status:         'pendente',
      observacoes:    `${TIPO_LABEL[aprovarRow.tipo] ?? aprovarRow.tipo}${aprovarRow.observacoes ? ' — ' + aprovarRow.observacoes : ''}`,
    }).select('id').single()

    if (errPag) { toast.error('Erro ao criar pagamento: ' + errPag.message); return }

    // 2. Atualiza adiantamento para aprovado + referência ao pagamento
    const { error: errAdiant } = await supabase.from('adiantamentos').update({
      status:       'aprovado',
      pagamento_id: pag.id,
    }).eq('id', aprovarRow.id)

    if (errAdiant) {
      // rollback: remove pagamento criado
      await supabase.from('pagamentos').delete().eq('id', pag.id)
      toast.error('Erro ao aprovar: ' + errAdiant.message); return
    }

    toast.success(`✅ Aprovado! Adiantamento de ${colab?.nome ?? ''} enviado para Pagamentos.`)
    setAprovarRow(null)
    fetchData()
  }

  // ─── cancelar → remove de pagamentos se existir ───────────────────────────
  async function confirmarCancelar() {
    if (!cancelarRow) return

    // Remove da tabela pagamentos se existir (somente se ainda não foi pago)
    if (cancelarRow.pagamento_id) {
      const { data: pag } = await supabase.from('pagamentos').select('status').eq('id', cancelarRow.pagamento_id).single()
      if (pag?.status === 'pago') {
        toast.error('Este adiantamento já foi pago e não pode ser cancelado.')
        setCancelarRow(null); return
      }
      await supabase.from('pagamentos').delete().eq('id', cancelarRow.pagamento_id)
    }

    await supabase.from('adiantamentos').update({ status: 'cancelado', pagamento_id: null }).eq('id', cancelarRow.id)
    toast.success('Adiantamento cancelado.')
    setCancelarRow(null); fetchData()
  }

  // ─── delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const row = rows.find(r => r.id === deleteId)
    // Se aprovado e tem pagamento associado, verifica se não foi pago
    if (row?.pagamento_id) {
      const { data: pag } = await supabase.from('pagamentos').select('status').eq('id', row.pagamento_id).single()
      if (pag?.status === 'pago') {
        toast.error('Este adiantamento já foi pago e não pode ser excluído.')
        setDeleteId(null); return
      }
      await supabase.from('pagamentos').delete().eq('id', row.pagamento_id)
    }
    const { error } = await supabase.from('adiantamentos').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Adiantamento removido!'); fetchData() }
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontWeight:800, fontSize:22, margin:0, display:'flex', alignItems:'center', gap:8 }}>
            <DollarSign size={22} style={{ color:'#7c3aed' }}/> Adiantamentos
          </h1>
          <p style={{ fontSize:13, color:'var(--muted-foreground)', marginTop:4 }}>
            Solicitações de adiantamento salarial e vales — aprovadas são enviadas para Pagamentos
          </p>
        </div>
        <Button onClick={openCreate} style={{ background:'#7c3aed', color:'#fff', gap:6 }}>
          <Plus size={15}/> Novo Adiantamento
        </Button>
      </div>

      {/* ── Cards resumo ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:12, marginBottom:20 }}>
        <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:10, padding:'14px 18px' }}>
          <div style={{ fontSize:11, color:'#92400e', fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:5 }}><Clock size={12}/>⏳ Pendentes</div>
          <div style={{ fontWeight:800, fontSize:20, color:'#b45309' }}>{formatCurrency(totalPendente)}</div>
          <div style={{ fontSize:11, color:'#92400e' }}>{filtered.filter(r=>r.status==='pendente').length} lançamento(s)</div>
        </div>
        <div style={{ background:'#dcfce7', border:'1px solid #bbf7d0', borderRadius:10, padding:'14px 18px' }}>
          <div style={{ fontSize:11, color:'#14532d', fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:5 }}><CheckCircle size={12}/>✅ Aprovados</div>
          <div style={{ fontWeight:800, fontSize:20, color:'#15803d' }}>{formatCurrency(totalAprovado)}</div>
          <div style={{ fontSize:11, color:'#14532d' }}>{filtered.filter(r=>r.status==='aprovado').length} lançamento(s)</div>
        </div>
        <div style={{ background:'#ede9fe', border:'1px solid #ddd6fe', borderRadius:10, padding:'14px 18px' }}>
          <div style={{ fontSize:11, color:'#4c1d95', fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:5 }}><DollarSign size={12}/>📊 Total no período</div>
          <div style={{ fontWeight:800, fontSize:20, color:'#7c3aed' }}>{formatCurrency(totalGeral)}</div>
          <div style={{ fontSize:11, color:'#4c1d95' }}>{filtered.length} lançamento(s)</div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'flex-end' }}>
        <div>
          <Label style={{ fontSize:11, marginBottom:3, display:'block' }}>Competência</Label>
          <input type="month" value={filtroComp} onChange={e => setFiltroComp(e.target.value)}
            style={{ height:32, padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)' }}/>
        </div>
        <div style={{ position:'relative' }}>
          <Label style={{ fontSize:11, marginBottom:3, display:'block' }}>Colaborador</Label>
          <Search size={13} style={{ position:'absolute', left:8, top:28, color:'#9ca3af', pointerEvents:'none' }}/>
          <input placeholder="Nome..." value={filtroNome} onChange={e => setFiltroNome(e.target.value)}
            style={{ height:32, paddingLeft:26, paddingRight:10, fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', width:180 }}/>
        </div>
        <div>
          <Label style={{ fontSize:11, marginBottom:3, display:'block' }}>Status</Label>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ height:32, padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)' }}>
            <option value="todos">Todos</option>
            <option value="pendente">⏳ Pendente</option>
            <option value="aprovado">✅ Aprovado</option>
            <option value="cancelado">❌ Cancelado</option>
          </select>
        </div>
        <div>
          <Label style={{ fontSize:11, marginBottom:3, display:'block' }}>Tipo</Label>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            style={{ height:32, padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)' }}>
            <option value="todos">Todos</option>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {(filtroNome || filtroStatus !== 'todos' || filtroTipo !== 'todos') && (
          <button onClick={() => { setFiltroNome(''); setFiltroStatus('todos'); setFiltroTipo('todos') }}
            style={{ height:32, padding:'0 12px', fontSize:12, border:'1.5px solid var(--border)', borderRadius:6, background:'transparent', cursor:'pointer', color:'var(--muted-foreground)' }}>
            ✕ Limpar
          </button>
        )}
        <button onClick={fetchData} style={{ height:32, width:32, borderRadius:6, border:'1.5px solid var(--border)', background:'var(--background)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', marginLeft:'auto' }}>
          <RefreshCw size={13}/>
        </button>
      </div>

      {/* ── Tabela ── */}
      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--muted-foreground)' }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:60, textAlign:'center', color:'var(--muted-foreground)', border:'1px dashed var(--border)', borderRadius:12 }}>
          <DollarSign size={32} style={{ opacity:0.3, marginBottom:8 }}/>
          <div style={{ fontWeight:600 }}>Nenhum adiantamento encontrado</div>
          <div style={{ fontSize:12, marginTop:4 }}>Altere os filtros ou crie um novo adiantamento.</div>
        </div>
      ) : (
        <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background:'var(--muted)' }}>
                <TableHead>Colaborador</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Competência</TableHead>
                <TableHead className="text-center">Solicitação</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Pagamento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const badge  = STATUS_CFG[r.status] ?? STATUS_CFG.pendente
                const isPend = r.status === 'pendente'
                const isAprov= r.status === 'aprovado'
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div style={{ fontWeight:600, fontSize:13 }}>{r.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize:10, color:'var(--muted-foreground)' }}>{r.colaboradores?.chapa}</div>
                    </TableCell>
                    <TableCell style={{ fontSize:12 }}>
                      {TIPO_LABEL[r.tipo]?.replace(/^.+? /, '') ?? r.tipo}
                    </TableCell>
                    <TableCell className="text-center">{mesLabel(r.competencia)}</TableCell>
                    <TableCell className="text-center" style={{ color:'var(--muted-foreground)', fontSize:12 }}>
                      {fmtDate(r.data_solicitacao)}
                    </TableCell>
                    <TableCell className="text-right" style={{ fontWeight:700, color:'#7c3aed', fontSize:13 }}>
                      {formatCurrency(r.valor)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span style={{ fontSize:11, fontWeight:600, borderRadius:6, padding:'3px 9px', background:badge.bg, color:badge.color, display:'inline-flex', alignItems:'center', gap:4 }}>
                        {badge.icon} {badge.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {isAprov ? (
                        <span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', borderRadius:5, padding:'2px 7px', fontWeight:600 }}>
                          💳 Em Pagamentos
                        </span>
                      ) : (
                        <span style={{ fontSize:11, color:'var(--muted-foreground)' }}>—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                        {/* Aprovar — só para pendente */}
                        {isPend && (
                          <button title="Aprovar e enviar para Pagamentos" onClick={() => setAprovarRow(r)}
                            style={{ height:28, padding:'0 10px', borderRadius:6, border:'1px solid #bbf7d0', background:'#f0fdf4', color:'#15803d', cursor:'pointer', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                            <CheckCircle size={12}/> Aprovar
                          </button>
                        )}
                        {/* Editar — só pendente */}
                        {isPend && (
                          <button title="Editar" onClick={() => openEdit(r)}
                            style={{ width:28, height:28, borderRadius:6, border:'1px solid var(--border)', background:'var(--muted)', color:'var(--foreground)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Pencil size={12}/>
                          </button>
                        )}
                        {/* Cancelar — só aprovado (ainda não pago) */}
                        {isAprov && (
                          <button title="Cancelar aprovação" onClick={() => setCancelarRow(r)}
                            style={{ height:28, padding:'0 10px', borderRadius:6, border:'1px solid #fecaca', background:'#fff5f5', color:'#dc2626', cursor:'pointer', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                            <XCircle size={12}/> Cancelar
                          </button>
                        )}
                        {/* Excluir — só pendente ou cancelado */}
                        {(isPend || r.status === 'cancelado') && (
                          <button title="Excluir" onClick={() => setDeleteId(r.id)}
                            style={{ width:28, height:28, borderRadius:6, border:'1px solid #fecaca', background:'#fff5f5', color:'#dc2626', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} style={{ fontSize:12, color:'var(--muted-foreground)' }}>
                  Total — {filtered.length} lançamento(s)
                </TableCell>
                <TableCell className="text-right" style={{ fontWeight:700, color:'#7c3aed', fontSize:13 }}>
                  {formatCurrency(filtered.reduce((s, r) => s + r.valor, 0))}
                </TableCell>
                <TableCell colSpan={3}/>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* ══ MODAL CRIAR / EDITAR ══ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent style={{ maxWidth:520 }}>
          <DialogHeader>
            <DialogTitle>{editando ? '✏️ Editar Adiantamento' : '💵 Novo Adiantamento'}</DialogTitle>
          </DialogHeader>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, paddingTop:4 }}>
            {/* Colaborador */}
            <div style={{ gridColumn:'1/-1' }}>
              <Label className="mb-1 block">Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={v => setF('colaborador_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar colaborador"/></SelectTrigger>
                <SelectContent>
                  {colabs.map(c => <SelectItem key={c.id} value={c.id}>{c.chapa} — {c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo */}
            <div>
              <Label className="mb-1 block">Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setF('tipo', v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Valor */}
            <div>
              <Label className="mb-1 block">Valor (R$) *</Label>
              <Input type="number" min="0" step="0.01" value={form.valor}
                onChange={e => setF('valor', e.target.value)} placeholder="0,00"/>
            </div>

            {/* Competência */}
            <div>
              <Label className="mb-1 block">Competência *</Label>
              <input type="month" value={form.competencia} onChange={e => setF('competencia', e.target.value)}
                style={{ height:36, width:'100%', padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', boxSizing:'border-box' }}/>
            </div>

            {/* Data Solicitação */}
            <div>
              <Label className="mb-1 block">Data Solicitação</Label>
              <input type="date" value={form.data_solicitacao} onChange={e => setF('data_solicitacao', e.target.value)}
                style={{ height:36, width:'100%', padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', boxSizing:'border-box' }}/>
            </div>

            {/* Obra */}
            <div>
              <Label className="mb-1 block">Obra</Label>
              <Select value={form.obra_id || 'nenhuma'} onValueChange={v => setF('obra_id', v === 'nenhuma' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Sem obra"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem obra</SelectItem>
                  {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Observações */}
            <div style={{ gridColumn:'1/-1' }}>
              <Label className="mb-1 block">Observações / Motivo</Label>
              <Textarea value={form.observacoes} onChange={e => setF('observacoes', e.target.value)}
                placeholder="Motivo, detalhes…" rows={3}/>
            </div>
          </div>

          {/* Aviso fluxo */}
          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#1e40af', marginTop:4 }}>
            💡 Após registrar, use o botão <strong>Aprovar</strong> para enviar o adiantamento à tela de <strong>Pagamentos</strong> onde será efetivado.
          </div>

          <DialogFooter style={{ marginTop:8 }}>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={handleSave} style={{ background:'#7c3aed', color:'#fff' }}>
              {saving ? 'Salvando…' : editando ? '💾 Salvar' : '💵 Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ CONFIRMAR APROVAR ══ */}
      <AlertDialog open={!!aprovarRow} onOpenChange={open => { if (!open) setAprovarRow(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>✅ Aprovar adiantamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {aprovarRow?.colaboradores?.nome} — {formatCurrency(aprovarRow?.valor ?? 0)} | Competência: {mesLabel(aprovarRow?.competencia ?? '')}.
              Ao aprovar, o adiantamento será enviado para Pagamentos com status Pendente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAprovar} style={{ background:'#15803d', color:'#fff' }}>
              ✅ Confirmar aprovação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ CONFIRMAR CANCELAR ══ */}
      <AlertDialog open={!!cancelarRow} onOpenChange={open => { if (!open) setCancelarRow(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>❌ Cancelar adiantamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O adiantamento de {cancelarRow?.colaboradores?.nome} será cancelado e removido da fila de Pagamentos. Só é possível cancelar se o pagamento ainda não foi efetivado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarCancelar} style={{ background:'#dc2626', color:'#fff' }}>
              ❌ Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ CONFIRMAR EXCLUIR ══ */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🗑️ Confirmar exclusão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ background:'#dc2626', color:'#fff' }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
