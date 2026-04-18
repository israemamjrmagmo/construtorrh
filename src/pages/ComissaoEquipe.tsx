import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Users, Trash2, Search, Building2,
  CheckCircle2, XCircle, Award, HardHat,
  ChevronRight, Trophy, RefreshCw,
  AlertTriangle, RotateCcw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

interface Obra { id: string; nome: string }
interface ObraVinculo {
  id: string; obra_id: string; colaborador_id: string
  funcao: 'encarregado' | 'cabo'; ativo: boolean
  colaboradores?: { nome: string; chapa: string | null }
}
interface ProducaoItem {
  id: string; colaborador_id: string; obra_id: string | null
  playbook_item_id: string | null; quantidade: number; data: string
  num_retrabalhos?: number | null
  colaboradores?: { nome: string; chapa: string | null }
  playbook_itens?: { descricao: string; unidade: string; categoria: string | null }
}
interface PlaybookPreco {
  id: string; atividade_id: string; obra_id: string; preco_unitario: number
  valor_premiacao_enc: number | null; valor_premiacao_cabo: number | null
  playbook_atividades?: { descricao: string; unidade: string; categoria: string | null }
}
interface ComissaoRow {
  id: string; obra_id: string | null; colaborador_id: string
  funcao: 'encarregado' | 'cabo'; descricao: string | null
  quantidade_total: number; valor_unitario_premiacao: number
  valor_bruto: number; num_cabos: number; valor_final: number
  competencia: string; status: string; premio_id: string | null
  observacoes: string | null; data_geracao: string
  obras?: { nome: string } | null
  colaboradores?: { nome: string; chapa: string | null }
}
interface LinhaAtividade {
  playbook_item_id: string; descricao: string; unidade: string
  categoria: string | null; qtdTotal: number; itensProducao: ProducaoItem[]
  valorPremioEnc: number; valorPremioCabo: number
  totalPremioEnc: number; totalPremioCabo: number
}
type Aba = 'vinculos' | 'calculo'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MESES[+m - 1]} / ${y}`
}
const STATUS_COR: Record<string, { bg: string; border: string; cor: string; label: string }> = {
  pendente:  { bg: '#fef3c7', border: '#fde68a', cor: '#b45309', label: '⏳ Pendente'  },
  aprovado:  { bg: '#dcfce7', border: '#bbf7d0', cor: '#15803d', label: '✅ Aprovado'  },
  cancelado: { bg: '#fee2e2', border: '#fecaca', cor: '#dc2626', label: '❌ Cancelado' },
}
function fatorRetrabalho(n: number | null | undefined): number {
  const v = n ?? 0; if (v === 0) return 1.0; if (v === 1) return 0.5; return 0.0
}
function badgeRetrabalho(n: number | null | undefined) {
  const num = n ?? 0
  if (num === 0) return { label: '✅ 100%', bg: '#f0fdf4', cor: '#15803d', border: '#bbf7d0' }
  if (num === 1) return { label: '⚠️ 50%', bg: '#fffbeb', cor: '#b45309', border: '#fde68a' }
  return { label: '❌ Perdeu', bg: '#fee2e2', cor: '#dc2626', border: '#fecaca' }
}

export default function ComissaoEquipe() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()
  const [aba, setAba] = useState<Aba>('vinculos')
  const [obras, setObras]             = useState<Obra[]>([])
  const [vinculos, setVinculos]       = useState<ObraVinculo[]>([])
  const [precos, setPrecos]           = useState<PlaybookPreco[]>([])
  const [producoes, setProducoes]     = useState<ProducaoItem[]>([])
  const [comissoes, setComissoes]     = useState<ComissaoRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7))
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [busca, setBusca]               = useState('')
  const [obraCalcSel, setObraCalcSel]   = useState<Obra | null>(null)
  const [searchObraCalc, setSearchObraCalc] = useState('')
  const [aprovarCom, setAprovarCom]   = useState<ComissaoRow | null>(null)
  const [cancelarCom, setCancelarCom] = useState<ComissaoRow | null>(null)
  const [deleteCom, setDeleteCom]     = useState<ComissaoRow | null>(null)
  const [calculando, setCalculando]   = useState(false)
  type ModalRetrabalho = { producaoId: string; colaboradorNome: string; descricao: string; numAtual: number } | null
  const [modalRetrabalho, setModalRetrabalho] = useState<ModalRetrabalho>(null)
  const [salvandoRetrab, setSalvandoRetrab]   = useState(false)
  const [novoRetrab, setNovoRetrab]           = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const mesInicio = `${competencia}-01`; const mesFim = `${competencia}-31`
    const [obrRes, vinRes, preRes, proRes, comRes] = await Promise.all([
      supabase.from('obras').select('id, nome').order('nome'),
      supabase.from('obra_vinculos_equipe').select('*, colaboradores(nome, chapa)').eq('ativo', true),
      supabase.from('playbook_precos').select('*, playbook_atividades(descricao, unidade, categoria)'),
      supabase.from('portal_producao')
        .select('id, colaborador_id, obra_id, playbook_item_id, quantidade, data, num_retrabalhos, colaboradores(nome, chapa), playbook_itens(descricao, unidade, categoria)')
        .gte('data', mesInicio).lte('data', mesFim),
      supabase.from('comissoes_equipe_v2').select('*, obras(nome), colaboradores(nome, chapa)')
        .eq('competencia', competencia).order('created_at', { ascending: false }),
    ])
    setObras((obrRes.data ?? []) as Obra[])
    setVinculos((vinRes.data ?? []) as ObraVinculo[])
    setPrecos((preRes.data ?? []) as PlaybookPreco[])
    setProducoes((proRes.data ?? []) as ProducaoItem[])
    setComissoes((comRes.data ?? []) as ComissaoRow[])
    setLoading(false)
  }, [competencia])
  useEffect(() => { fetchData() }, [fetchData])

  async function calcularComissoes() {
    if (!canCreate) return
    setCalculando(true)
    const vinculosPorObra = new Map<string, { encarregado: ObraVinculo | null; cabos: ObraVinculo[] }>()
    vinculos.forEach(v => {
      if (!vinculosPorObra.has(v.obra_id)) vinculosPorObra.set(v.obra_id, { encarregado: null, cabos: [] })
      const obj = vinculosPorObra.get(v.obra_id)!
      if (v.funcao === 'encarregado') obj.encarregado = v; else obj.cabos.push(v)
    })
    let gerados = 0, erros = 0
    for (const [obraId, equipe] of vinculosPorObra.entries()) {
      if (!equipe.encarregado && equipe.cabos.length === 0) continue
      const prodsObra = producoes.filter(p => p.obra_id === obraId)
      if (prodsObra.length === 0) continue
      let totalPremioEnc = 0, totalPremioCabo = 0
      const detalhesEnc: string[] = [], detalhesCabo: string[] = []
      const gpi = new Map<string, ProducaoItem[]>()
      prodsObra.forEach(p => { if (!p.playbook_item_id) return; if (!gpi.has(p.playbook_item_id)) gpi.set(p.playbook_item_id, []); gpi.get(p.playbook_item_id)!.push(p) })
      for (const [, itens] of gpi.entries()) {
        const item = itens[0]
        const po = precos.find(p => p.obra_id === obraId && p.playbook_atividades?.descricao === item.playbook_itens?.descricao)
        if (!po) continue
        let qe = 0, qc = 0
        itens.forEach(prod => { const f = fatorRetrabalho(prod.num_retrabalhos); qe += prod.quantidade * f; qc += prod.quantidade * f })
        const valEnc = (po.valor_premiacao_enc ?? 0) * qe; const valCabo = (po.valor_premiacao_cabo ?? 0) * qc
        const qtdTotal = itens.reduce((s, p) => s + p.quantidade, 0)
        if (valEnc > 0) { totalPremioEnc += valEnc; detalhesEnc.push(`${item.playbook_itens?.descricao}: ${qtdTotal}${item.playbook_itens?.unidade} × R$${po.valor_premiacao_enc?.toFixed(2)} = R$${valEnc.toFixed(2)}`) }
        if (valCabo > 0) { totalPremioCabo += valCabo; detalhesCabo.push(`${item.playbook_itens?.descricao}: ${qtdTotal}${item.playbook_itens?.unidade} × R$${po.valor_premiacao_cabo?.toFixed(2)} = R$${valCabo.toFixed(2)}`) }
      }
      if (equipe.encarregado && totalPremioEnc > 0) {
        const { error } = await supabase.from('comissoes_equipe_v2').upsert({ obra_id: obraId, colaborador_id: equipe.encarregado.colaborador_id, funcao: 'encarregado' as const, descricao: `Premiação Encarregado – ${detalhesEnc.join(' | ')}`, quantidade_total: prodsObra.reduce((s,p)=>s+p.quantidade,0), valor_unitario_premiacao: 0, valor_bruto: totalPremioEnc, num_cabos: 1, valor_final: totalPremioEnc, competencia, status: 'pendente', data_geracao: new Date().toISOString().slice(0,10), observacoes: detalhesEnc.join('\n') }, { onConflict: 'obra_id,colaborador_id,funcao,competencia', ignoreDuplicates: false })
        if (error) { console.error(error); erros++ } else gerados++
      }
      if (equipe.cabos.length > 0 && totalPremioCabo > 0) {
        const numCabos = equipe.cabos.length
        for (const cabo of equipe.cabos) {
          const { error } = await supabase.from('comissoes_equipe_v2').upsert({ obra_id: obraId, colaborador_id: cabo.colaborador_id, funcao: 'cabo' as const, descricao: `Premiação Cabo (${numCabos}) – ${detalhesCabo.join(' | ')}`, quantidade_total: prodsObra.reduce((s,p)=>s+p.quantidade,0), valor_unitario_premiacao: 0, valor_bruto: totalPremioCabo, num_cabos: numCabos, valor_final: totalPremioCabo/numCabos, competencia, status: 'pendente', data_geracao: new Date().toISOString().slice(0,10), observacoes: detalhesCabo.join('\n') }, { onConflict: 'obra_id,colaborador_id,funcao,competencia', ignoreDuplicates: false })
          if (error) { console.error(error); erros++ } else gerados++
        }
      }
    }
    setCalculando(false)
    if (erros > 0) toast.error(`${erros} erro(s) ao calcular.`)
    else toast.success(`${gerados} premiação(ões) calculada(s) para ${mesLabel(competencia)}!`)
    fetchData()
  }

  async function salvarRetrabalho() {
    if (!modalRetrabalho) return
    setSalvandoRetrab(true)
    const { error } = await supabase.from('portal_producao').update({ num_retrabalhos: novoRetrab }).eq('id', modalRetrabalho.producaoId)
    setSalvandoRetrab(false)
    if (error) { toast.error('Erro ao salvar. Execute a migração SQL: migration_retrabalho.sql'); console.error(error) }
    else { toast.success('Retrabalho atualizado!'); setModalRetrabalho(null); fetchData() }
  }
  async function handleAprovar() {
    if (!aprovarCom) return
    if (aprovarCom.valor_final <= 0) { toast.error('Valor final é zero.'); setAprovarCom(null); return }
    const { data: pd, error: pe } = await supabase.from('premios').insert({ colaborador_id: aprovarCom.colaborador_id, obra_id: aprovarCom.obra_id, tipo: 'Produtividade', descricao: `Premiação ${aprovarCom.funcao === 'encarregado' ? 'Encarregado' : 'Cabo'} — ${mesLabel(aprovarCom.competencia)}`, valor: aprovarCom.valor_final, data: new Date().toISOString().slice(0,10), competencia: aprovarCom.competencia, observacoes: aprovarCom.observacoes ?? '', status: 'pendente' }).select('id').single()
    if (pe || !pd) { toast.error('Erro ao criar prêmio'); return }
    await supabase.from('comissoes_equipe_v2').update({ status: 'aprovado', premio_id: pd.id }).eq('id', aprovarCom.id)
    toast.success('Aprovado! Prêmio gerado.'); setAprovarCom(null); fetchData()
  }
  async function handleCancelar() {
    if (!cancelarCom) return
    await supabase.from('comissoes_equipe_v2').update({ status: 'cancelado' }).eq('id', cancelarCom.id)
    toast.success('Cancelado.'); setCancelarCom(null); fetchData()
  }
  async function handleDelete() {
    if (!deleteCom) return
    await supabase.from('comissoes_equipe_v2').delete().eq('id', deleteCom.id)
    toast.success('Excluído.'); setDeleteCom(null); fetchData()
  }

  const vinculosPorObra = useMemo(() => {
    const m = new Map<string, ObraVinculo[]>()
    vinculos.forEach(v => { if (!m.has(v.obra_id)) m.set(v.obra_id, []); m.get(v.obra_id)!.push(v) })
    return m
  }, [vinculos])

  const linhasAtividade = useMemo((): LinhaAtividade[] => {
    if (!obraCalcSel) return []
    const prodsObra = producoes.filter(p => p.obra_id === obraCalcSel.id)
    if (prodsObra.length === 0) return []
    const gpi = new Map<string, ProducaoItem[]>()
    prodsObra.forEach(p => { if (!p.playbook_item_id) return; if (!gpi.has(p.playbook_item_id)) gpi.set(p.playbook_item_id, []); gpi.get(p.playbook_item_id)!.push(p) })
    const linhas: LinhaAtividade[] = []
    for (const [itemId, itens] of gpi.entries()) {
      const ref = itens[0]
      const po = precos.find(p => p.obra_id === obraCalcSel.id && p.playbook_atividades?.descricao === ref.playbook_itens?.descricao)
      const vEnc = po?.valor_premiacao_enc ?? 0; const vCabo = po?.valor_premiacao_cabo ?? 0
      let tEnc = 0, tCabo = 0
      itens.forEach(prod => { const f = fatorRetrabalho(prod.num_retrabalhos); tEnc += prod.quantidade * vEnc * f; tCabo += prod.quantidade * vCabo * f })
      linhas.push({ playbook_item_id: itemId, descricao: ref.playbook_itens?.descricao ?? '—', unidade: ref.playbook_itens?.unidade ?? '—', categoria: ref.playbook_itens?.categoria ?? null, qtdTotal: itens.reduce((s,p)=>s+p.quantidade,0), itensProducao: itens, valorPremioEnc: vEnc, valorPremioCabo: vCabo, totalPremioEnc: tEnc, totalPremioCabo: tCabo })
    }
    return linhas.sort((a,b)=>(a.categoria??'Z').localeCompare(b.categoria??'Z')||a.descricao.localeCompare(b.descricao))
  }, [obraCalcSel, producoes, precos])

  const totalEncObra   = linhasAtividade.reduce((s,l)=>s+l.totalPremioEnc, 0)
  const totalCaboObra  = linhasAtividade.reduce((s,l)=>s+l.totalPremioCabo, 0)
  const equipeObraCalc = obraCalcSel ? (vinculosPorObra.get(obraCalcSel.id) ?? []) : []
  const encObraCalc    = equipeObraCalc.filter(v=>v.funcao==='encarregado')
  const cabosObraCalc  = equipeObraCalc.filter(v=>v.funcao==='cabo')

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#d97706)', display:'flex', alignItems:'center', justifyContent:'center' }}><Trophy size={20} color="#fff"/></div>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, color:'#1e293b', margin:0 }}>Comissão de Equipe</h1>
            <p style={{ fontSize:12, color:'#64748b', margin:0 }}>Premiação automática por produção — Encarregado e Cabo vinculados às obras</p>
          </div>
        </div>
        {aba==='calculo'&&<Button onClick={calcularComissoes} disabled={calculando} style={{ gap:6, background:'#0d3f56', color:'#fff' }}><RefreshCw size={14} className={calculando?'animate-spin':''}/>
          {calculando?'Calculando…':`Calcular ${mesLabel(competencia)}`}</Button>}
      </div>
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'#f1f5f9', borderRadius:10, padding:4, width:'fit-content' }}>
        {([{id:'vinculos',label:'🔗 Vínculos por Obra'},{id:'calculo',label:'💰 Cálculo de Premiações'}] as const).map(t=>(
          <button key={t.id} onClick={()=>setAba(t.id)} style={{ padding:'7px 18px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, background:aba===t.id?'#fff':'transparent', color:aba===t.id?'#0d3f56':'#64748b', boxShadow:aba===t.id?'0 1px 4px rgba(0,0,0,0.1)':'none', transition:'all 0.15s' }}>{t.label}</button>
        ))}
      </div>

      {aba==='vinculos'&&(
        <div>
          <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'#0369a1' }}>
            📌 Os vínculos são gerenciados na tela <strong>Playbooks → Preços por Obra → botão "Vincular Equipe"</strong>. Aqui você visualiza o resumo de todas as obras e suas equipes.
          </div>
          {loading?<div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>Carregando…</div>:obras.length===0?<div style={{ padding:60, textAlign:'center', color:'#94a3b8' }}>Nenhuma obra cadastrada.</div>:(
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:12 }}>
              {obras.map(obra=>{
                const equipe=vinculosPorObra.get(obra.id)??[]; const enc=equipe.filter(v=>v.funcao==='encarregado'); const cabos=equipe.filter(v=>v.funcao==='cabo')
                const qtdProd=producoes.filter(p=>p.obra_id===obra.id).reduce((s,p)=>s+p.quantidade,0)
                return (
                  <div key={obra.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                      <div style={{ width:36, height:36, borderRadius:9, background:'linear-gradient(135deg,#0d3f56,#1e3a5f)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Building2 size={16} color="#fff"/></div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{obra.nome}</div>
                        <div style={{ fontSize:11, color:'#64748b' }}>{qtdProd>0?`${qtdProd.toLocaleString('pt-BR')} un. em ${mesLabel(competencia)}`:"Sem produção neste mês"}</div>
                      </div>
                      {equipe.length===0&&<span style={{ fontSize:10, color:'#94a3b8', background:'#f1f5f9', borderRadius:20, padding:'2px 8px' }}>Sem equipe</span>}
                    </div>
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#c2410c', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>👷 Encarregado</div>
                      {enc.length===0?<div style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>— não vinculado —</div>:enc.map(v=><div key={v.id} style={{ fontSize:13, fontWeight:600, color:'#1e293b', display:'flex', alignItems:'center', gap:6 }}><HardHat size={13} color="#c2410c"/>{v.colaboradores?.nome??'—'}{v.colaboradores?.chapa&&<span style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>({v.colaboradores.chapa})</span>}</div>)}
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'#0369a1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>🔧 Cabo{cabos.length>1?'s':''}{cabos.length>1&&<span style={{ color:'#64748b', fontWeight:400 }}> (dividido)</span>}</div>
                      {cabos.length===0?<div style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>— não vinculado —</div>:cabos.map(v=><div key={v.id} style={{ fontSize:13, fontWeight:600, color:'#1e293b', display:'flex', alignItems:'center', gap:6, marginBottom:2 }}><Users size={12} color="#0369a1"/>{v.colaboradores?.nome??'—'}{v.colaboradores?.chapa&&<span style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>({v.colaboradores.chapa})</span>}</div>)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {aba==='calculo'&&(
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', borderRadius:9, border:'1px solid #e2e8f0', padding:'6px 12px' }}>
              <span style={{ fontSize:12, fontWeight:600, color:'#64748b' }}>Competência:</span>
              <input type="month" value={competencia} onChange={e=>{ setCompetencia(e.target.value); setObraCalcSel(null) }} style={{ border:'none', outline:'none', fontSize:13, fontWeight:700, color:'#0d3f56', background:'transparent' }}/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16, alignItems:'start' }}>
            <div style={{ border:'1px solid #e2e8f0', borderRadius:10, background:'#fff', overflow:'hidden', position:'sticky', top:20 }}>
              <div style={{ padding:'12px 14px', borderBottom:'1px solid #e2e8f0', background:'#f8fafc' }}>
                <p style={{ margin:'0 0 8px', fontSize:13, fontWeight:700, color:'#1e293b', display:'flex', alignItems:'center', gap:6 }}><Building2 size={13} color="#0d3f56"/> Obras</p>
                <div style={{ position:'relative' }}>
                  <Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/>
                  <Input style={{ paddingLeft:28, height:30, fontSize:12 }} placeholder="Filtrar obras…" value={searchObraCalc} onChange={e=>setSearchObraCalc(e.target.value)}/>
                </div>
              </div>
              <div style={{ maxHeight:560, overflowY:'auto' }}>
                {loading?<div style={{ padding:20, textAlign:'center', color:'#94a3b8', fontSize:12 }}>Carregando…</div>:obras.filter(o=>!searchObraCalc||o.nome.toLowerCase().includes(searchObraCalc.toLowerCase())).map(obra=>{
                  const isSel=obraCalcSel?.id===obra.id
                  const prodsObra=producoes.filter(p=>p.obra_id===obra.id); const qtdProd=prodsObra.reduce((s,p)=>s+p.quantidade,0)
                  const equipe=vinculosPorObra.get(obra.id)??[]
                  let tRapido=0; const gpi2=new Map<string,ProducaoItem[]>()
                  prodsObra.forEach(p=>{ if(!p.playbook_item_id) return; if(!gpi2.has(p.playbook_item_id)) gpi2.set(p.playbook_item_id,[]); gpi2.get(p.playbook_item_id)!.push(p) })
                  for(const [,itens] of gpi2.entries()){ const ref=itens[0]; const po=precos.find(p=>p.obra_id===obra.id&&p.playbook_atividades?.descricao===ref.playbook_itens?.descricao); if(!po) continue; itens.forEach(prod=>{ const f=fatorRetrabalho(prod.num_retrabalhos); tRapido+=prod.quantidade*((po.valor_premiacao_enc??0)+(po.valor_premiacao_cabo??0))*f }) }
                  return (
                    <button key={obra.id} type="button" onClick={()=>setObraCalcSel(obra)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', textAlign:'left', borderLeft:isSel?'3px solid #0d3f56':'3px solid transparent', background:isSel?'rgba(13,63,86,0.06)':'transparent', borderBottom:'1px solid #f1f5f9' }}>
                      <div style={{ width:34, height:34, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, background:isSel?'#0d3f56':'#f1f5f9', color:isSel?'#fff':'#64748b' }}>{obra.nome.slice(0,2).toUpperCase()}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ margin:0, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:isSel?700:500, color:isSel?'#0d3f56':'#1e293b' }}>{obra.nome}</p>
                        <div style={{ fontSize:10, color:'#94a3b8', marginTop:1 }}>{qtdProd>0?<>{qtdProd.toLocaleString('pt-BR')} un.{tRapido>0&&<span style={{ marginLeft:4, color:'#15803d', fontWeight:600 }}>· {formatCurrency(tRapido)}</span>}</>:<span style={{ color:'#cbd5e1' }}>Sem produção</span>}</div>
                      </div>
                      {equipe.length===0&&<span style={{ fontSize:9, background:'#fef3c7', color:'#b45309', borderRadius:10, padding:'1px 6px', flexShrink:0 }}>s/ equipe</span>}
                      <ChevronRight size={12} color={isSel?'#0d3f56':'#cbd5e1'}/>
                    </button>
                  )
                })}
              </div>
            </div>

            {!obraCalcSel?(
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60, border:'2px dashed #e2e8f0', borderRadius:12, color:'#94a3b8', gap:10 }}>
                <Trophy size={40} style={{ opacity:0.2 }}/>
                <p style={{ margin:0, fontSize:15, fontWeight:500 }}>Selecione uma obra</p>
                <p style={{ margin:0, fontSize:13 }}>← Escolha a obra para ver atividades e comissões</p>
              </div>
            ):(
              <div style={{ border:'1px solid #e2e8f0', borderRadius:12, background:'#fff', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', background:'linear-gradient(135deg,#0d3f56,#1e3a5f)', color:'#fff' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:16 }}>{obraCalcSel.nome}</div>
                      <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}>{linhasAtividade.length} atividade(s) · {mesLabel(competencia)}</div>
                    </div>
                    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                      <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'8px 14px', minWidth:120 }}>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', marginBottom:2 }}>👷 Total Enc.</div>
                        <div style={{ fontSize:15, fontWeight:800, color:'#fde68a' }}>{formatCurrency(totalEncObra)}</div>
                        {encObraCalc.length>0&&<div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:2 }}>→ {encObraCalc[0].colaboradores?.nome?.split(' ')[0]??'—'}</div>}
                      </div>
                      <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'8px 14px', minWidth:120 }}>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', marginBottom:2 }}>🔧 Total Cabo</div>
                        <div style={{ fontSize:15, fontWeight:800, color:'#bfdbfe' }}>{formatCurrency(totalCaboObra)}</div>
                        {cabosObraCalc.length>0&&<div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:2 }}>{cabosObraCalc.length>1?`÷ ${cabosObraCalc.length} = ${formatCurrency(totalCaboObra/cabosObraCalc.length)} cada`:`→ ${cabosObraCalc[0].colaboradores?.nome?.split(' ')[0]??'—'}`}</div>}
                      </div>
                    </div>
                  </div>
                  {encObraCalc.length===0&&<div style={{ marginTop:8, background:'rgba(245,158,11,0.25)', borderRadius:6, padding:'6px 10px', fontSize:11, color:'#fde68a', display:'flex', alignItems:'center', gap:6 }}><AlertTriangle size={12}/> Nenhum encarregado vinculado</div>}
                  {cabosObraCalc.length===0&&<div style={{ marginTop:6, background:'rgba(245,158,11,0.25)', borderRadius:6, padding:'6px 10px', fontSize:11, color:'#fde68a', display:'flex', alignItems:'center', gap:6 }}><AlertTriangle size={12}/> Nenhum cabo vinculado</div>}
                </div>

                {linhasAtividade.length===0?(
                  <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>
                    <Trophy size={32} style={{ marginBottom:10, opacity:0.2 }}/>
                    <div style={{ fontWeight:600 }}>Sem produção em {mesLabel(competencia)}</div>
                    <div style={{ fontSize:12, marginTop:4 }}>Lance produções no portal para calcular as comissões.</div>
                  </div>
                ):(
                  <div style={{ overflowX:'auto' }}>
                    <Table>
                      <TableHeader>
                        <TableRow style={{ background:'#f8fafc' }}>
                          <TableHead style={{ width:110 }}>Categoria</TableHead>
                          <TableHead>Atividade / Colaborador</TableHead>
                          <TableHead style={{ textAlign:'center', width:70 }}>Unid.</TableHead>
                          <TableHead style={{ textAlign:'right', width:100 }}>Qtd.</TableHead>
                          <TableHead style={{ textAlign:'right', width:110 }}>R$/un. Enc.</TableHead>
                          <TableHead style={{ textAlign:'right', width:110 }}>R$/un. Cabo</TableHead>
                          <TableHead style={{ textAlign:'right', width:120, color:'#c2410c', fontWeight:700 }}>💰 Enc.</TableHead>
                          <TableHead style={{ textAlign:'right', width:120, color:'#0369a1', fontWeight:700 }}>💰 Cabo</TableHead>
                          <TableHead style={{ textAlign:'center', width:110 }}>Retrabalho</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhasAtividade.map((linha,idx)=>(
                          <React.Fragment key={linha.playbook_item_id}>
                            <TableRow style={{ background:idx%2===0?'transparent':'#fafafa' }}>
                              <TableCell><span style={{ fontSize:11, background:'rgba(37,99,235,0.07)', color:'#0d3f56', borderRadius:4, padding:'2px 7px' }}>{linha.categoria??'Outros'}</span></TableCell>
                              <TableCell><div style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>{linha.descricao}</div><div style={{ fontSize:10, color:'#94a3b8' }}>{linha.itensProducao.length} registro(s)</div></TableCell>
                              <TableCell style={{ textAlign:'center' }}><span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700 }}>{linha.unidade}</span></TableCell>
                              <TableCell style={{ textAlign:'right', fontWeight:700, fontSize:13 }}>{linha.qtdTotal.toLocaleString('pt-BR')}</TableCell>
                              <TableCell style={{ textAlign:'right' }}>{linha.valorPremioEnc>0?<span style={{ fontSize:12, fontWeight:700, color:'#c2410c' }}>{formatCurrency(linha.valorPremioEnc)}</span>:<span style={{ color:'#cbd5e1' }}>—</span>}</TableCell>
                              <TableCell style={{ textAlign:'right' }}>{linha.valorPremioCabo>0?<span style={{ fontSize:12, fontWeight:700, color:'#0369a1' }}>{formatCurrency(linha.valorPremioCabo)}</span>:<span style={{ color:'#cbd5e1' }}>—</span>}</TableCell>
                              <TableCell style={{ textAlign:'right' }}><span style={{ fontSize:14, fontWeight:800, color:linha.totalPremioEnc>0?'#c2410c':'#cbd5e1' }}>{formatCurrency(linha.totalPremioEnc)}</span></TableCell>
                              <TableCell style={{ textAlign:'right' }}><span style={{ fontSize:14, fontWeight:800, color:linha.totalPremioCabo>0?'#0369a1':'#cbd5e1' }}>{formatCurrency(linha.totalPremioCabo)}</span></TableCell>
                              <TableCell/>
                            </TableRow>
                            {linha.itensProducao.map(prod=>{
                              const badge=badgeRetrabalho(prod.num_retrabalhos); const fator=fatorRetrabalho(prod.num_retrabalhos)
                              return (
                                <TableRow key={prod.id} style={{ background:'#f0f9ff' }}>
                                  <TableCell style={{ paddingTop:4, paddingBottom:4 }}/>
                                  <TableCell style={{ paddingTop:4, paddingBottom:4, paddingLeft:28 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                      <span style={{ fontSize:10, color:'#0369a1' }}>↳</span>
                                      <span style={{ fontSize:12, fontWeight:600, color:'#1e293b' }}>{prod.colaboradores?.nome??'—'}</span>
                                      {prod.colaboradores?.chapa&&<span style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>{prod.colaboradores.chapa}</span>}
                                      <span style={{ fontSize:10, color:'#64748b' }}>· {prod.data}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell style={{ textAlign:'center', paddingTop:4, paddingBottom:4 }}><span style={{ fontFamily:'monospace', fontSize:10 }}>{linha.unidade}</span></TableCell>
                                  <TableCell style={{ textAlign:'right', paddingTop:4, paddingBottom:4 }}><span style={{ fontSize:12, fontWeight:600 }}>{prod.quantidade.toLocaleString('pt-BR')}</span></TableCell>
                                  <TableCell colSpan={2} style={{ paddingTop:4, paddingBottom:4 }}/>
                                  <TableCell style={{ textAlign:'right', paddingTop:4, paddingBottom:4 }}><span style={{ fontSize:11, fontWeight:700, color:fator>0?'#c2410c':'#dc2626' }}>{formatCurrency(prod.quantidade*linha.valorPremioEnc*fator)}</span></TableCell>
                                  <TableCell style={{ textAlign:'right', paddingTop:4, paddingBottom:4 }}><span style={{ fontSize:11, fontWeight:700, color:fator>0?'#0369a1':'#dc2626' }}>{formatCurrency(prod.quantidade*linha.valorPremioCabo*fator)}</span></TableCell>
                                  <TableCell style={{ textAlign:'center', paddingTop:4, paddingBottom:4 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:badge.bg, color:badge.cor, border:`1px solid ${badge.border}`, whiteSpace:'nowrap' }}>{badge.label}</span>
                                      {canEdit&&<button title="Indicar retrabalho" onClick={()=>{ setModalRetrabalho({ producaoId:prod.id, colaboradorNome:prod.colaboradores?.nome??'—', descricao:linha.descricao, numAtual:prod.num_retrabalhos??0 }); setNovoRetrab(prod.num_retrabalhos??0) }} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:6, padding:'2px 6px', cursor:'pointer', fontSize:10, color:'#475569', display:'flex', alignItems:'center', gap:3 }}><RotateCcw size={9}/> editar</button>}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {linhasAtividade.length>0&&(
                  <div style={{ padding:'14px 18px', borderTop:'2px solid #e2e8f0', background:'#f8fafc' }}>
                    <div style={{ display:'flex', gap:24, flexWrap:'wrap', marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:'#c2410c', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>👷 Encarregado recebe</div>
                        {encObraCalc.length===0?<div style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>— não vinculado —</div>:encObraCalc.map(v=><div key={v.id} style={{ display:'flex', alignItems:'center', gap:8 }}><HardHat size={13} color="#c2410c"/><span style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>{v.colaboradores?.nome??'—'}</span><span style={{ fontSize:16, fontWeight:800, color:'#c2410c' }}>{formatCurrency(totalEncObra)}</span></div>)}
                      </div>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:'#0369a1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>🔧 Cabo(s) recebem</div>
                        {cabosObraCalc.length===0?<div style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>— não vinculado —</div>:cabosObraCalc.map(v=><div key={v.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}><Users size={12} color="#0369a1"/><span style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>{v.colaboradores?.nome??'—'}</span><span style={{ fontSize:15, fontWeight:800, color:'#0369a1' }}>{formatCurrency(cabosObraCalc.length>0?totalCaboObra/cabosObraCalc.length:0)}</span>{cabosObraCalc.length>1&&<span style={{ fontSize:10, color:'#64748b' }}>(÷ {cabosObraCalc.length})</span>}</div>)}
                      </div>
                    </div>
                    {canCreate&&<div style={{ display:'flex', justifyContent:'flex-end' }}><Button onClick={calcularComissoes} disabled={calculando} style={{ gap:6, background:'#0d3f56', color:'#fff' }}><RefreshCw size={14} className={calculando?'animate-spin':''}/>
                      {calculando?'Calculando…':`Gerar lançamento — ${mesLabel(competencia)}`}</Button></div>}
                  </div>
                )}

                <div style={{ padding:'14px 18px', borderTop:'2px solid #e2e8f0', background:'#fff' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}><Award size={15} color="#f59e0b"/> Prêmios Lançados — {obraCalcSel.nome}</div>
                  <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}><SelectTrigger style={{ width:160, height:32 }}><SelectValue placeholder="Status"/></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="pendente">⏳ Pendente</SelectItem><SelectItem value="aprovado">✅ Aprovado</SelectItem><SelectItem value="cancelado">❌ Cancelado</SelectItem></SelectContent></Select>
                    <div style={{ position:'relative', flex:1, minWidth:180 }}><Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/><Input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar colaborador…" style={{ paddingLeft:28, height:32 }}/></div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
                    {[{label:'Pendente',valor:formatCurrency(comissoes.filter(c=>c.obra_id===obraCalcSel.id&&c.status==='pendente').reduce((s,c)=>s+c.valor_final,0)),cor:'#b45309',bg:'#fffbeb',icon:'⏳'},{label:'Aprovado',valor:formatCurrency(comissoes.filter(c=>c.obra_id===obraCalcSel.id&&c.status==='aprovado').reduce((s,c)=>s+c.valor_final,0)),cor:'#15803d',bg:'#f0fdf4',icon:'✅'},{label:'Total',valor:formatCurrency(comissoes.filter(c=>c.obra_id===obraCalcSel.id).reduce((s,c)=>s+c.valor_final,0)),cor:'#0d3f56',bg:'#f0f9ff',icon:'📊'}].map(card=>(
                      <div key={card.label} style={{ background:card.bg, border:`1px solid ${card.cor}22`, borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ fontSize:10, fontWeight:600, color:'#64748b', marginBottom:2 }}>{card.icon} {card.label}</div>
                        <div style={{ fontSize:16, fontWeight:800, color:card.cor }}>{card.valor}</div>
                      </div>
                    ))}
                  </div>
                  {comissoes.filter(c=>c.obra_id===obraCalcSel.id).length===0?(
                    <div style={{ padding:20, textAlign:'center', color:'#94a3b8', fontSize:12, background:'#f8fafc', borderRadius:8 }}>Nenhum lançamento. Clique em "Gerar lançamento" acima.</div>
                  ):(
                    <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
                      <Table>
                        <TableHeader>
                          <TableRow style={{ background:'#f8fafc' }}>
                            <TableHead>Colaborador</TableHead>
                            <TableHead style={{ textAlign:'center' }}>Função</TableHead>
                            <TableHead style={{ textAlign:'right', fontWeight:800 }}>💰 Premiação</TableHead>
                            <TableHead style={{ textAlign:'center' }}>Status</TableHead>
                            <TableHead style={{ textAlign:'center' }}>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {comissoes.filter(c=>c.obra_id===obraCalcSel.id&&(filtroStatus==='todos'||c.status===filtroStatus)&&(!busca||(c.colaboradores?.nome??''). toLowerCase().includes(busca.toLowerCase()))).map((c,idx)=>{
                            const st=STATUS_COR[c.status]??STATUS_COR.pendente
                            return (
                              <TableRow key={c.id} style={{ background:idx%2===0?'transparent':'#fafafa' }}>
                                <TableCell><div style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>{c.colaboradores?.nome??'—'}</div>{c.colaboradores?.chapa&&<div style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>{c.colaboradores.chapa}</div>}</TableCell>
                                <TableCell style={{ textAlign:'center' }}><span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, whiteSpace:'nowrap', background:c.funcao==='encarregado'?'#fff7ed':'#f0f9ff', color:c.funcao==='encarregado'?'#c2410c':'#0369a1', border:`1px solid ${c.funcao==='encarregado'?'#fed7aa':'#bae6fd'}` }}>{c.funcao==='encarregado'?'👷 Encarregado':'🔧 Cabo'}</span></TableCell>
                                <TableCell style={{ textAlign:'right', fontWeight:800, fontSize:16, color:c.valor_final>0?'#15803d':'#dc2626' }}>{formatCurrency(c.valor_final)}{c.funcao==='cabo'&&c.num_cabos>1&&<div style={{ fontSize:10, color:'#64748b', fontWeight:400 }}>÷ {c.num_cabos} cabos</div>}</TableCell>
                                <TableCell style={{ textAlign:'center' }}><span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, whiteSpace:'nowrap', background:st.bg, color:st.cor, border:`1px solid ${st.border}` }}>{st.label}</span></TableCell>
                                <TableCell style={{ textAlign:'center' }}>
                                  <div style={{ display:'flex', gap:3, justifyContent:'center' }}>
                                    {c.status==='pendente'&&<><Button variant="ghost" size="icon" style={{ width:26, height:26 }} title="Aprovar" onClick={()=>setAprovarCom(c)}><CheckCircle2 size={12} color="#15803d"/></Button><Button variant="ghost" size="icon" style={{ width:26, height:26 }} title="Cancelar" onClick={()=>setCancelarCom(c)}><XCircle size={12} color="#dc2626"/></Button></>}
                                    {c.status==='aprovado'&&<span style={{ fontSize:10, color:'#15803d' }}>✅ Prêmio gerado</span>}
                                    {canDelete&&c.status!=='aprovado'&&<Button variant="ghost" size="icon" style={{ width:26, height:26 }} title="Excluir" onClick={()=>setDeleteCom(c)}><Trash2 size={12} color="#dc2626"/></Button>}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!modalRetrabalho} onOpenChange={o=>{ if(!o) setModalRetrabalho(null) }}>
        <DialogContent style={{ maxWidth:420 }}>
          <DialogHeader><DialogTitle style={{ display:'flex', alignItems:'center', gap:8 }}><RotateCcw size={16} color="#b45309"/> Indicar Retrabalho</DialogTitle></DialogHeader>
          <div style={{ padding:'12px 0' }}>
            <div style={{ background:'#f8fafc', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:2 }}>Produção</div>
              <div style={{ fontWeight:700, fontSize:14, color:'#1e293b' }}>{modalRetrabalho?.colaboradorNome}</div>
              <div style={{ fontSize:12, color:'#475569' }}>{modalRetrabalho?.descricao}</div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#475569', marginBottom:8 }}>Nº de Retrabalhos:</div>
              <div style={{ display:'flex', gap:8 }}>
                {[0,1,2].map(n=>{ const badge=badgeRetrabalho(n); const isSel=novoRetrab===n; return (
                  <button key={n} onClick={()=>setNovoRetrab(n)} style={{ flex:1, padding:'12px 8px', borderRadius:10, cursor:'pointer', border:isSel?`2px solid ${badge.cor}`:"2px solid #e2e8f0", background:isSel?badge.bg:'#fff', transition:'all 0.15s' }}>
                    <div style={{ fontSize:18, marginBottom:4 }}>{n===0?'✅':n===1?'⚠️':'❌'}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:badge.cor }}>{badge.label}</div>
                    <div style={{ fontSize:10, color:'#64748b', marginTop:2 }}>{n===0?'Premiação integral':n===1?'50% da premiação':'Perde a premiação'}</div>
                  </button>
                )})}
              </div>
            </div>
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#92400e' }}>
              <strong>Regra:</strong> 0 retrabalhos → 100% · 1 retrabalho → 50% · 2+ retrabalhos → perde premiação desta produção
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setModalRetrabalho(null)}>Cancelar</Button>
            <Button disabled={salvandoRetrab} onClick={salvarRetrabalho} style={{ background:'#0d3f56', color:'#fff', gap:6 }}>{salvandoRetrab?'Salvando…':'✅ Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aprovarCom} onOpenChange={o=>!o&&setAprovarCom(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Aprovar premiação?</AlertDialogTitle>
          <AlertDialogDescription>Prêmio de <strong>{formatCurrency(aprovarCom?.valor_final??0)}</strong> para <strong>{aprovarCom?.colaboradores?.nome}</strong> ({aprovarCom?.funcao}) em {mesLabel(aprovarCom?.competencia??'')}.<br/><br/>
            <details style={{ fontSize:12, color:'#475569' }}><summary style={{ cursor:'pointer', fontWeight:600 }}>Ver detalhes</summary><pre style={{ whiteSpace:'pre-wrap', marginTop:8, fontSize:11 }}>{aprovarCom?.observacoes??'—'}</pre></details>
          </AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleAprovar} style={{ background:'#15803d', color:'#fff' }}>✅ Aprovar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!cancelarCom} onOpenChange={o=>!o&&setCancelarCom(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancelar premiação?</AlertDialogTitle><AlertDialogDescription>A premiação de <strong>{cancelarCom?.colaboradores?.nome}</strong> ({formatCurrency(cancelarCom?.valor_final??0)}) será cancelada.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={handleCancelar} style={{ background:'#dc2626', color:'#fff' }}>Cancelar Premiação</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteCom} onOpenChange={o=>!o&&setDeleteCom(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir lançamento?</AlertDialogTitle><AlertDialogDescription>Esta ação é irreversível.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} style={{ background:'#dc2626', color:'#fff' }}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
