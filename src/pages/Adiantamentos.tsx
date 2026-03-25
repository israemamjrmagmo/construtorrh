import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  DollarSign, Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, Clock, RefreshCw,
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type AdiantRow = {
  id: string
  colaborador_id: string
  obra_id: string | null
  competencia: string
  valor: number
  status: 'pendente' | 'aprovado' | 'cancelado' | 'pago'
  tipo: string
  observacoes: string | null
  pagamento_id: string | null
  colaboradores?: { nome: string; chapa: string }
  obras?: { nome: string } | null
}

type FormData = {
  colaborador_id: string
  obra_id: string
  competencia: string
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
  adiantamento: 'Adiantamento Salarial',
  vale:         'Vale',
  ajuda_custo:  'Ajuda de Custo',
  outro:        'Outro',
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pendente:  { bg: '#fef3c7', color: '#b45309', label: '⏳ Pendente'  },
  aprovado:  { bg: '#dcfce7', color: '#15803d', label: '✅ Aprovado'  },
  cancelado: { bg: '#fee2e2', color: '#dc2626', label: '❌ Cancelado' },
  pago:      { bg: '#eff6ff', color: '#1d4ed8', label: '💳 Pago'      },
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function mesLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MESES[+m - 1]} / ${y}`
}

function prevMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function nextMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const EMPTY: FormData = {
  colaborador_id: '',
  obra_id: '',
  competencia: new Date().toISOString().slice(0, 7),
  valor: '',
  tipo: 'adiantamento',
  observacoes: '',
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Adiantamentos() {
  const [rows,   setRows]   = useState<AdiantRow[]>([])
  const [colabs, setColabs] = useState<{ id: string; nome: string; chapa: string }[]>([])
  const [obras,  setObras]  = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)

  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7))
  const [filtroNome,  setFiltroNome]  = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo,   setFiltroTipo]   = useState('todos')

  // modal
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
        .eq('competencia', competencia)
        .order('created_at', { ascending: false }),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status','ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    setRows((aData ?? []) as AdiantRow[])
    setColabs(cData ?? [])
    setObras(oData ?? [])
    setLoading(false)
  }, [competencia])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── filtro local ─────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    const matchNome   = filtroNome   ? r.colaboradores?.nome.toLowerCase().includes(filtroNome.toLowerCase()) : true
    const matchStatus = filtroStatus !== 'todos' ? r.status === filtroStatus : true
    const matchTipo   = filtroTipo   !== 'todos' ? r.tipo   === filtroTipo   : true
    return matchNome && matchStatus && matchTipo
  })

  // ─── cards resumo ─────────────────────────────────────────────────────────
  const totalPend  = rows.filter(r => r.status === 'pendente').reduce((s, r) => s + r.valor, 0)
  const totalAprov = rows.filter(r => r.status === 'aprovado').reduce((s, r) => s + r.valor, 0)
  const totalPago  = rows.filter(r => r.status === 'pago').reduce((s, r) => s + r.valor, 0)
  const totalGeral = rows.reduce((s, r) => s + r.valor, 0)
  const qtdPend    = rows.filter(r => r.status === 'pendente').length

  // ─── modal helpers ────────────────────────────────────────────────────────
  function setF(k: keyof FormData, v: string) { setForm(p => ({ ...p, [k]: v })) }

  function openCreate() {
    setEditando(null)
    setForm({ ...EMPTY, competencia })
    setModalOpen(true)
  }
  function openEdit(r: AdiantRow) {
    if (r.status !== 'pendente') { toast.error('Só é possível editar adiantamentos pendentes.'); return }
    setEditando(r)
    setForm({
      colaborador_id: r.colaborador_id,
      obra_id:        r.obra_id ?? '',
      competencia:    r.competencia,
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
      colaborador_id: form.colaborador_id,
      obra_id:        form.obra_id || null,
      competencia:    form.competencia,
      valor:          parseFloat(form.valor),
      tipo:           form.tipo,
      observacoes:    form.observacoes || null,
      status:         'pendente',
    }
    const { error } = editando
      ? await supabase.from('adiantamentos').update(payload).eq('id', editando.id)
      : await supabase.from('adiantamentos').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editando ? 'Atualizado!' : 'Registrado! Aguardando aprovação.')
    setModalOpen(false)
    fetchData()
  }

  // ─── aprovar ──────────────────────────────────────────────────────────────
  async function confirmarAprovar() {
    if (!aprovarRow) return
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
    const { error: errAdiant } = await supabase.from('adiantamentos').update({
      status: 'aprovado', pagamento_id: pag.id,
    }).eq('id', aprovarRow.id)
    if (errAdiant) {
      await supabase.from('pagamentos').delete().eq('id', pag.id)
      toast.error('Erro ao aprovar: ' + errAdiant.message); return
    }
    toast.success('✅ Aprovado! Enviado para Pagamentos.')
    setAprovarRow(null); fetchData()
  }

  // ─── cancelar ─────────────────────────────────────────────────────────────
  async function confirmarCancelar() {
    if (!cancelarRow) return
    if (cancelarRow.pagamento_id) {
      const { data: pag } = await supabase.from('pagamentos').select('status').eq('id', cancelarRow.pagamento_id).single()
      if (pag?.status === 'pago') {
        toast.error('Já foi pago — não pode cancelar.')
        setCancelarRow(null); return
      }
      await supabase.from('pagamentos').delete().eq('id', cancelarRow.pagamento_id)
    }
    await supabase.from('adiantamentos').update({ status: 'cancelado', pagamento_id: null }).eq('id', cancelarRow.id)
    toast.success('Cancelado.')
    setCancelarRow(null); fetchData()
  }

  // ─── delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const row = rows.find(r => r.id === deleteId)
    if (row?.pagamento_id) {
      const { data: pag } = await supabase.from('pagamentos').select('status').eq('id', row.pagamento_id).single()
      if (pag?.status === 'pago') { toast.error('Já foi pago — não pode excluir.'); setDeleteId(null); return }
      await supabase.from('pagamentos').delete().eq('id', row.pagamento_id)
    }
    const { error } = await supabase.from('adiantamentos').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Excluído!'); fetchData() }
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontWeight:800, fontSize:22, margin:0, display:'flex', alignItems:'center', gap:8 }}>
            <DollarSign size={22} style={{ color:'#7c3aed' }}/> Adiantamentos
          </h1>
          <p style={{ fontSize:13, color:'var(--muted-foreground)', marginTop:4 }}>
            Controle de adiantamentos e vales por colaborador
          </p>
        </div>

        {/* Navegação de mês */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setCompetencia(prevMes(competencia))}
            style={{ width:32, height:32, borderRadius:8, border:'1.5px solid var(--border)', background:'var(--background)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ChevronLeft size={16}/>
          </button>
          <span style={{ fontWeight:700, fontSize:15, minWidth:130, textAlign:'center' }}>{mesLabel(competencia)}</span>
          <button onClick={() => setCompetencia(nextMes(competencia))}
            style={{ width:32, height:32, borderRadius:8, border:'1.5px solid var(--border)', background:'var(--background)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ChevronRight size={16}/>
          </button>
        </div>
      </div>

      {/* ── Cards resumo ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'⏳ Pendentes',   value: formatCurrency(totalPend),  sub: `${qtdPend} lançamento(s)`,            bg:'#fef3c7', border:'#fde68a', color:'#b45309' },
          { label:'✅ Aprovados',   value: formatCurrency(totalAprov), sub: `${rows.filter(r=>r.status==='aprovado').length} lançamento(s)`, bg:'#dcfce7', border:'#bbf7d0', color:'#15803d' },
          { label:'💳 Pagos',       value: formatCurrency(totalPago),  sub: `${rows.filter(r=>r.status==='pago').length} lançamento(s)`,    bg:'#eff6ff', border:'#bfdbfe', color:'#1d4ed8' },
          { label:'📊 Total mês',   value: formatCurrency(totalGeral), sub: `${rows.length} lançamento(s)`,        bg:'#ede9fe', border:'#ddd6fe', color:'#7c3aed' },
        ].map((c, i) => (
          <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:'14px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:c.color, marginBottom:4 }}>{c.label}</div>
            <div style={{ fontWeight:800, fontSize:18, color:c.color }}>{c.value}</div>
            <div style={{ fontSize:11, color:c.color, opacity:.75, marginTop:2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Barra de filtros + botão novo ── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'flex-end' }}>
        {/* busca nome */}
        <div style={{ position:'relative' }}>
          <Search size={13} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#9ca3af', pointerEvents:'none' }}/>
          <input placeholder="Buscar colaborador…" value={filtroNome} onChange={e => setFiltroNome(e.target.value)}
            style={{ height:32, paddingLeft:26, paddingRight:10, fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', width:180 }}/>
        </div>
        {/* status */}
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ height:32, padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)' }}>
          <option value="todos">Todos os status</option>
          <option value="pendente">⏳ Pendente</option>
          <option value="aprovado">✅ Aprovado</option>
          <option value="pago">💳 Pago</option>
          <option value="cancelado">❌ Cancelado</option>
        </select>
        {/* tipo */}
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          style={{ height:32, padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)' }}>
          <option value="todos">Todos os tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {(filtroNome || filtroStatus !== 'todos' || filtroTipo !== 'todos') && (
          <button onClick={() => { setFiltroNome(''); setFiltroStatus('todos'); setFiltroTipo('todos') }}
            style={{ height:32, padding:'0 10px', fontSize:12, border:'1.5px solid var(--border)', borderRadius:6, background:'transparent', cursor:'pointer', color:'var(--muted-foreground)' }}>
            ✕ Limpar
          </button>
        )}
        <button onClick={fetchData}
          style={{ width:32, height:32, borderRadius:6, border:'1.5px solid var(--border)', background:'var(--background)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <RefreshCw size={13}/>
        </button>
        <Button onClick={openCreate} style={{ marginLeft:'auto', background:'#7c3aed', color:'#fff', gap:6 }}>
          <Plus size={15}/> Novo Adiantamento
        </Button>
      </div>

      {/* ── Tabela ── */}
      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--muted-foreground)' }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:60, textAlign:'center', color:'var(--muted-foreground)', border:'1px dashed var(--border)', borderRadius:12 }}>
          <DollarSign size={32} style={{ opacity:.3, marginBottom:8 }}/>
          <div style={{ fontWeight:600 }}>Nenhum adiantamento em {mesLabel(competencia)}</div>
          <div style={{ fontSize:12, marginTop:4 }}>Clique em "+ Novo Adiantamento" para registrar.</div>
        </div>
      ) : (
        <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--muted)', borderBottom:'2px solid var(--border)' }}>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700 }}>Colaborador</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700 }}>Tipo</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700 }}>Valor</th>
                <th style={{ padding:'10px 14px', textAlign:'center', fontWeight:700 }}>Status</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700 }}>Obs.</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const badge = STATUS_CFG[r.status] ?? STATUS_CFG.pendente
                return (
                  <tr key={r.id} style={{ borderBottom:'1px solid var(--border)', background: i%2===0 ? 'var(--card)' : 'transparent' }}>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:600 }}>{r.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize:11, color:'var(--muted-foreground)' }}>{r.colaboradores?.chapa}</div>
                    </td>
                    <td style={{ padding:'10px 14px', color:'var(--muted-foreground)' }}>
                      {TIPO_LABEL[r.tipo] ?? r.tipo}
                    </td>
                    <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, color:'#7c3aed' }}>
                      {formatCurrency(r.valor)}
                    </td>
                    <td style={{ padding:'10px 14px', textAlign:'center' }}>
                      <span style={{ fontSize:11, fontWeight:600, borderRadius:6, padding:'3px 9px', background:badge.bg, color:badge.color }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding:'10px 14px', color:'var(--muted-foreground)', fontSize:12, maxWidth:160 }}>
                      <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.observacoes ?? ''}>
                        {r.observacoes || '—'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 14px', textAlign:'right' }}>
                      <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                        {r.status === 'pendente' && (
                          <button onClick={() => setAprovarRow(r)} title="Aprovar"
                            style={{ height:28, padding:'0 10px', borderRadius:6, border:'1px solid #bbf7d0', background:'#f0fdf4', color:'#15803d', cursor:'pointer', fontSize:11, fontWeight:700 }}>
                            <CheckCircle2 size={12} style={{ display:'inline', marginRight:4 }}/>Aprovar
                          </button>
                        )}
                        {r.status === 'pendente' && (
                          <button onClick={() => openEdit(r)} title="Editar"
                            style={{ width:28, height:28, borderRadius:6, border:'1px solid var(--border)', background:'var(--muted)', color:'var(--foreground)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Pencil size={12}/>
                          </button>
                        )}
                        {r.status === 'aprovado' && (
                          <button onClick={() => setCancelarRow(r)} title="Cancelar aprovação"
                            style={{ height:28, padding:'0 10px', borderRadius:6, border:'1px solid #fecaca', background:'#fff5f5', color:'#dc2626', cursor:'pointer', fontSize:11, fontWeight:700 }}>
                            <XCircle size={12} style={{ display:'inline', marginRight:4 }}/>Cancelar
                          </button>
                        )}
                        {(r.status === 'pendente' || r.status === 'cancelado') && (
                          <button onClick={() => setDeleteId(r.id)} title="Excluir"
                            style={{ width:28, height:28, borderRadius:6, border:'1px solid #fecaca', background:'#fff5f5', color:'#dc2626', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'var(--muted)', borderTop:'2px solid var(--border)' }}>
                <td colSpan={2} style={{ padding:'10px 14px', fontSize:12, color:'var(--muted-foreground)' }}>
                  {filtered.length} lançamento(s) exibido(s)
                </td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:800, color:'#7c3aed', fontSize:14 }}>
                  {formatCurrency(filtered.reduce((s, r) => s + r.valor, 0))}
                </td>
                <td colSpan={3}/>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ══ MODAL CRIAR / EDITAR ══ */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, padding:28, width:'100%', maxWidth:500, boxShadow:'0 25px 50px rgba(0,0,0,.25)' }}>
            <h2 style={{ fontWeight:800, fontSize:17, margin:'0 0 20px' }}>
              {editando ? '✏️ Editar Adiantamento' : '💵 Novo Adiantamento'}
            </h2>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {/* Colaborador */}
              <div style={{ gridColumn:'1/-1' }}>
                <Label className="mb-1 block">Colaborador *</Label>
                <Select value={form.colaborador_id} onValueChange={v => setF('colaborador_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar…"/></SelectTrigger>
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
            <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#1e40af', marginTop:14 }}>
              💡 Após registrar, clique em <strong>Aprovar</strong> para enviar à tela de <strong>Pagamentos</strong>.
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:18 }}>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button disabled={saving} onClick={handleSave} style={{ background:'#7c3aed', color:'#fff' }}>
                {saving ? 'Salvando…' : editando ? '💾 Salvar' : '💵 Registrar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRMAR APROVAR ══ */}
      <AlertDialog open={!!aprovarRow} onOpenChange={o => { if (!o) setAprovarRow(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>✅ Aprovar adiantamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {aprovarRow?.colaboradores?.nome} — {formatCurrency(aprovarRow?.valor ?? 0)} ({mesLabel(aprovarRow?.competencia ?? '')}).
              O adiantamento será enviado para Pagamentos como pendente de pagamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAprovar} style={{ background:'#15803d', color:'#fff' }}>
              ✅ Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ CONFIRMAR CANCELAR ══ */}
      <AlertDialog open={!!cancelarRow} onOpenChange={o => { if (!o) setCancelarRow(null) }}>
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
              ❌ Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ CONFIRMAR EXCLUIR ══ */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🗑️ Excluir adiantamento?</AlertDialogTitle>
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
