import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { Activity, Loader2, Download } from 'lucide-react'

// ── helper: converte 'YYYY-MM-DD' → 'YYYY-MM' ───────────────────────────────
const toMes = (d: string) => d.slice(0, 7)

export default function GestorRelatorios() {
  const hoje      = new Date().toISOString().slice(0, 10)
  // default: mês anterior (onde há dados) até hoje
  const mesAntIni = (() => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,8)+'01' })()

  const [loading,     setLoading]     = useState(false)
  const [dtIni,        setDtIni]        = useState(mesAntIni)
  const [dtFim,        setDtFim]        = useState(hoje)
  const [tipo,         setTipo]         = useState<'presenca'|'producao'|'atestados'|'acidentes'|'clima'>('producao')
  const [dados,        setDados]        = useState<any[]>([])
  const [obras,        setObras]        = useState<{id:string;nome:string}[]>([])
  const [obraFiltro,   setObraFiltro]   = useState('todas')

  // Carrega obras 1x
  useEffect(() => {
    supabase.from('obras').select('id,nome').neq('status','concluida').order('nome')
      .then(({data:o}) => setObras(o??[]))
  }, [])

  const fetchRelatorio = useCallback(async () => {
    setLoading(true); setDados([])
    try {
      if (tipo === 'presenca') {
        let q = supabase.from('portal_ponto_diario')
          .select('data, status, obra_id, colaborador_id, horas_extra, obras(nome), colaboradores(nome, chapa, funcoes(nome))')
          .gte('data', dtIni).lte('data', dtFim)
          .order('data', { ascending: false })
        if (obraFiltro !== 'todas') q = q.eq('obra_id', obraFiltro)
        const { data } = await q
        setDados(data ?? [])

      } else if (tipo === 'producao') {
        let q = supabase.from('ponto_producao')
          .select(`
            id, mes_referencia, obra_id, colaborador_id, quantidade, valor_total,
            playbook_itens!playbook_item_id(descricao, unidade),
            obras(nome),
            colaboradores(nome, chapa, tipo_contrato, funcoes(nome))
          `)
          .gte('mes_referencia', toMes(dtIni))
          .lte('mes_referencia', toMes(dtFim))
          .order('mes_referencia', { ascending: false })
        if (obraFiltro !== 'todas') q = q.eq('obra_id', obraFiltro)
        const { data } = await q
        setDados(data ?? [])

      } else if (tipo === 'atestados') {
        // atestados vinculam-se via colaborador → obra (colaboradores.obra_id)
        // se filtro de obra ativo, filtramos pelo join
        let q = supabase.from('atestados')
          .select('data, tipo, dias_afastamento, com_afastamento, cid, colaboradores!inner(nome, chapa, obra_id, obras(nome))')
          .gte('data', dtIni).lte('data', dtFim)
          .order('data', { ascending: false })
        if (obraFiltro !== 'todas') q = (q as any).eq('colaboradores.obra_id', obraFiltro)
        const { data } = await q
        setDados(data ?? [])

      } else if (tipo === 'acidentes') {
        let q = supabase.from('acidentes')
          .select('data_ocorrencia, gravidade, tipo, cat_emitida, obra_id, colaboradores(nome, obras(nome))')
          .gte('data_ocorrencia', dtIni).lte('data_ocorrencia', dtFim)
          .order('data_ocorrencia', { ascending: false })
        if (obraFiltro !== 'todas') q = q.eq('obra_id', obraFiltro)
        const { data } = await q
        setDados(data ?? [])

      } else if (tipo === 'clima') {
        let q = supabase.from('obra_clima')
          .select('data, condicao, choveu, precipitacao_mm, temperatura_max, temperatura_min, vento_kmh, impacto_obra, obra_id, obras(nome)')
          .gte('data', dtIni).lte('data', dtFim)
          .order('data', { ascending: false })
        if (obraFiltro !== 'todas') q = q.eq('obra_id', obraFiltro)
        const { data } = await q
        setDados(data ?? [])
      }
    } finally { setLoading(false) }
  }, [tipo, dtIni, dtFim, obraFiltro])

  useEffect(() => { fetchRelatorio() }, [fetchRelatorio])

  // ── Ranking de produção por colaborador ──────────────────────────────────
  const rankingColab = useMemo(() => {
    if (tipo !== 'producao') return []
    const m = new Map<string, { nome: string; chapa: string; funcao: string; tipo_c: string; qtd: number; valor: number; servicos: Set<string> }>()
    dados.forEach((r: any) => {
      const cid = r.colaborador_id ?? r.id
      if (!m.has(cid)) m.set(cid, {
        nome:     r.colaboradores?.nome ?? '—',
        chapa:    r.colaboradores?.chapa ?? '—',
        funcao:   r.colaboradores?.funcoes?.nome ?? '—',
        tipo_c:   r.colaboradores?.tipo_contrato ?? 'clt',
        qtd: 0, valor: 0, servicos: new Set(),
      })
      const v = m.get(cid)!
      v.qtd   += r.quantidade ?? 0
      v.valor += r.valor_total ?? 0
      if (r.playbook_itens?.descricao) v.servicos.add(r.playbook_itens.descricao)
    })
    return Array.from(m.values())
      .sort((a, b) => b.valor - a.valor)
      .map((v, i) => ({ pos: i + 1, ...v, servicos: v.servicos.size }))
  }, [dados, tipo])

  const totalProd  = useMemo(() => dados.reduce((s: number, r: any) => s + (r.quantidade ?? 0), 0), [dados])
  const totalValor = useMemo(() => dados.reduce((s: number, r: any) => s + (r.valor_total ?? 0), 0), [dados])

  function exportarCSV() {
    if (dados.length === 0) return
    const rows: (string|number)[][] = []
    if (tipo === 'presenca') {
      rows.push(['Data','Colaborador','Chapa','Função','Obra','Status','H.Extra'])
      dados.forEach((r: any) => rows.push([r.data, r.colaboradores?.nome??'—', r.colaboradores?.chapa??'—', r.colaboradores?.funcoes?.nome??'—', r.obras?.nome??'—', r.status, r.horas_extra??'']))
    } else if (tipo === 'producao') {
      rows.push(['Mês','Colaborador','Chapa','Função','Tipo','Obra','Serviço','Qtd','Valor R$'])
      dados.forEach((r: any) => rows.push([r.mes_referencia, r.colaboradores?.nome??'—', r.colaboradores?.chapa??'—', r.colaboradores?.funcoes?.nome??'—', r.colaboradores?.tipo_contrato??'—', r.obras?.nome??'—', r.playbook_itens?.descricao??'—', r.quantidade??0, (r.valor_total??0).toFixed(2)]))
    } else if (tipo === 'atestados') {
      rows.push(['Data','Tipo','Colaborador','Obra','Dias','Afastamento','CID'])
      dados.forEach((r: any) => rows.push([r.data, r.tipo??'—', r.colaboradores?.nome??'—', r.colaboradores?.obras?.nome??'—', r.dias_afastamento??'', r.com_afastamento?'Sim':'Não', r.cid??'']))
    } else if (tipo === 'acidentes') {
      rows.push(['Data','Colaborador','Obra','Tipo','Gravidade','CAT'])
      dados.forEach((r: any) => rows.push([r.data_ocorrencia, r.colaboradores?.nome??'—', r.colaboradores?.obras?.nome??'—', r.tipo??'—', r.gravidade, r.cat_emitida?'Sim':'Não']))
    } else {
      rows.push(['Data','Obra','Condição','Choveu','Precip.mm','T.Máx','T.Mín','Vento','Impacto'])
      dados.forEach((r: any) => rows.push([r.data, r.obras?.nome??'—', r.condicao, r.choveu?'Sim':'Não', r.precipitacao_mm??'', r.temperatura_max??'', r.temperatura_min??'', r.vento_kmh??'', r.impacto_obra]))
    }
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = `relatorio_${tipo}_${dtIni}_${dtFim}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const TH: React.CSSProperties = { padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#374151', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' }
  const TD: React.CSSProperties = { padding:'8px 12px', borderTop:'1px solid #f1f5f9' }
  const TIPOS = [
    { k:'presenca',  emoji:'👥', label:'Presença'  },
    { k:'producao',  emoji:'📦', label:'Produção'  },
    { k:'atestados', emoji:'🩺', label:'Atestados' },
    { k:'acidentes', emoji:'⚠️', label:'Acidentes' },
    { k:'clima',     emoji:'🌦️', label:'Clima'     },
  ]
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

  return (
    <GestorLayout>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ marginBottom:20, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, margin:0, color:'#0f172a', display:'flex', alignItems:'center', gap:8 }}>
            <Activity size={20} color="#64748b" /> Relatórios Gerenciais
          </h1>
          <p style={{ color:'#64748b', fontSize:12, margin:'4px 0 0' }}>Exportação e visualização de dados</p>
        </div>
        <button onClick={exportarCSV} disabled={dados.length===0}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:9, border:'none',
            background: dados.length>0 ? '#16a34a' : '#94a3b8', color:'#fff', fontWeight:700, fontSize:13,
            cursor: dados.length>0 ? 'pointer' : 'not-allowed' }}>
          <Download size={14}/> Exportar CSV
        </button>
      </div>

      {/* Tipos */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {TIPOS.map(t => (
          <button key={t.k} onClick={() => setTipo(t.k as any)} style={{
            padding:'8px 16px', borderRadius:9,
            border:`2px solid ${tipo===t.k ? '#2563eb' : '#e2e8f0'}`,
            background: tipo===t.k ? '#eff6ff' : '#fff',
            color: tipo===t.k ? '#2563eb' : '#64748b',
            fontWeight:700, fontSize:13, cursor:'pointer',
          }}>{t.emoji} {t.label}</button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'12px 16px', marginBottom:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <label style={{ fontSize:12, fontWeight:600, color:'#64748b' }}>Período:</label>
        <input type="date" value={dtIni} onChange={e => setDtIni(e.target.value)}
          style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'5px 8px', fontSize:13 }}/>
        <span style={{ color:'#94a3b8' }}>até</span>
        <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)}
          style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'5px 8px', fontSize:13 }}/>

        {/* Filtro Obra — em TODAS as abas */}
        <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)}
          style={{ border:`1.5px solid ${obraFiltro!=='todas'?'#2563eb':'#e2e8f0'}`, borderRadius:8, padding:'5px 10px', fontSize:13, background: obraFiltro!=='todas'?'#eff6ff':'#fff', color: obraFiltro!=='todas'?'#2563eb':'#374151', fontWeight: obraFiltro!=='todas'?700:400, minWidth:160 }}>
          <option value="todas">🏗️ Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>

        {tipo === 'producao' && (
          <span style={{ fontSize:11, color:'#64748b', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:6, padding:'4px 10px' }}>
            📅 Produção filtra por <strong>mês</strong>: {toMes(dtIni)} → {toMes(dtFim)}
          </span>
        )}
        {obraFiltro !== 'todas' && (
          <button onClick={() => setObraFiltro('todas')}
            style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', fontWeight:700, cursor:'pointer' }}>
            ✕ Limpar obra
          </button>
        )}
        <span style={{ fontSize:12, color:'#94a3b8', marginLeft:'auto' }}>{dados.length} registro(s)</span>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:48 }}>
          <Loader2 size={28} color="#64748b" style={{ animation:'spin 1s linear infinite' }}/>
        </div>
      ) : dados.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:40, textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:600 }}>Nenhum dado no período</div>
          {tipo === 'producao' && <div style={{ fontSize:12, marginTop:6, color:'#b45309' }}>Dados de produção disponíveis até {toMes(new Date(Date.now()-28*24*3600*1000).toISOString())} — ajuste o período</div>}
        </div>
      ) : (
        <>
          {/* ── PRODUÇÃO: Ranking + Tabela ── */}
          {tipo === 'producao' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

              {/* KPIs */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
                {[
                  { l:'Total Registros',   v: dados.length,            cor:'#2563eb' },
                  { l:'Qtd. Total',        v: totalProd.toLocaleString('pt-BR'), cor:'#b45309' },
                  { l:'Valor Total',       v: fmtBRL(totalValor),      cor:'#16a34a' },
                  { l:'Colaboradores',     v: rankingColab.length,     cor:'#7c3aed' },
                ].map(k => (
                  <div key={k.l} style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'14px 16px' }}>
                    <div style={{ fontSize:11, color:'#64748b', fontWeight:700 }}>{k.l}</div>
                    <div style={{ fontSize:20, fontWeight:900, color:k.cor }}>{k.v}</div>
                  </div>
                ))}
              </div>

              {/* Ranking por Colaborador */}
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg,#1e3a5f,#2563eb)' }}>
                  <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>🏆 Ranking — Produção por Colaborador</div>
                  <div style={{ color:'rgba(255,255,255,0.75)', fontSize:12 }}>ordenado por valor total</div>
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'#f8fafc' }}>
                        {['#','Colaborador','Função','Contrato','Qtd.','Serviços','Valor Total'].map(h => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rankingColab.map((c, i) => {
                        const maxVal = rankingColab[0]?.valor ?? 1
                        const pct    = maxVal > 0 ? (c.valor / maxVal) * 100 : 0
                        const medal  = c.pos===1 ? '🥇' : c.pos===2 ? '🥈' : c.pos===3 ? '🥉' : `${c.pos}º`
                        return (
                          <tr key={i} style={{ background: i%2===0 ? '#fff' : '#fafafa' }}>
                            <td style={{ ...TD, textAlign:'center', fontWeight:800, fontSize:16 }}>{medal}</td>
                            <td style={{ ...TD }}>
                              <div style={{ fontWeight:700, color:'#1e293b' }}>{c.nome}</div>
                              <div style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>{c.chapa}</div>
                              {/* barra de progresso */}
                              <div style={{ height:3, background:'#e2e8f0', borderRadius:2, marginTop:4, overflow:'hidden', minWidth:80 }}>
                                <div style={{ height:'100%', width:`${pct}%`, background: i===0 ? '#f59e0b' : i===1 ? '#94a3b8' : i===2 ? '#b45309' : '#2563eb', borderRadius:2, transition:'width 0.4s' }}/>
                              </div>
                            </td>
                            <td style={{ ...TD, color:'#374151' }}>{c.funcao}</td>
                            <td style={{ ...TD }}>
                              <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5,
                                background: c.tipo_c==='clt' ? '#eff6ff' : '#fff7ed',
                                color: c.tipo_c==='clt' ? '#2563eb' : '#ea580c',
                              }}>{c.tipo_c==='clt'?'CLT':'Autôn.'}</span>
                            </td>
                            <td style={{ ...TD, textAlign:'right', fontWeight:800, color:'#b45309' }}>
                              {c.qtd.toLocaleString('pt-BR',{maximumFractionDigits:2})}
                            </td>
                            <td style={{ ...TD, textAlign:'center', color:'#7c3aed', fontWeight:700 }}>{c.servicos}</td>
                            <td style={{ ...TD, textAlign:'right', fontWeight:900, color: i===0 ? '#b45309' : '#16a34a', fontSize:13 }}>
                              {fmtBRL(c.valor)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'#f1f5f9', borderTop:'2px solid #e2e8f0' }}>
                        <td colSpan={4} style={{ padding:'10px 12px', fontWeight:800, color:'#1e293b' }}>TOTAL GERAL</td>
                        <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:900, color:'#b45309' }}>{totalProd.toLocaleString('pt-BR',{maximumFractionDigits:2})}</td>
                        <td/>
                        <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:900, color:'#16a34a', fontSize:13 }}>{fmtBRL(totalValor)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Detalhe linha a linha */}
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:13, color:'#374151' }}>
                  📋 Detalhes por Lançamento ({Math.min(dados.length,200)} de {dados.length})
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ background:'#f8fafc' }}>
                      {['Mês','Colaborador','Chapa','Função','Tipo','Obra','Serviço','Qtd','Valor'].map(h => <th key={h} style={TH}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {dados.slice(0,200).map((r: any, i) => (
                        <tr key={i} style={{ background: i%2===0 ? '#fff' : '#fafafa' }}>
                          <td style={TD}>{r.mes_referencia ? `${r.mes_referencia.slice(5,7)}/${r.mes_referencia.slice(0,4)}` : '—'}</td>
                          <td style={{ ...TD, fontWeight:600 }}>{r.colaboradores?.nome ?? '—'}</td>
                          <td style={{ ...TD, fontFamily:'monospace', color:'#64748b' }}>{r.colaboradores?.chapa ?? '—'}</td>
                          <td style={TD}>{r.colaboradores?.funcoes?.nome ?? '—'}</td>
                          <td style={TD}>
                            <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:4,
                              background: r.colaboradores?.tipo_contrato==='clt' ? '#eff6ff' : '#fff7ed',
                              color: r.colaboradores?.tipo_contrato==='clt' ? '#2563eb' : '#ea580c',
                            }}>{r.colaboradores?.tipo_contrato==='clt'?'CLT':'Autôn.'}</span>
                          </td>
                          <td style={TD}>{r.obras?.nome ?? '—'}</td>
                          <td style={TD}>{r.playbook_itens?.descricao ?? '—'}</td>
                          <td style={{ ...TD, textAlign:'right', fontWeight:700, color:'#b45309' }}>
                            {(r.quantidade??0).toLocaleString('pt-BR',{maximumFractionDigits:2})} <span style={{ color:'#94a3b8', fontWeight:400 }}>{r.playbook_itens?.unidade??'un'}</span>
                          </td>
                          <td style={{ ...TD, textAlign:'right', fontWeight:800, color:'#16a34a' }}>{fmtBRL(r.valor_total??0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── PRESENÇA ── */}
          {tipo === 'presenca' && (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr style={{ background:'#f8fafc' }}>
                    {['Data','Colaborador','Chapa','Função','Obra','Status','H.Extra'].map(h=><th key={h} style={TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>{dados.slice(0,200).map((r: any,i) => (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                      <td style={{ ...TD, color:'#64748b' }}>{new Date(r.data+'T12:00').toLocaleDateString('pt-BR')}</td>
                      <td style={{ ...TD, fontWeight:600 }}>{r.colaboradores?.nome??'—'}</td>
                      <td style={{ ...TD, color:'#64748b', fontFamily:'monospace' }}>{r.colaboradores?.chapa??'—'}</td>
                      <td style={TD}>{r.colaboradores?.funcoes?.nome??'—'}</td>
                      <td style={TD}>{r.obras?.nome??'—'}</td>
                      <td style={TD}><span style={{ padding:'2px 7px', borderRadius:5, fontSize:11, fontWeight:700,
                        background: r.status==='presente'?'#dcfce7':r.status==='falta'?'#fee2e2':'#fef3c7',
                        color: r.status==='presente'?'#16a34a':r.status==='falta'?'#dc2626':'#b45309',
                      }}>{r.status}</span></td>
                      <td style={{ ...TD, textAlign:'center' }}>{r.horas_extra??'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {dados.length>200 && <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', fontSize:11, color:'#94a3b8', textAlign:'center' }}>Exibindo 200 de {dados.length} — use Exportar CSV para tudo</div>}
            </div>
          )}

          {/* ── ATESTADOS ── */}
          {tipo === 'atestados' && (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr style={{ background:'#f8fafc' }}>
                    {['Data','Tipo','Colaborador','Obra','Dias','Afastamento','CID'].map(h=><th key={h} style={TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>{dados.slice(0,200).map((r: any,i) => (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                      <td style={{ ...TD, color:'#64748b' }}>{new Date(r.data+'T12:00').toLocaleDateString('pt-BR')}</td>
                      <td style={TD}><span style={{ padding:'2px 7px', borderRadius:5, fontSize:11, fontWeight:700, background:'#f5f3ff', color:'#7c3aed' }}>{r.tipo??'—'}</span></td>
                      <td style={{ ...TD, fontWeight:600 }}>{r.colaboradores?.nome??'—'}</td>
                      <td style={TD}>{r.colaboradores?.obras?.nome??'—'}</td>
                      <td style={{ ...TD, textAlign:'center', fontWeight:800, color:(r.dias_afastamento??0)>=3?'#dc2626':'#374151' }}>{r.dias_afastamento?`${r.dias_afastamento}d`:'—'}</td>
                      <td style={{ ...TD, textAlign:'center', fontSize:14 }}>{r.com_afastamento?'✅':'—'}</td>
                      <td style={TD}>{r.cid?<span style={{ background:'#f1f5f9', borderRadius:4, padding:'2px 6px', fontFamily:'monospace', fontWeight:700, fontSize:11 }}>{r.cid}</span>:<span style={{ color:'#94a3b8' }}>—</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ACIDENTES ── */}
          {tipo === 'acidentes' && (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr style={{ background:'#f8fafc' }}>
                    {['Data','Colaborador','Obra','Tipo','Gravidade','CAT'].map(h=><th key={h} style={TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>{dados.map((r: any,i) => {
                    const gBg: Record<string,string>  = {leve:'#fef3c7',moderado:'#fff7ed',grave:'#fee2e2',fatal:'#fca5a5'}
                    const gCor: Record<string,string> = {leve:'#b45309',moderado:'#ea580c',grave:'#dc2626',fatal:'#7f1d1d'}
                    return (
                      <tr key={i} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                        <td style={{ ...TD, color:'#64748b' }}>{new Date(r.data_ocorrencia+'T12:00').toLocaleDateString('pt-BR')}</td>
                        <td style={{ ...TD, fontWeight:600 }}>{r.colaboradores?.nome??'—'}</td>
                        <td style={TD}>{r.colaboradores?.obras?.nome??'—'}</td>
                        <td style={TD}>{r.tipo??'—'}</td>
                        <td style={TD}><span style={{ padding:'2px 7px', borderRadius:5, fontSize:11, fontWeight:700, background:gBg[r.gravidade]??'#f3f4f6', color:gCor[r.gravidade]??'#6b7280' }}>{r.gravidade??'—'}</span></td>
                        <td style={{ ...TD, textAlign:'center', fontSize:14 }}>{r.cat_emitida?'✅':'❌'}</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── CLIMA ── */}
          {tipo === 'clima' && (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr style={{ background:'#f8fafc' }}>
                    {['Data','Obra','Condição','Choveu','Precip. mm','T. Máx.','Vento','Impacto'].map(h=><th key={h} style={TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>{dados.map((r: any,i) => (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                      <td style={{ ...TD, color:'#64748b' }}>{new Date(r.data+'T12:00').toLocaleDateString('pt-BR')}</td>
                      <td style={{ ...TD, fontWeight:600 }}>{r.obras?.nome??'—'}</td>
                      <td style={TD}>{r.condicao}</td>
                      <td style={TD}>{r.choveu?'🌧️ Sim':'☀️ Não'}</td>
                      <td style={{ ...TD, color:'#0369a1', fontWeight:r.precipitacao_mm?700:400 }}>{r.precipitacao_mm??'—'}</td>
                      <td style={{ ...TD, color:'#ea580c' }}>{r.temperatura_max!=null?`${r.temperatura_max}°C`:'—'}</td>
                      <td style={{ ...TD, color:'#64748b' }}>{r.vento_kmh!=null?`${r.vento_kmh} km/h`:'—'}</td>
                      <td style={TD}><span style={{ fontSize:11, fontWeight:700, padding:'2px 6px', borderRadius:4,
                        background: r.impacto_obra==='paralisacao'?'#fee2e2':r.impacto_obra==='nenhum'?'#dcfce7':'#fef3c7',
                        color: r.impacto_obra==='paralisacao'?'#dc2626':r.impacto_obra==='nenhum'?'#16a34a':'#b45309',
                      }}>{r.impacto_obra??'—'}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </GestorLayout>
  )
}
