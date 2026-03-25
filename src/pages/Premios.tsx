import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Premio, Colaborador, Obra } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
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
import { Gift, Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type PremioRow = Premio & {
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
}
type FormData = {
  colaborador_id: string
  obra_id: string
  tipo: string
  descricao: string
  valor: string
  data: string
  competencia: string
  observacoes: string
}

const TIPO_OPTIONS = [
  'Produtividade', 'Assiduidade', 'Segurança', 'Desempenho', 'Tempo de serviço', 'Outros',
]

const TIPO_EMOJI: Record<string, string> = {
  Produtividade: '⚡', Assiduidade: '📅', Segurança: '🦺',
  Desempenho: '🏆', 'Tempo de serviço': '⏱️', Outros: '🎁',
}

const EMPTY_FORM: FormData = {
  colaborador_id: '', obra_id: '', tipo: '', descricao: '', valor: '',
  data: new Date().toISOString().slice(0, 10),
  competencia: new Date().toISOString().slice(0, 7),
  observacoes: '',
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

// ─── componente ──────────────────────────────────────────────────────────────
export default function Premios() {
  const [rows,         setRows]         = useState<PremioRow[]>([])
  const [colaboradores, setColaboradores] = useState<Pick<Colaborador, 'id' | 'nome' | 'chapa'>[]>([])
  const [obras,        setObras]        = useState<Pick<Obra, 'id' | 'nome'>[]>([])
  const [loading,      setLoading]      = useState(true)

  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7))
  const [filtroColaborador, setFiltroColaborador] = useState('')
  const [filtroTipo,        setFiltroTipo]        = useState('todos')

  const [modalOpen, setModalOpen] = useState(false)
  const [editando,  setEditando]  = useState<PremioRow | null>(null)
  const [form,      setForm]      = useState<FormData>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [deleteId,  setDeleteId]  = useState<string | null>(null)

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [premRes, colRes, obrRes] = await Promise.all([
      supabase.from('premios').select('*, colaboradores(nome,chapa)')
        .eq('competencia', competencia)
        .order('data', { ascending: false }),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status','ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    if (premRes.error) toast.error('Erro ao carregar prêmios')
    else setRows((premRes.data as PremioRow[]) ?? [])
    if (colRes.data) setColaboradores(colRes.data)
    if (obrRes.data) setObras(obrRes.data)
    setLoading(false)
  }, [competencia])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── filtro local ──────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    const matchCol  = filtroColaborador ? r.colaboradores?.nome.toLowerCase().includes(filtroColaborador.toLowerCase()) : true
    const matchTipo = filtroTipo !== 'todos' ? r.tipo === filtroTipo : true
    return matchCol && matchTipo
  })

  const totalPeriodo = filtered.reduce((s, r) => s + (r.valor ?? 0), 0)

  // ─── modal helpers ─────────────────────────────────────────────────────────
  function setField(k: keyof FormData, v: string) { setForm(p => ({ ...p, [k]: v })) }

  function openCreate() {
    setEditando(null)
    setForm({ ...EMPTY_FORM, competencia })
    setModalOpen(true)
  }
  function openEdit(row: PremioRow) {
    setEditando(row)
    setForm({
      colaborador_id: row.colaborador_id,
      obra_id:        row.obra_id ?? '',
      tipo:           row.tipo ?? '',
      descricao:      row.descricao,
      valor:          String(row.valor ?? ''),
      data:           row.data,
      competencia:    row.competencia ?? '',
      observacoes:    row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  // ─── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.descricao.trim()) return toast.error('Descrição obrigatória')
    if (!form.valor) return toast.error('Valor obrigatório')
    if (!form.data) return toast.error('Data obrigatória')
    setSaving(true)
    const payload = {
      colaborador_id: form.colaborador_id,
      obra_id:        form.obra_id || null,
      tipo:           form.tipo || null,
      descricao:      form.descricao,
      valor:          parseFloat(form.valor) || null,
      data:           form.data,
      competencia:    form.competencia || null,
      observacoes:    form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('premios').update(payload).eq('id', editando.id)
      : await supabase.from('premios').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? '🏆 Prêmio atualizado!' : '🏆 Prêmio registrado!')
    setModalOpen(false); fetchData()
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('premios').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Prêmio excluído!'); fetchData() }
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontWeight:800, fontSize:22, margin:0, display:'flex', alignItems:'center', gap:8 }}>
            <Gift size={22} style={{ color:'#f59e0b' }}/> Prêmios e Bonificações
          </h1>
          <p style={{ fontSize:13, color:'var(--muted-foreground)', marginTop:4 }}>
            Registro de prêmios e bonificações dos colaboradores
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
          { label:'🏆 Total do período', value: formatCurrency(totalPeriodo), sub:`${rows.length} prêmio(s)`, bg:'#fef3c7', border:'#fde68a', color:'#b45309' },
          { label:'⚡ Produtividade',    value: String(rows.filter(r=>r.tipo==='Produtividade').length), sub:'prêmio(s)', bg:'#ede9fe', border:'#ddd6fe', color:'#7c3aed' },
          { label:'📅 Assiduidade',      value: String(rows.filter(r=>r.tipo==='Assiduidade').length), sub:'prêmio(s)', bg:'#dcfce7', border:'#bbf7d0', color:'#15803d' },
          { label:'🎁 Outros tipos',     value: String(rows.filter(r=>!['Produtividade','Assiduidade'].includes(r.tipo??'')).length), sub:'prêmio(s)', bg:'#eff6ff', border:'#bfdbfe', color:'#1d4ed8' },
        ].map((c, i) => (
          <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:'14px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:c.color, marginBottom:4 }}>{c.label}</div>
            <div style={{ fontWeight:800, fontSize:18, color:c.color }}>{c.value}</div>
            <div style={{ fontSize:11, color:c.color, opacity:.75, marginTop:2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros + botão ── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'flex-end' }}>
        <div style={{ position:'relative' }}>
          <Search size={13} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#9ca3af', pointerEvents:'none' }}/>
          <input placeholder="Buscar colaborador…" value={filtroColaborador} onChange={e => setFiltroColaborador(e.target.value)}
            style={{ height:32, paddingLeft:26, paddingRight:10, fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', width:180 }}/>
        </div>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          style={{ height:32, padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)' }}>
          <option value="todos">Todos os tipos</option>
          {TIPO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(filtroColaborador || filtroTipo !== 'todos') && (
          <button onClick={() => { setFiltroColaborador(''); setFiltroTipo('todos') }}
            style={{ height:32, padding:'0 10px', fontSize:12, border:'1.5px solid var(--border)', borderRadius:6, background:'transparent', cursor:'pointer', color:'var(--muted-foreground)' }}>
            ✕ Limpar
          </button>
        )}
        <button onClick={fetchData}
          style={{ width:32, height:32, borderRadius:6, border:'1.5px solid var(--border)', background:'var(--background)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <RefreshCw size={13}/>
        </button>
        <Button onClick={openCreate} style={{ marginLeft:'auto', background:'#f59e0b', color:'#fff', gap:6 }}>
          <Plus size={15}/> Novo Prêmio
        </Button>
      </div>

      {/* ── Tabela ── */}
      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--muted-foreground)' }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:60, textAlign:'center', color:'var(--muted-foreground)', border:'1px dashed var(--border)', borderRadius:12 }}>
          <Gift size={32} style={{ opacity:.3, marginBottom:8 }}/>
          <div style={{ fontWeight:600 }}>Nenhum prêmio em {mesLabel(competencia)}</div>
          <div style={{ fontSize:12, marginTop:4 }}>Clique em "+ Novo Prêmio" para registrar.</div>
        </div>
      ) : (
        <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--muted)', borderBottom:'2px solid var(--border)' }}>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700 }}>Colaborador</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700 }}>Tipo</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700 }}>Descrição</th>
                <th style={{ padding:'10px 14px', textAlign:'center', fontWeight:700 }}>Data</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700 }}>Valor</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.id} style={{ borderBottom:'1px solid var(--border)', background: i%2===0 ? 'var(--card)' : 'transparent' }}>
                  <td style={{ padding:'10px 14px' }}>
                    <div style={{ fontWeight:600 }}>{row.colaboradores?.nome ?? '—'}</div>
                    <div style={{ fontSize:11, color:'var(--muted-foreground)' }}>{row.colaboradores?.chapa}</div>
                  </td>
                  <td style={{ padding:'10px 14px' }}>
                    <span style={{ fontSize:12, fontWeight:600, borderRadius:6, padding:'3px 9px', background:'#fef3c7', color:'#b45309' }}>
                      {TIPO_EMOJI[row.tipo ?? ''] ?? '🎁'} {row.tipo ?? '—'}
                    </span>
                  </td>
                  <td style={{ padding:'10px 14px', color:'var(--muted-foreground)', maxWidth:200 }}>
                    <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={row.descricao}>
                      {row.descricao}
                    </span>
                  </td>
                  <td style={{ padding:'10px 14px', textAlign:'center', color:'var(--muted-foreground)', fontSize:12 }}>
                    {formatDate(row.data)}
                  </td>
                  <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, color:'#f59e0b', fontSize:14 }}>
                    {formatCurrency(row.valor)}
                  </td>
                  <td style={{ padding:'10px 14px', textAlign:'right' }}>
                    <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      <button onClick={() => openEdit(row)}
                        style={{ width:28, height:28, borderRadius:6, border:'1px solid var(--border)', background:'var(--muted)', color:'var(--foreground)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Pencil size={12}/>
                      </button>
                      <button onClick={() => setDeleteId(row.id)}
                        style={{ width:28, height:28, borderRadius:6, border:'1px solid #fecaca', background:'#fff5f5', color:'#dc2626', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background:'var(--muted)', borderTop:'2px solid var(--border)' }}>
                <td colSpan={4} style={{ padding:'10px 14px', fontSize:12, color:'var(--muted-foreground)' }}>
                  {filtered.length} prêmio(s) exibido(s)
                </td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:800, color:'#f59e0b', fontSize:14 }}>
                  {formatCurrency(totalPeriodo)}
                </td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ══ MODAL CRIAR / EDITAR ══ */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, padding:28, width:'100%', maxWidth:520, boxShadow:'0 25px 50px rgba(0,0,0,.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <h2 style={{ fontWeight:800, fontSize:17, margin:'0 0 20px' }}>
              {editando ? '✏️ Editar Prêmio' : '🏆 Novo Prêmio'}
            </h2>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <Label className="mb-1 block">Colaborador *</Label>
                <Select value={form.colaborador_id} onValueChange={v => setField('colaborador_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar…"/></SelectTrigger>
                  <SelectContent>
                    {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.chapa} — {c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Tipo</Label>
                <Select value={form.tipo || 'nenhum'} onValueChange={v => setField('tipo', v === 'nenhum' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar tipo"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem tipo</SelectItem>
                    {TIPO_OPTIONS.map(t => <SelectItem key={t} value={t}>{TIPO_EMOJI[t]} {t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Valor (R$) *</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={e => setField('valor', e.target.value)} placeholder="0,00"/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label className="mb-1 block">Descrição *</Label>
                <Input value={form.descricao} onChange={e => setField('descricao', e.target.value)} placeholder="Descreva o prêmio…"/>
              </div>
              <div>
                <Label className="mb-1 block">Data *</Label>
                <input type="date" value={form.data} onChange={e => setField('data', e.target.value)}
                  style={{ height:36, width:'100%', padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', boxSizing:'border-box' }}/>
              </div>
              <div>
                <Label className="mb-1 block">Competência</Label>
                <input type="month" value={form.competencia} onChange={e => setField('competencia', e.target.value)}
                  style={{ height:36, width:'100%', padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', boxSizing:'border-box' }}/>
              </div>
              <div>
                <Label className="mb-1 block">Obra</Label>
                <Select value={form.obra_id || 'nenhuma'} onValueChange={v => setField('obra_id', v === 'nenhuma' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Sem obra"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Sem obra</SelectItem>
                    {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label className="mb-1 block">Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setField('observacoes', e.target.value)} rows={2} placeholder="Observações…"/>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:18 }}>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button disabled={saving} onClick={handleSave} style={{ background:'#f59e0b', color:'#fff' }}>
                {saving ? 'Salvando…' : editando ? '💾 Salvar' : '🏆 Registrar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRMAR EXCLUIR ══ */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🗑️ Excluir prêmio?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ background:'#dc2626', color:'#fff' }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
