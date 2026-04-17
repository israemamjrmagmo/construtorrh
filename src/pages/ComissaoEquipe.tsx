import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Users, Plus, Pencil, Trash2, Search, Building2,
  CheckCircle2, XCircle, Award, AlertTriangle, HardHat,
  ChevronRight, RotateCcw, DollarSign, Trophy,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useProfile } from '@/hooks/useProfile'
import { traduzirErro } from '@/lib/erros'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Encarregado {
  id: string
  nome: string
  matricula: string | null
  obra_id: string | null
  colaborador_id: string | null
  telefone: string | null
  ativo: boolean
  observacoes: string | null
  obras?: { nome: string } | null
  colaboradores?: { nome: string; chapa: string | null } | null
}

interface ComissaoRow {
  id: string
  encarregado_id: string
  colaborador_id: string
  obra_id: string | null
  playbook_atividade_id: string | null
  descricao_atividade: string | null
  quantidade: number
  preco_unitario: number
  valor_producao: number
  comissao_pct: number
  valor_comissao_bruto: number
  num_retrabalhos: number
  fator_comissao: number
  valor_comissao_final: number
  competencia: string
  status: string
  premio_id: string | null
  observacoes: string | null
  data_lancamento: string
  encarregados?: { nome: string }
  colaboradores?: { nome: string; chapa: string | null }
  obras?: { nome: string } | null
}

interface Obra        { id: string; nome: string }
interface Colaborador { id: string; nome: string; chapa: string | null }
interface Atividade   { id: string; descricao: string; unidade: string; categoria: string | null; comissao_encarregado: number | null }

type Aba = 'encarregados' | 'comissoes'

// ─── Regra de retrabalho ──────────────────────────────────────────────────────
// 0 retrabalhos → fator 1.0 (100%) → comissão total
// 1 retrabalho  → fator 0.5 (50%)  → meia comissão
// 2+ retrabalhos → fator 0.0 (0%)  → perde tudo
function calcFator(numRetrabalhos: number): number {
  if (numRetrabalhos === 0) return 1.0
  if (numRetrabalhos === 1) return 0.5
  return 0.0
}

function retrabalhoLabel(n: number) {
  if (n === 0) return { label: '✅ Aprovado', cor: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' }
  if (n === 1) return { label: '⚠️ 1 retrabalho (50%)', cor: '#b45309', bg: '#fffbeb', border: '#fde68a' }
  return { label: `🚫 ${n} retrabalhos (0%)`, cor: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym: string) { if (!ym) return '—'; const [y,m] = ym.split('-'); return `${MESES[+m-1]} / ${y}` }

const STATUS_COR: Record<string,{bg:string;border:string;cor:string;label:string}> = {
  pendente:  { bg:'#fef3c7', border:'#fde68a', cor:'#b45309', label:'⏳ Pendente'  },
  aprovado:  { bg:'#dcfce7', border:'#bbf7d0', cor:'#15803d', label:'✅ Aprovado'  },
  cancelado: { bg:'#fee2e2', border:'#fecaca', cor:'#dc2626', label:'❌ Cancelado' },
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function ComissaoEquipe() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()
  const [aba, setAba] = useState<Aba>('encarregados')

  // ─── Dados base ────────────────────────────────────────────────────────────
  const [encarregados, setEncarregados] = useState<Encarregado[]>([])
  const [comissoes,    setComissoes]    = useState<ComissaoRow[]>([])
  const [obras,        setObras]        = useState<Obra[]>([])
  const [colaboradores,setColaboradores]= useState<Colaborador[]>([])
  const [atividades,   setAtividades]   = useState<Atividade[]>([])
  const [loading, setLoading] = useState(true)

  // ─── Aba Encarregados ──────────────────────────────────────────────────────
  const [searchEnc, setSearchEnc]       = useState('')
  const [modalEnc,  setModalEnc]        = useState(false)
  const [editEnc,   setEditEnc]         = useState<Encarregado | null>(null)
  const [formEnc,   setFormEnc]         = useState(encEmpty())
  const [savingEnc, setSavingEnc]       = useState(false)
  const [deleteEnc, setDeleteEnc]       = useState<Encarregado | null>(null)

  // ─── Aba Comissões ─────────────────────────────────────────────────────────
  const [competencia, setCompetencia]   = useState(new Date().toISOString().slice(0,7))
  const [filtroEnc,   setFiltroEnc]     = useState('todos')
  const [filtroObra,  setFiltroObra]    = useState('todas')
  const [filtroStatus,setFiltroStatus]  = useState('todos')
  const [busca, setBusca]               = useState('')
  const [modalCom,  setModalCom]        = useState(false)
  const [editCom,   setEditCom]         = useState<ComissaoRow | null>(null)
  const [formCom,   setFormCom]         = useState(comEmpty())
  const [savingCom, setSavingCom]       = useState(false)
  const [deleteCom, setDeleteCom]       = useState<ComissaoRow | null>(null)
  const [aprovarCom,setAprovarCom]      = useState<ComissaoRow | null>(null)
  const [cancelarCom,setCancelarCom]    = useState<ComissaoRow | null>(null)

  function encEmpty() {
    return { nome:'', matricula:'', obra_id:'', colaborador_id:'', telefone:'', ativo:true, observacoes:'' }
  }
  function comEmpty() {
    return {
      encarregado_id:'', colaborador_id:'', obra_id:'', playbook_atividade_id:'',
      descricao_atividade:'', quantidade:'', preco_unitario:'', comissao_pct:'',
      num_retrabalhos: 0, competencia, observacoes:'',
      data_lancamento: new Date().toISOString().slice(0,10),
    }
  }

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [encRes, comRes, obrRes, colRes, ativRes] = await Promise.all([
      supabase.from('encarregados').select('*, obras(nome), colaboradores(nome,chapa)').order('nome'),
      supabase.from('comissoes_equipe').select('*, encarregados(nome), colaboradores(nome,chapa), obras(nome)')
        .eq('competencia', competencia).order('created_at', { ascending: false }),
      supabase.from('obras').select('id,nome').order('nome'),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status','ativo').order('nome'),
      supabase.from('playbook_atividades').select('id,descricao,unidade,categoria,comissao_encarregado').eq('ativo',true).order('descricao'),
    ])
    setEncarregados((encRes.data ?? []) as Encarregado[])
    setComissoes((comRes.data ?? []) as ComissaoRow[])
    setObras((obrRes.data ?? []) as Obra[])
    setColaboradores((colRes.data ?? []) as Colaborador[])
    setAtividades((ativRes.data ?? []) as Atividade[])
    setLoading(false)
  }, [competencia])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── CRUD Encarregados ─────────────────────────────────────────────────────
  function openNovoEnc() {
    setEditEnc(null); setFormEnc(encEmpty()); setModalEnc(true)
  }
  function openEditEncFn(e: Encarregado) {
    setEditEnc(e)
    setFormEnc({
      nome: e.nome, matricula: e.matricula ?? '', obra_id: e.obra_id ?? '',
      colaborador_id: e.colaborador_id ?? '', telefone: e.telefone ?? '',
      ativo: e.ativo, observacoes: e.observacoes ?? '',
    })
    setModalEnc(true)
  }

  async function handleSaveEnc() {
    if (!formEnc.nome.trim()) { toast.error('Informe o nome do encarregado'); return }
    setSavingEnc(true)
    const payload = {
      nome: formEnc.nome.trim(),
      matricula: formEnc.matricula?.trim() || null,
      obra_id: formEnc.obra_id || null,
      colaborador_id: formEnc.colaborador_id || null,
      telefone: formEnc.telefone?.trim() || null,
      ativo: formEnc.ativo,
      observacoes: formEnc.observacoes?.trim() || null,
    }
    const { error } = editEnc
      ? await supabase.from('encarregados').update(payload).eq('id', editEnc.id)
      : await supabase.from('encarregados').insert(payload)
    setSavingEnc(false)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success(editEnc ? 'Encarregado atualizado!' : 'Encarregado cadastrado!')
    setModalEnc(false); fetchData()
  }

  async function handleDeleteEnc() {
    if (!deleteEnc) return
    const { error } = await supabase.from('encarregados').delete().eq('id', deleteEnc.id)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success('Encarregado excluído!'); setDeleteEnc(null); fetchData()
  }

  // ─── CRUD Comissões ────────────────────────────────────────────────────────
  function openNovaCom() {
    setEditCom(null); setFormCom(comEmpty()); setModalCom(true)
  }
  function openEditComFn(c: ComissaoRow) {
    setEditCom(c)
    setFormCom({
      encarregado_id: c.encarregado_id, colaborador_id: c.colaborador_id,
      obra_id: c.obra_id ?? '', playbook_atividade_id: c.playbook_atividade_id ?? '',
      descricao_atividade: c.descricao_atividade ?? '',
      quantidade: String(c.quantidade), preco_unitario: String(c.preco_unitario),
      comissao_pct: String(c.comissao_pct), num_retrabalhos: c.num_retrabalhos,
      competencia: c.competencia, observacoes: c.observacoes ?? '',
      data_lancamento: c.data_lancamento,
    })
    setModalCom(true)
  }

  // Preencher automaticamente % comissão ao selecionar atividade
  function onSelectAtividade(ativId: string) {
    const atv = atividades.find(a => a.id === ativId)
    setFormCom(p => ({
      ...p,
      playbook_atividade_id: ativId,
      descricao_atividade: atv?.descricao ?? '',
      comissao_pct: atv?.comissao_encarregado != null ? String(atv.comissao_encarregado) : p.comissao_pct,
    }))
  }

  async function handleSaveCom() {
    if (!formCom.encarregado_id) { toast.error('Selecione o encarregado'); return }
    if (!formCom.colaborador_id) { toast.error('Selecione o colaborador'); return }
    const qtd       = parseFloat(formCom.quantidade)    || 0
    const preco     = parseFloat(formCom.preco_unitario) || 0
    const pct       = parseFloat(formCom.comissao_pct)  || 0
    const valorProd = qtd * preco
    const valBruto  = valorProd * (pct / 100)
    const fator     = calcFator(formCom.num_retrabalhos)
    const valFinal  = valBruto * fator

    setSavingCom(true)
    const payload = {
      encarregado_id:       formCom.encarregado_id,
      colaborador_id:       formCom.colaborador_id,
      obra_id:              formCom.obra_id || null,
      playbook_atividade_id: formCom.playbook_atividade_id || null,
      descricao_atividade:  formCom.descricao_atividade?.trim() || null,
      quantidade:           qtd,
      preco_unitario:       preco,
      valor_producao:       valorProd,
      comissao_pct:         pct,
      valor_comissao_bruto: valBruto,
      num_retrabalhos:      formCom.num_retrabalhos,
      fator_comissao:       fator,
      valor_comissao_final: valFinal,
      competencia:          formCom.competencia,
      observacoes:          formCom.observacoes?.trim() || null,
      data_lancamento:      formCom.data_lancamento,
    }
    const { error } = editCom
      ? await supabase.from('comissoes_equipe').update(payload).eq('id', editCom.id)
      : await supabase.from('comissoes_equipe').insert(payload)
    setSavingCom(false)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success(editCom ? 'Comissão atualizada!' : 'Comissão lançada!')
    setModalCom(false); fetchData()
  }

  async function handleDeleteCom() {
    if (!deleteCom) return
    const { error } = await supabase.from('comissoes_equipe').delete().eq('id', deleteCom.id)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success('Lançamento excluído!'); setDeleteCom(null); fetchData()
  }

  // ─── Aprovar: cria Prêmio e vincula ────────────────────────────────────────
  async function handleAprovar() {
    if (!aprovarCom) return
    if (aprovarCom.valor_comissao_final <= 0) {
      toast.error('Valor final da comissão é zero — revise os retrabalhos.')
      setAprovarCom(null); return
    }
    // 1. Criar prêmio
    const enc = encarregados.find(e => e.id === aprovarCom.encarregado_id)
    const { data: premioData, error: premioErr } = await supabase.from('premios').insert({
      colaborador_id: aprovarCom.colaborador_id,
      obra_id:        aprovarCom.obra_id,
      tipo:           'Produtividade',
      descricao:      `Comissão Encarregado — ${aprovarCom.descricao_atividade ?? 'Atividade'} | Enc.: ${enc?.nome ?? ''}`,
      valor:          aprovarCom.valor_comissao_final,
      data:           new Date().toISOString().slice(0,10),
      competencia:    aprovarCom.competencia,
      observacoes:    `Comissão aprovada automaticamente. Retrabalhos: ${aprovarCom.num_retrabalhos}. Fator: ${(aprovarCom.fator_comissao * 100).toFixed(0)}%.`,
      status:         'pendente',
    }).select('id').single()
    if (premioErr || !premioData) { toast.error('Erro ao criar prêmio'); return }
    // 2. Atualizar comissão
    await supabase.from('comissoes_equipe').update({ status:'aprovado', premio_id: premioData.id }).eq('id', aprovarCom.id)
    toast.success('Comissão aprovada! Prêmio gerado automaticamente.')
    setAprovarCom(null); fetchData()
  }

  async function handleCancelar() {
    if (!cancelarCom) return
    await supabase.from('comissoes_equipe').update({ status:'cancelado' }).eq('id', cancelarCom.id)
    toast.success('Comissão cancelada.'); setCancelarCom(null); fetchData()
  }

  // ─── Filtros ───────────────────────────────────────────────────────────────
  const encFiltrados = useMemo(() => {
    const q = searchEnc.toLowerCase()
    return encarregados.filter(e =>
      !q || e.nome.toLowerCase().includes(q) || (e.matricula ?? '').toLowerCase().includes(q)
    )
  }, [encarregados, searchEnc])

  const comFiltradas = useMemo(() => {
    const q = busca.toLowerCase()
    return comissoes.filter(c =>
      (filtroEnc  === 'todos'  || c.encarregado_id === filtroEnc) &&
      (filtroObra === 'todas'  || c.obra_id === filtroObra) &&
      (filtroStatus === 'todos'|| c.status === filtroStatus) &&
      (!q || (c.descricao_atividade ?? '').toLowerCase().includes(q) ||
             (c.colaboradores?.nome ?? '').toLowerCase().includes(q) ||
             (c.encarregados?.nome  ?? '').toLowerCase().includes(q))
    )
  }, [comissoes, filtroEnc, filtroObra, filtroStatus, busca])

  // ─── Totalizadores ─────────────────────────────────────────────────────────
  const totalBruto  = comFiltradas.reduce((s,c)=>s+c.valor_comissao_bruto,  0)
  const totalFinal  = comFiltradas.reduce((s,c)=>s+c.valor_comissao_final, 0)
  const totalAprov  = comFiltradas.filter(c=>c.status==='aprovado').reduce((s,c)=>s+c.valor_comissao_final,0)

  // ─── Cálculo prévia no modal ────────────────────────────────────────────────
  const prevQtd    = parseFloat(formCom.quantidade)    || 0
  const prevPreco  = parseFloat(formCom.preco_unitario) || 0
  const prevPct    = parseFloat(formCom.comissao_pct)  || 0
  const prevProd   = prevQtd * prevPreco
  const prevBruto  = prevProd * (prevPct / 100)
  const prevFator  = calcFator(formCom.num_retrabalhos)
  const prevFinal  = prevBruto * prevFator

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding:'20px 24px', maxWidth:1400, margin:'0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#d97706)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Trophy size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, color:'#1e293b', margin:0 }}>Comissão de Equipe</h1>
            <p style={{ fontSize:12, color:'#64748b', margin:0 }}>Gerencie encarregados e calcule comissões por produção</p>
          </div>
        </div>
        {aba === 'encarregados' && canCreate && (
          <Button onClick={openNovoEnc} style={{ gap:6 }}>
            <Plus size={15}/> Novo Encarregado
          </Button>
        )}
        {aba === 'comissoes' && canCreate && (
          <Button onClick={openNovaCom} style={{ gap:6, background:'#f59e0b', color:'#fff' }}>
            <Plus size={15}/> Lançar Comissão
          </Button>
        )}
      </div>

      {/* ── Abas ───────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'#f1f5f9', borderRadius:10, padding:4, width:'fit-content' }}>
        {([
          { id:'encarregados', label:'👷 Encarregados' },
          { id:'comissoes',    label:'💰 Cálculo de Comissões' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            style={{
              padding:'7px 18px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
              background: aba === t.id ? '#fff' : 'transparent',
              color: aba === t.id ? '#0d3f56' : '#64748b',
              boxShadow: aba === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              transition:'all 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ABA: ENCARREGADOS
      ══════════════════════════════════════════════════════════════════════ */}
      {aba === 'encarregados' && (
        <div>
          {/* Busca */}
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <div style={{ position:'relative', flex:1, maxWidth:380 }}>
              <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/>
              <Input value={searchEnc} onChange={e=>setSearchEnc(e.target.value)} placeholder="Buscar encarregado…" style={{ paddingLeft:32 }}/>
            </div>
          </div>

          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>Carregando…</div>
          ) : encFiltrados.length === 0 ? (
            <div style={{ padding:60, textAlign:'center', color:'#94a3b8' }}>
              <HardHat size={40} style={{ marginBottom:12, opacity:0.3 }}/>
              <div style={{ fontWeight:600, marginBottom:4 }}>Nenhum encarregado cadastrado</div>
              <div style={{ fontSize:12 }}>Clique em "Novo Encarregado" para começar.</div>
            </div>
          ) : (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              <Table>
                <TableHeader>
                  <TableRow style={{ background:'#f8fafc' }}>
                    <TableHead>Nome</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Obra Principal</TableHead>
                    <TableHead>Colaborador Vinculado</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead style={{ textAlign:'center' }}>Status</TableHead>
                    {(canEdit || canDelete) && <TableHead style={{ textAlign:'center' }}>Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {encFiltrados.map((e, idx) => (
                    <TableRow key={e.id} style={{ background: idx%2===0?'transparent':'#fafafa' }}>
                      <TableCell style={{ fontWeight:700, color:'#1e293b' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:32,height:32,borderRadius:9,background:'linear-gradient(135deg,#f59e0b,#d97706)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                            <HardHat size={15} color="#fff"/>
                          </div>
                          {e.nome}
                        </div>
                      </TableCell>
                      <TableCell style={{ fontFamily:'monospace', fontSize:12 }}>{e.matricula ?? '—'}</TableCell>
                      <TableCell>{e.obras?.nome ?? '—'}</TableCell>
                      <TableCell>{e.colaboradores ? `${e.colaboradores.nome}${e.colaboradores.chapa ? ` (${e.colaboradores.chapa})` : ''}` : '—'}</TableCell>
                      <TableCell>{e.telefone ?? '—'}</TableCell>
                      <TableCell style={{ textAlign:'center' }}>
                        <span style={{ fontSize:11,padding:'2px 9px',borderRadius:20,fontWeight:600,
                          background: e.ativo?'rgba(22,163,74,0.1)':'rgba(220,38,38,0.1)',
                          color: e.ativo?'#15803d':'#dc2626' }}>
                          {e.ativo?'Ativo':'Inativo'}
                        </span>
                      </TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell style={{ textAlign:'center' }}>
                          <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                            {canEdit && (
                              <Button variant="ghost" size="icon" style={{ width:28,height:28 }} onClick={() => openEditEncFn(e)}>
                                <Pencil size={13} color="#64748b"/>
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="icon" style={{ width:28,height:28 }} onClick={() => setDeleteEnc(e)}>
                                <Trash2 size={13} color="#dc2626"/>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ABA: COMISSÕES
      ══════════════════════════════════════════════════════════════════════ */}
      {aba === 'comissoes' && (
        <div>
          {/* Filtros */}
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            {/* Mês */}
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', borderRadius:9, border:'1px solid #e2e8f0', padding:'6px 12px' }}>
              <span style={{ fontSize:12,fontWeight:600,color:'#64748b' }}>Competência:</span>
              <input type="month" value={competencia} onChange={e=>setCompetencia(e.target.value)}
                style={{ border:'none', outline:'none', fontSize:13, fontWeight:700, color:'#0d3f56', background:'transparent' }}/>
            </div>
            {/* Encarregado */}
            <Select value={filtroEnc} onValueChange={setFiltroEnc}>
              <SelectTrigger style={{ width:200 }}><SelectValue placeholder="Encarregado"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os encarregados</SelectItem>
                {encarregados.map(e=><SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Obra */}
            <Select value={filtroObra} onValueChange={setFiltroObra}>
              <SelectTrigger style={{ width:180 }}><SelectValue placeholder="Obra"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as obras</SelectItem>
                {obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Status */}
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger style={{ width:160 }}><SelectValue placeholder="Status"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pendente">⏳ Pendente</SelectItem>
                <SelectItem value="aprovado">✅ Aprovado</SelectItem>
                <SelectItem value="cancelado">❌ Cancelado</SelectItem>
              </SelectContent>
            </Select>
            {/* Busca */}
            <div style={{ position:'relative', flex:1, minWidth:200 }}>
              <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/>
              <Input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar atividade, colaborador…" style={{ paddingLeft:30 }}/>
            </div>
          </div>

          {/* Cards de totais */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:16 }}>
            {[
              { label:'Total Bruto', valor: formatCurrency(totalBruto), cor:'#0d3f56', bg:'#f0f9ff', icon:'📊' },
              { label:'Total Final (após retrabalho)', valor: formatCurrency(totalFinal), cor:'#b45309', bg:'#fffbeb', icon:'⚖️' },
              { label:'Aprovados (irão para Prêmios)', valor: formatCurrency(totalAprov), cor:'#15803d', bg:'#f0fdf4', icon:'✅' },
            ].map(card => (
              <div key={card.label} style={{ background:card.bg, border:`1px solid ${card.cor}22`, borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginBottom:4 }}>{card.icon} {card.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color:card.cor }}>{card.valor}</div>
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>Carregando…</div>
          ) : comFiltradas.length === 0 ? (
            <div style={{ padding:60, textAlign:'center', color:'#94a3b8', background:'#fff', borderRadius:12, border:'1px solid #e2e8f0' }}>
              <Trophy size={40} style={{ marginBottom:12, opacity:0.25 }}/>
              <div style={{ fontWeight:600, marginBottom:4 }}>Nenhuma comissão nesta competência</div>
              <div style={{ fontSize:12 }}>Use "Lançar Comissão" para registrar uma produção vinculada a encarregado.</div>
            </div>
          ) : (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <Table>
                  <TableHeader>
                    <TableRow style={{ background:'#f8fafc' }}>
                      <TableHead>Encarregado</TableHead>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Atividade</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead style={{ textAlign:'right' }}>Qtd</TableHead>
                      <TableHead style={{ textAlign:'right' }}>Preço Unit.</TableHead>
                      <TableHead style={{ textAlign:'right' }}>Produção</TableHead>
                      <TableHead style={{ textAlign:'right' }}>% Comis.</TableHead>
                      <TableHead style={{ textAlign:'center' }}>Retrabalho</TableHead>
                      <TableHead style={{ textAlign:'right' }}>Valor Final</TableHead>
                      <TableHead style={{ textAlign:'center' }}>Status</TableHead>
                      <TableHead style={{ textAlign:'center' }}>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comFiltradas.map((c, idx) => {
                      const rt = retrabalhoLabel(c.num_retrabalhos)
                      const st = STATUS_COR[c.status] ?? STATUS_COR.pendente
                      return (
                        <TableRow key={c.id} style={{ background: idx%2===0?'transparent':'#fafafa' }}>
                          <TableCell style={{ fontWeight:700, fontSize:13 }}>{c.encarregados?.nome ?? '—'}</TableCell>
                          <TableCell style={{ fontSize:12 }}>
                            {c.colaboradores?.nome ?? '—'}
                            {c.colaboradores?.chapa && <span style={{ color:'#94a3b8', fontSize:10 }}> ({c.colaboradores.chapa})</span>}
                          </TableCell>
                          <TableCell style={{ fontSize:12, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.descricao_atividade ?? '—'}</TableCell>
                          <TableCell style={{ fontSize:12, color:'#64748b' }}>{c.obras?.nome ?? '—'}</TableCell>
                          <TableCell style={{ textAlign:'right', fontSize:12 }}>{c.quantidade.toLocaleString('pt-BR')}</TableCell>
                          <TableCell style={{ textAlign:'right', fontSize:12 }}>{formatCurrency(c.preco_unitario)}</TableCell>
                          <TableCell style={{ textAlign:'right', fontSize:12, fontWeight:600 }}>{formatCurrency(c.valor_producao)}</TableCell>
                          <TableCell style={{ textAlign:'right', fontSize:12 }}>{c.comissao_pct}%</TableCell>
                          <TableCell style={{ textAlign:'center' }}>
                            <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, background:rt.bg, color:rt.cor, border:`1px solid ${rt.border}`, whiteSpace:'nowrap' }}>
                              {rt.label}
                            </span>
                          </TableCell>
                          <TableCell style={{ textAlign:'right', fontWeight:800, fontSize:14,
                            color: c.valor_comissao_final > 0 ? '#15803d' : '#dc2626' }}>
                            {formatCurrency(c.valor_comissao_final)}
                          </TableCell>
                          <TableCell style={{ textAlign:'center' }}>
                            <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20,
                              background:st.bg, color:st.cor, border:`1px solid ${st.border}`, whiteSpace:'nowrap' }}>
                              {st.label}
                            </span>
                          </TableCell>
                          <TableCell style={{ textAlign:'center' }}>
                            <div style={{ display:'flex', gap:3, justifyContent:'center' }}>
                              {c.status === 'pendente' && (
                                <>
                                  {canEdit && (
                                    <Button variant="ghost" size="icon" style={{ width:26,height:26 }} title="Editar" onClick={()=>openEditComFn(c)}>
                                      <Pencil size={12} color="#64748b"/>
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" style={{ width:26,height:26 }} title="Aprovar → gerar Prêmio" onClick={()=>setAprovarCom(c)}>
                                    <CheckCircle2 size={12} color="#15803d"/>
                                  </Button>
                                  <Button variant="ghost" size="icon" style={{ width:26,height:26 }} title="Cancelar" onClick={()=>setCancelarCom(c)}>
                                    <XCircle size={12} color="#dc2626"/>
                                  </Button>
                                </>
                              )}
                              {c.status === 'aprovado' && (
                                <span style={{ fontSize:10, color:'#15803d' }}>✅ Premio gerado</span>
                              )}
                              {canDelete && c.status !== 'aprovado' && (
                                <Button variant="ghost" size="icon" style={{ width:26,height:26 }} title="Excluir" onClick={()=>setDeleteCom(c)}>
                                  <Trash2 size={12} color="#dc2626"/>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Novo/Editar Encarregado
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalEnc} onOpenChange={setModalEnc}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ display:'flex', alignItems:'center', gap:8 }}>
              <HardHat size={16} color="#f59e0b"/>
              {editEnc ? 'Editar Encarregado' : 'Novo Encarregado'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Nome *</Label>
                <Input value={formEnc.nome} onChange={e=>setFormEnc(p=>({...p,nome:e.target.value}))} placeholder="Nome completo"/>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Matrícula</Label>
                <Input value={formEnc.matricula} onChange={e=>setFormEnc(p=>({...p,matricula:e.target.value}))} placeholder="Ex.: ENC-001" style={{ fontFamily:'monospace' }}/>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Telefone</Label>
                <Input value={formEnc.telefone} onChange={e=>setFormEnc(p=>({...p,telefone:e.target.value}))} placeholder="(00) 00000-0000"/>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Obra Principal (opcional)</Label>
              <Select value={formEnc.obra_id || '_none'} onValueChange={v=>setFormEnc(p=>({...p,obra_id:v==='_none'?'':v}))}>
                <SelectTrigger><SelectValue placeholder="Selecione uma obra…"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Nenhuma —</SelectItem>
                  {obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Colaborador vinculado (opcional)</Label>
              <Select value={formEnc.colaborador_id || '_none'} onValueChange={v=>setFormEnc(p=>({...p,colaborador_id:v==='_none'?'':v}))}>
                <SelectTrigger><SelectValue placeholder="Vincular a um colaborador…"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Nenhum —</SelectItem>
                  {colaboradores.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa?` (${c.chapa})`:''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Observações</Label>
              <Input value={formEnc.observacoes} onChange={e=>setFormEnc(p=>({...p,observacoes:e.target.value}))} placeholder="Observações opcionais…"/>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={()=>setFormEnc(p=>({...p,ativo:!p.ativo}))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formEnc.ativo?'bg-primary':'bg-muted-foreground/30'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${formEnc.ativo?'translate-x-6':'translate-x-1'}`}/>
              </button>
              <Label className="text-sm cursor-pointer" onClick={()=>setFormEnc(p=>({...p,ativo:!p.ativo}))}>
                {formEnc.ativo?'Ativo':'Inativo'}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setModalEnc(false)}>Cancelar</Button>
            <Button disabled={savingEnc} onClick={handleSaveEnc}>{savingEnc?'Salvando…':editEnc?'Salvar':'Cadastrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Lançar/Editar Comissão
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalCom} onOpenChange={setModalCom}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Award size={16} color="#f59e0b"/>
              {editCom ? 'Editar Comissão' : 'Lançar Comissão de Equipe'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              {/* Encarregado */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Encarregado *</Label>
                <Select value={formCom.encarregado_id||'_none'} onValueChange={v=>setFormCom(p=>({...p,encarregado_id:v==='_none'?'':v}))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Selecione —</SelectItem>
                    {encarregados.filter(e=>e.ativo).map(e=><SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Colaborador */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Colaborador *</Label>
                <Select value={formCom.colaborador_id||'_none'} onValueChange={v=>setFormCom(p=>({...p,colaborador_id:v==='_none'?'':v}))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Selecione —</SelectItem>
                    {colaboradores.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa?` (${c.chapa})`:''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Obra */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Obra</Label>
                <Select value={formCom.obra_id||'_none'} onValueChange={v=>setFormCom(p=>({...p,obra_id:v==='_none'?'':v}))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Nenhuma —</SelectItem>
                    {obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Competência */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Competência</Label>
                <input type="month" value={formCom.competencia}
                  onChange={e=>setFormCom(p=>({...p,competencia:e.target.value}))}
                  style={{ height:42, padding:'0 12px', border:'1.5px solid #e5e7eb', borderRadius:10, fontSize:13, fontWeight:600, color:'#1a56a0', outline:'none' }}
                />
              </div>
            </div>
            {/* Atividade */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Atividade (Playbook)</Label>
              <Select value={formCom.playbook_atividade_id||'_none'} onValueChange={v=>onSelectAtividade(v==='_none'?'':v)}>
                <SelectTrigger><SelectValue placeholder="Selecione do playbook (preenche % automaticamente)…"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Manual (sem vínculo) —</SelectItem>
                  {atividades.map(a=><SelectItem key={a.id} value={a.id}>{a.descricao} · {a.categoria ?? 'Geral'} {a.comissao_encarregado!=null?`(${a.comissao_encarregado}% enc.)`:''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Descrição da atividade (se manual)</Label>
              <Input value={formCom.descricao_atividade} onChange={e=>setFormCom(p=>({...p,descricao_atividade:e.target.value}))} placeholder="Ex.: Reboco externo bloco A…"/>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {/* Quantidade */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Quantidade</Label>
                <Input type="number" step="0.001" min="0" value={formCom.quantidade} onChange={e=>setFormCom(p=>({...p,quantidade:e.target.value}))} placeholder="0"/>
              </div>
              {/* Preço unitário */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Preço Unitário (R$)</Label>
                <Input type="number" step="0.01" min="0" value={formCom.preco_unitario} onChange={e=>setFormCom(p=>({...p,preco_unitario:e.target.value}))} placeholder="0.00"/>
              </div>
              {/* % Comissão */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">% Comissão Encarregado</Label>
                <div style={{ position:'relative' }}>
                  <Input type="number" step="0.01" min="0" max="100" value={formCom.comissao_pct} onChange={e=>setFormCom(p=>({...p,comissao_pct:e.target.value}))} placeholder="0.00" style={{ paddingRight:26 }}/>
                  <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'#94a3b8' }}>%</span>
                </div>
              </div>
            </div>

            {/* ── Retrabalhos ── */}
            <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#c2410c', marginBottom:10 }}>
                🔁 Retrabalhos — Define a % final da comissão
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[
                  { n:0, label:'Nenhum (100%)', bg:'#f0fdf4', cor:'#15803d', border:'#bbf7d0' },
                  { n:1, label:'1× (50%)',      bg:'#fffbeb', cor:'#b45309', border:'#fde68a' },
                  { n:2, label:'2× ou mais (0%)', bg:'#fef2f2', cor:'#dc2626', border:'#fecaca' },
                ].map(opt => (
                  <button key={opt.n}
                    type="button"
                    onClick={()=>setFormCom(p=>({...p,num_retrabalhos:opt.n}))}
                    style={{
                      padding:'7px 14px', borderRadius:8, border:`2px solid ${formCom.num_retrabalhos===opt.n?opt.cor:opt.border}`,
                      background: formCom.num_retrabalhos===opt.n?opt.bg:'#fff',
                      color: formCom.num_retrabalhos===opt.n?opt.cor:'#64748b',
                      fontWeight: formCom.num_retrabalhos===opt.n?700:500,
                      fontSize:12, cursor:'pointer', transition:'all 0.15s',
                    }}
                  >{opt.label}</button>
                ))}
                {/* Input para 3+ */}
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:12, color:'#64748b' }}>Ou digitar:</span>
                  <Input type="number" min="0" value={formCom.num_retrabalhos}
                    onChange={e=>setFormCom(p=>({...p,num_retrabalhos:parseInt(e.target.value)||0}))}
                    style={{ width:60, textAlign:'center' }}/>
                </div>
              </div>
            </div>

            {/* Preview do cálculo */}
            <div style={{ background:'linear-gradient(135deg,#0d3f56,#0a3347)', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', marginBottom:8, letterSpacing:'0.05em', textTransform:'uppercase' }}>
                📊 Prévia do Cálculo
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                {[
                  { label:'Valor de Produção', valor:formatCurrency(prevProd) },
                  { label:`Comissão Bruta (${prevPct}%)`, valor:formatCurrency(prevBruto) },
                  { label:`Fator de Retrabalho`, valor:`× ${(prevFator*100).toFixed(0)}%` },
                  { label:'💰 Comissão Final', valor:formatCurrency(prevFinal), destaque:true },
                ].map(item => (
                  <div key={item.label} style={{ background: item.destaque?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.07)', borderRadius:8, padding:'8px 12px' }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', marginBottom:2 }}>{item.label}</div>
                    <div style={{ fontSize: item.destaque?17:14, fontWeight:800, color: item.destaque?'#fbbf24':'#fff' }}>{item.valor}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Observações</Label>
              <Input value={formCom.observacoes} onChange={e=>setFormCom(p=>({...p,observacoes:e.target.value}))} placeholder="Obs. adicionais…"/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setModalCom(false)}>Cancelar</Button>
            <Button disabled={savingCom} onClick={handleSaveCom} style={{ background:'#f59e0b', color:'#fff' }}>
              {savingCom?'Salvando…':editCom?'Salvar':'Lançar Comissão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Aprovar ────────────────────────────────────────────────── */}
      <AlertDialog open={!!aprovarCom} onOpenChange={o=>!o&&setAprovarCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar Comissão?</AlertDialogTitle>
            <AlertDialogDescription>
              Será gerado automaticamente um <strong>Prêmio</strong> de{' '}
              <strong>{formatCurrency(aprovarCom?.valor_comissao_final ?? 0)}</strong> para o colaborador{' '}
              <strong>{colaboradores.find(c=>c.id===aprovarCom?.colaborador_id)?.nome}</strong>.
              <br/><br/>
              <strong>Regra aplicada:</strong>{' '}
              {aprovarCom && retrabalhoLabel(aprovarCom.num_retrabalhos).label}
              <br/>
              Esta ação irá para o fluxo de Prêmios (pendente → aprovado → pago).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAprovar} style={{ background:'#15803d' }}>
              ✅ Aprovar e Gerar Prêmio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Cancelar ───────────────────────────────────────────────── */}
      <AlertDialog open={!!cancelarCom} onOpenChange={o=>!o&&setCancelarCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Comissão?</AlertDialogTitle>
            <AlertDialogDescription>
              A comissão será marcada como cancelada e não gerará prêmio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelar} style={{ background:'#dc2626' }}>Cancelar Comissão</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Excluir Encarregado ────────────────────────────────────── */}
      <AlertDialog open={!!deleteEnc} onOpenChange={o=>!o&&setDeleteEnc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Encarregado?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso excluirá <strong>{deleteEnc?.nome}</strong> e todos os lançamentos de comissão vinculados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEnc} style={{ background:'#dc2626' }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Excluir Comissão ───────────────────────────────────────── */}
      <AlertDialog open={!!deleteCom} onOpenChange={o=>!o&&setDeleteCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O lançamento de comissão será excluído permanentemente. Se um prêmio já foi gerado, ele <strong>não</strong> será afetado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCom} style={{ background:'#dc2626' }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
