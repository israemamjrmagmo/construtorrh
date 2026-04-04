import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { Users, Search, Loader2, RefreshCw } from 'lucide-react'

type StatusPonto = 'presente' | 'falta' | 'meio_periodo' | 'falta_justificada' | 'producao'

interface ColabRow {
  id: string; nome: string; chapa: string; funcao: string
  obra: string; obra_id: string; tipo_contrato: string
}
interface PontoRow {
  colaborador_id: string; data: string; status: StatusPonto
  horas_extra?: number; obra_id: string
}

const SC: Record<string, { label: string; cor: string; bg: string; border: string; emoji: string }> = {
  presente:          { label: 'Presente',      cor: '#15803d', bg: '#dcfce7', border:'#86efac', emoji: '✅' },
  falta:             { label: 'Falta',          cor: '#dc2626', bg: '#fee2e2', border:'#fca5a5', emoji: '❌' },
  meio_periodo:      { label: 'Meio Período',   cor: '#b45309', bg: '#fef3c7', border:'#fcd34d', emoji: '🌗' },
  falta_justificada: { label: 'Falta Justif.',  cor: '#6b7280', bg: '#f3f4f6', border:'#d1d5db', emoji: '📋' },
  producao:          { label: 'Produção',       cor: '#7c3aed', bg: '#f3e8ff', border:'#c4b5fd', emoji: '⚙️'  },
  sem_lancamento:    { label: 'Sem lançamento', cor: '#94a3b8', bg: '#f8fafc', border:'#e2e8f0', emoji: '—'   },
}
const TAXA_COR = (t: number) =>
  t >= 80 ? '#16a34a' : t >= 60 ? '#65a30d' : t >= 40 ? '#b45309' : '#dc2626'

// Calcula inícios de semana e mês
const getSemanaIni  = () => { const d = new Date(); d.setDate(d.getDate()-d.getDay()); return d.toISOString().slice(0,10) }
const getMesIni     = () => new Date().toISOString().slice(0,8)+'01'
const getMesFim     = () => {
  const n = new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).toISOString().slice(0,10)
}
const getSemanaFim  = () => { const d = new Date(); d.setDate(d.getDate()-d.getDay()+6); return d.toISOString().slice(0,10) }

function calcStats(pontos: PontoRow[], total: number, diasUteis: number) {
  if (total === 0 || diasUteis === 0) return { presentes:0, faltas:0, meio:0, prod:0, justif:0, sem:0, taxa:0, taxaFalta:0 }
  const presentes = pontos.filter(p => p.status==='presente').length
  const faltas    = pontos.filter(p => p.status==='falta').length
  const meio      = pontos.filter(p => p.status==='meio_periodo').length
  const prod      = pontos.filter(p => p.status==='producao').length
  const justif    = pontos.filter(p => p.status==='falta_justificada').length
  const ativos    = presentes + meio + prod
  const base      = total * diasUteis
  return {
    presentes, faltas, meio, prod, justif,
    sem: base - pontos.length,
    taxa:      Math.round((ativos / base) * 100),
    taxaFalta: Math.round((faltas / base) * 100),
  }
}

export default function GestorPresenca() {
  const hoje      = useMemo(() => new Date().toISOString().slice(0,10), [])
  const semIni    = useMemo(getSemanaIni,  [])
  const semFim    = useMemo(getSemanaFim,  [])
  const mesIni    = useMemo(getMesIni,     [])
  const mesFim    = useMemo(getMesFim,     [])

  const [loading,      setLoading]      = useState(true)
  const [data,         setData]         = useState(hoje)
  const [viewMode,     setViewMode]     = useState<'dia'|'semana'|'mes'>('dia')
  const [colabs,       setColabs]       = useState<ColabRow[]>([])
  const [obraFiltro,   setObraFiltro]   = useState('todas')
  const [busca,        setBusca]        = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const [obras,        setObras]        = useState<{id:string;nome:string}[]>([])

  // Dados separados por período
  const [pHoje,    setPHoje]    = useState<PontoRow[]>([])
  const [pSemana,  setPSemana]  = useState<PontoRow[]>([])
  const [pMes,     setPMes]     = useState<PontoRow[]>([])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchColabs = useCallback(async () => {
    const [{ data: cs }, { data: os }] = await Promise.all([
      supabase.from('colaboradores')
        .select('id,nome,chapa,tipo_contrato,obra_id,funcoes(nome),obras(nome,id)')
        .eq('status','ativo'),
      supabase.from('obras').select('id,nome').neq('status','concluida').order('nome'),
    ])
    setColabs((cs??[]).map((c:any) => ({
      id: c.id, nome: c.nome, chapa: c.chapa??'',
      tipo_contrato: c.tipo_contrato??'clt',
      funcao: (c.funcoes as any)?.nome??'—',
      obra:   (c.obras as any)?.nome??'—',
      obra_id: c.obra_id??'',
    })))
    setObras(os??[])
  }, [])

  const fetchPontos = useCallback(async () => {
    setLoading(true)
    // Busca do período mais amplo (mês inteiro) de uma vez
    const { data: raw } = await supabase.from('portal_ponto_diario')
      .select('colaborador_id,data,status,horas_extra,obra_id')
      .gte('data', mesIni).lte('data', mesFim)
      .limit(10000)
    const all = (raw ?? []) as PontoRow[]
    setPHoje   (all.filter(p => p.data === hoje))
    setPSemana (all.filter(p => p.data >= semIni && p.data <= semFim))
    setPMes    (all)
    setLoading(false)
  }, [hoje, semIni, semFim, mesIni, mesFim])

  useEffect(() => { fetchColabs() }, [fetchColabs])
  useEffect(() => { if (colabs.length > 0) fetchPontos() }, [fetchPontos, colabs.length])

  // ── Colaboradores do filtro de obra ──────────────────────────────────────
  const colabsObra = useMemo(() =>
    obraFiltro === 'todas' ? colabs : colabs.filter(c => c.obra_id === obraFiltro),
  [colabs, obraFiltro])

  // Filtra pontos pela obra selecionada
  const filtrarPontos = (pts: PontoRow[]) =>
    obraFiltro === 'todas' ? pts : pts.filter(p => p.obra_id === obraFiltro)

  // ── Dias úteis de cada período ───────────────────────────────────────────
  const diasUteisHoje   = useMemo(() => { const d = new Date(hoje+'T12:00'); return (d.getDay()!==0&&d.getDay()!==6)?1:0 }, [hoje])
  const diasUteisSemana = useMemo(() => {
    let c=0; const cur=new Date(semIni+'T12:00'); const fim=new Date(semFim+'T12:00')
    while(cur<=fim){if(cur.getDay()!==0&&cur.getDay()!==6)c++; cur.setDate(cur.getDate()+1)}
    return Math.max(c,1)
  }, [semIni, semFim])
  const diasUteisMes = useMemo(() => {
    let c=0; const cur=new Date(mesIni+'T12:00'); const fim=new Date(mesFim+'T12:00')
    while(cur<=fim){if(cur.getDay()!==0&&cur.getDay()!==6)c++; cur.setDate(cur.getDate()+1)}
    return Math.max(c,1)
  }, [mesIni, mesFim])

  // ── Stats por período ────────────────────────────────────────────────────
  const statsHoje   = useMemo(() => calcStats(filtrarPontos(pHoje),   colabsObra.length, Math.max(diasUteisHoje,1)),   [pHoje,   colabsObra, diasUteisHoje,   obraFiltro])
  const statsSemana = useMemo(() => calcStats(filtrarPontos(pSemana), colabsObra.length, diasUteisSemana), [pSemana, colabsObra, diasUteisSemana, obraFiltro])
  const statsMes    = useMemo(() => calcStats(filtrarPontos(pMes),    colabsObra.length, diasUteisMes),    [pMes,    colabsObra, diasUteisMes,    obraFiltro])

  // ── Mapa de pontos para a tabela ─────────────────────────────────────────
  const { dataInicio, dataFim } = useMemo(() => {
    if (viewMode==='semana') return { dataInicio: semIni, dataFim: semFim }
    if (viewMode==='mes')    return { dataInicio: mesIni, dataFim: mesFim }
    return { dataInicio: data, dataFim: data }
  }, [viewMode, data, semIni, semFim, mesIni, mesFim])

  const pontosTabela = useMemo(() => filtrarPontos(
    viewMode==='dia'    ? pHoje   :
    viewMode==='semana' ? pSemana : pMes
  ), [viewMode, pHoje, pSemana, pMes, obraFiltro])

  const pontosMap = useMemo(() => {
    const m = new Map<string, Map<string, PontoRow>>()
    pontosTabela.forEach(p => {
      if (!m.has(p.colaborador_id)) m.set(p.colaborador_id, new Map())
      m.get(p.colaborador_id)!.set(p.data, p)
    })
    return m
  }, [pontosTabela])

  const diasRange = useMemo(() => {
    if (viewMode==='dia') return [data]
    const dias: string[] = []
    const cur=new Date(dataInicio+'T12:00'), end=new Date(dataFim+'T12:00')
    while(cur<=end){ if(cur.getDay()!==0&&cur.getDay()!==6) dias.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1) }
    return dias
  }, [viewMode, data, dataInicio, dataFim])

  const colabsFiltrados = useMemo(() => {
    let arr = colabsObra
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(c => c.nome.toLowerCase().includes(q) || c.chapa.toLowerCase().includes(q))
    }
    if (statusFiltro !== 'todos') {
      arr = arr.filter(c => {
        const ref = viewMode==='dia' ? data : dataFim
        const st = pontosMap.get(c.id)?.get(ref)?.status ?? 'sem_lancamento'
        return st === statusFiltro
      })
    }
    return arr
  }, [colabsObra, busca, statusFiltro, pontosMap, data, viewMode, dataFim])

  // Resumo do período atual (para chips clicáveis)
  const resumo = useMemo(() => {
    const s = { presente:0, falta:0, meio_periodo:0, producao:0, falta_justificada:0, sem_lancamento:0 }
    colabsObra.forEach(c => {
      const ref = viewMode==='dia' ? data : dataFim
      const st = pontosMap.get(c.id)?.get(ref)?.status ?? 'sem_lancamento'
      s[st as keyof typeof s] = (s[st as keyof typeof s] ?? 0) + 1
    })
    return s
  }, [colabsObra, pontosMap, data, viewMode, dataFim])

  // ── Componente de card de taxa ────────────────────────────────────────────
  function TaxaCard({ titulo, periodo, stats, total }: { titulo:string; periodo:string; stats:ReturnType<typeof calcStats>; total:number }) {
    const cor = TAXA_COR(stats.taxa)
    return (
      <div style={{ background:'#fff', borderRadius:14, border:`1.5px solid ${cor}33`, padding:'14px 16px', boxShadow:`0 2px 8px ${cor}15` }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{titulo}</div>
        <div style={{ fontSize:11, color:'#94a3b8', marginBottom:10 }}>{periodo}</div>

        {/* Taxa principal */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:8, marginBottom:8 }}>
          <div style={{ fontSize:36, fontWeight:900, color:cor, lineHeight:1 }}>{stats.taxa}%</div>
          <div style={{ fontSize:11, color:'#94a3b8', paddingBottom:4, lineHeight:1.4 }}>
            presença<br/>{stats.taxaFalta}% faltas
          </div>
        </div>

        {/* Barra presença */}
        <div style={{ height:6, background:'#e2e8f0', borderRadius:3, overflow:'hidden', marginBottom:10 }}>
          <div style={{ height:'100%', display:'flex' }}>
            <div style={{ width:`${stats.taxa}%`, background:cor, transition:'width 0.5s' }}/>
            <div style={{ width:`${stats.taxaFalta}%`, background:'#fca5a5', transition:'width 0.5s' }}/>
          </div>
        </div>

        {/* Mini-stats */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
          {[
            { emoji:'✅', label:'Pres.',  val: stats.presentes, cor:'#16a34a' },
            { emoji:'❌', label:'Falta',  val: stats.faltas,    cor:'#dc2626' },
            { emoji:'🌗', label:'Meio P.',val: stats.meio,      cor:'#b45309' },
            { emoji:'⚙️', label:'Prod.',  val: stats.prod,      cor:'#7c3aed' },
            { emoji:'📋', label:'Justif.',val: stats.justif,    cor:'#6b7280' },
            { emoji:'—',  label:'S/Lanç.',val: Math.max(total-(stats.presentes+stats.faltas+stats.meio+stats.prod+stats.justif),0), cor:'#94a3b8' },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center', background:'#f8fafc', borderRadius:7, padding:'5px 4px' }}>
              <div style={{ fontSize:13 }}>{s.emoji}</div>
              <div style={{ fontSize:13, fontWeight:800, color:s.cor }}>{s.val}</div>
              <div style={{ fontSize:9, color:'#94a3b8', lineHeight:1.2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <GestorLayout>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, margin:0, color:'#0f172a', display:'flex', alignItems:'center', gap:8 }}>
            <Users size={20} color="#2563eb"/> Controle de Presença
          </h1>
          <p style={{ color:'#64748b', fontSize:12, margin:'3px 0 0' }}>
            {new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}
          </p>
        </div>
        <button onClick={() => { fetchColabs().then(() => fetchPontos()) }}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:9, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#64748b' }}>
          <RefreshCw size={13}/> Atualizar
        </button>
      </div>

      {/* Filtro de obra */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'10px 14px', marginBottom:16, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <select value={obraFiltro} onChange={e=>{setObraFiltro(e.target.value);setStatusFiltro('todos')}}
          style={{ border:`1.5px solid ${obraFiltro!=='todas'?'#2563eb':'#e2e8f0'}`, borderRadius:8, padding:'7px 10px', fontSize:13, background:obraFiltro!=='todas'?'#eff6ff':'#fff', color:obraFiltro!=='todas'?'#2563eb':'#374151', fontWeight:obraFiltro!=='todas'?700:500, flex:1, minWidth:180 }}>
          <option value="todas">🏗️ Todas as obras ({colabs.length} colaboradores)</option>
          {obras.map(o => {
            const qtd = colabs.filter(c=>c.obra_id===o.id).length
            return <option key={o.id} value={o.id}>{o.nome} ({qtd})</option>
          })}
        </select>
        <span style={{ fontSize:12, color:'#64748b', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'5px 10px', whiteSpace:'nowrap' }}>
          👷 {colabsObra.length} colaboradores
        </span>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
          <Loader2 size={28} color="#2563eb" style={{ animation:'spin 1s linear infinite' }}/>
        </div>
      ) : (
        <>
          {/* ══ CARDS DE TAXA (3 períodos) ══════════════════════════════════ */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12, marginBottom:20 }}>
            <TaxaCard
              titulo="HOJE"
              periodo={new Date(hoje+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'short'})}
              stats={statsHoje}
              total={colabsObra.length}
            />
            <TaxaCard
              titulo="ESTA SEMANA"
              periodo={`${new Date(semIni+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} → ${new Date(semFim+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}`}
              stats={statsSemana}
              total={colabsObra.length}
            />
            <TaxaCard
              titulo="ESTE MÊS"
              periodo={new Date(mesIni+'T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}
              stats={statsMes}
              total={colabsObra.length}
            />
          </div>

          {/* ══ TABELA DETALHE ══════════════════════════════════════════════ */}
          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>

            {/* Controles da tabela */}
            <div style={{ padding:'12px 14px', borderBottom:'1px solid #e2e8f0', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', background:'#fafbfc' }}>
              {/* Modo */}
              <div style={{ display:'flex', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden', flexShrink:0 }}>
                {(['dia','semana','mes'] as const).map(m => (
                  <button key={m} onClick={()=>{setViewMode(m);setStatusFiltro('todos')}} style={{
                    padding:'6px 14px', border:'none', fontWeight:700, fontSize:12, cursor:'pointer',
                    background:viewMode===m?'#2563eb':'#fff', color:viewMode===m?'#fff':'#64748b',
                    transition:'all 0.12s',
                  }}>
                    {m==='dia'?'📅 Dia':m==='semana'?'📆 Semana':'🗓️ Mês'}
                  </button>
                ))}
              </div>

              {/* Navegação de data */}
              {viewMode === 'dia' && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={()=>{const d=new Date(data+'T12:00');d.setDate(d.getDate()-1);setData(d.toISOString().slice(0,10))}}
                    style={{ width:28, height:28, borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontWeight:700, fontSize:14, color:'#374151' }}>‹</button>
                  <input type="date" value={data} onChange={e=>setData(e.target.value)}
                    style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'5px 8px', fontSize:13, color:'#1e293b' }}/>
                  <button onClick={()=>{const d=new Date(data+'T12:00');d.setDate(d.getDate()+1);setData(d.toISOString().slice(0,10))}}
                    style={{ width:28, height:28, borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontWeight:700, fontSize:14, color:'#374151' }}>›</button>
                </div>
              )}

              {/* Busca */}
              <div style={{ position:'relative', flex:1, minWidth:160 }}>
                <Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
                <input placeholder="Nome ou chapa…" value={busca} onChange={e=>setBusca(e.target.value)}
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px 6px 28px', fontSize:13, boxSizing:'border-box', color:'#1e293b' }}/>
              </div>
            </div>

            {/* Chips de status (clicáveis) */}
            <div style={{ padding:'8px 14px', borderBottom:'1px solid #e2e8f0', display:'flex', gap:6, flexWrap:'wrap' }}>
              {Object.entries(SC).map(([k,v]) => {
                const cnt = resumo[k as keyof typeof resumo] ?? 0
                const ativo = statusFiltro === k
                const pct   = colabsObra.length > 0 ? Math.round((cnt/colabsObra.length)*100) : 0
                return (
                  <button key={k} onClick={()=>setStatusFiltro(ativo?'todos':k)} style={{
                    display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:20,
                    border:`1.5px solid ${ativo?v.cor:v.border}`,
                    background: ativo ? v.bg : '#fff',
                    cursor:'pointer', transition:'all 0.12s',
                  }}>
                    <span style={{ fontSize:12 }}>{v.emoji}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:v.cor }}>{cnt}</span>
                    <span style={{ fontSize:10, color:'#64748b' }}>{v.label}</span>
                    <span style={{ fontSize:10, color:v.cor, fontWeight:700 }}>({pct}%)</span>
                  </button>
                )
              })}
              {statusFiltro!=='todos' && (
                <button onClick={()=>setStatusFiltro('todos')} style={{ fontSize:11, padding:'5px 9px', borderRadius:20, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', fontWeight:700, cursor:'pointer' }}>
                  ✕ Limpar
                </button>
              )}
            </div>

            {/* Tabela */}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                    <th style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#374151', whiteSpace:'nowrap', position:'sticky', left:0, background:'#f8fafc', zIndex:2, minWidth:160 }}>Colaborador</th>
                    <th style={{ padding:'9px 10px', textAlign:'left', fontWeight:700, color:'#374151', whiteSpace:'nowrap' }}>Função</th>
                    <th style={{ padding:'9px 10px', textAlign:'left', fontWeight:700, color:'#374151', whiteSpace:'nowrap' }}>Obra</th>
                    {viewMode === 'dia' ? (
                      <>
                        <th style={{ padding:'9px 10px', textAlign:'center', fontWeight:700, color:'#374151' }}>Status</th>
                        <th style={{ padding:'9px 10px', textAlign:'center', fontWeight:700, color:'#374151' }}>H.Extra</th>
                      </>
                    ) : diasRange.map(d => (
                      <th key={d} style={{ padding:'7px 3px', textAlign:'center', fontWeight:700, color:'#374151', minWidth:40, fontSize:10, whiteSpace:'nowrap' }}>
                        {new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colabsFiltrados.length === 0 ? (
                    <tr><td colSpan={5+diasRange.length} style={{ textAlign:'center', padding:32, color:'#94a3b8' }}>
                      Nenhum colaborador encontrado
                    </td></tr>
                  ) : colabsFiltrados.map((c,i) => {
                    const refD = viewMode==='dia' ? data : dataFim
                    const st   = pontosMap.get(c.id)?.get(refD)?.status ?? 'sem_lancamento'
                    const sc   = SC[st] ?? SC['sem_lancamento']
                    return (
                      <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9', background:i%2===0?'#fff':'#fafafa' }}>
                        <td style={{ padding:'8px 12px', position:'sticky', left:0, background:i%2===0?'#fff':'#fafafa', zIndex:1 }}>
                          <div style={{ fontWeight:600, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>{c.nome}</div>
                          <div style={{ fontSize:10, color:'#94a3b8' }}>{c.chapa} · {c.tipo_contrato==='clt'?'CLT':'Autôn.'}</div>
                        </td>
                        <td style={{ padding:'8px 10px', color:'#374151', whiteSpace:'nowrap' }}>{c.funcao}</td>
                        <td style={{ padding:'8px 10px', color:'#374151', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.obra}</td>
                        {viewMode === 'dia' ? (
                          <>
                            <td style={{ padding:'8px 10px', textAlign:'center' }}>
                              <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, background:sc.bg, color:sc.cor, fontWeight:700, fontSize:11, whiteSpace:'nowrap', border:`1px solid ${sc.border}` }}>
                                {sc.emoji} {sc.label}
                              </span>
                            </td>
                            <td style={{ padding:'8px 10px', textAlign:'center', color:'#64748b' }}>
                              {pontosMap.get(c.id)?.get(data)?.horas_extra ?? '—'}
                            </td>
                          </>
                        ) : diasRange.map(d => {
                          const p  = pontosMap.get(c.id)?.get(d)
                          const s2 = SC[p?.status ?? 'sem_lancamento']
                          return (
                            <td key={d} style={{ padding:'6px 2px', textAlign:'center' }}
                              title={`${c.nome} — ${new Date(d+'T12:00').toLocaleDateString('pt-BR')}: ${s2?.label??'—'}`}>
                              <span style={{ fontSize:14 }}>{s2?.emoji??'—'}</span>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Rodapé */}
            <div style={{ padding:'8px 14px', borderTop:'1px solid #e2e8f0', fontSize:11, color:'#64748b', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:4 }}>
              <span>{colabsFiltrados.length} de {colabsObra.length} colaboradores</span>
              <span>{pontosTabela.length} lançamentos no período</span>
            </div>
          </div>
        </>
      )}
    </GestorLayout>
  )
}
