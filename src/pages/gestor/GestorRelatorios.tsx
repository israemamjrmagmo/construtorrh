import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { Activity, Loader2, Download } from 'lucide-react'

export default function GestorRelatorios() {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesInicio = hoje.slice(0, 8) + '01'

  const [loading, setLoading] = useState(false)
  const [dtIni, setDtIni] = useState(mesInicio)
  const [dtFim, setDtFim] = useState(hoje)
  const [tipo, setTipo] = useState<'presenca' | 'producao' | 'atestados' | 'acidentes' | 'clima'>('presenca')
  const [dados, setDados] = useState<any[]>([])

  const fetchRelatorio = useCallback(async () => {
    setLoading(true)
    try {
      if (tipo === 'presenca') {
        const { data } = await supabase.from('portal_ponto_diario')
          .select('data, status, obra_id, colaborador_id, horas_extra, obras(nome), colaboradores(nome, chapa, funcoes(nome))')
          .gte('data', dtIni).lte('data', dtFim)
          .order('data', { ascending: false })
        setDados(data ?? [])
      } else if (tipo === 'producao') {
        const { data } = await supabase.from('portal_producao')
          .select('data, quantidade, unidade, servico_descricao, obra_id, colaborador_id, obras(nome), colaboradores(nome, tipo_contrato)')
          .gte('data', dtIni).lte('data', dtFim)
          .order('data', { ascending: false })
        setDados(data ?? [])
      } else if (tipo === 'atestados') {
        const { data } = await supabase.from('atestados')
          .select('data, tipo, dias_afastamento, com_afastamento, cid, colaboradores(nome, chapa, obras(nome))')
          .gte('data', dtIni).lte('data', dtFim)
          .order('data', { ascending: false })
        setDados(data ?? [])
      } else if (tipo === 'acidentes') {
        const { data } = await supabase.from('acidentes')
          .select('data_ocorrencia, gravidade, tipo, cat_emitida, colaboradores(nome, obras(nome))')
          .gte('data_ocorrencia', dtIni).lte('data_ocorrencia', dtFim)
          .order('data_ocorrencia', { ascending: false })
        setDados(data ?? [])
      } else if (tipo === 'clima') {
        const { data } = await supabase.from('obra_clima')
          .select('data, condicao, choveu, precipitacao_mm, temperatura_max, temperatura_min, vento_kmh, impacto_obra, obras(nome)')
          .gte('data', dtIni).lte('data', dtFim)
          .order('data', { ascending: false })
        setDados(data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [tipo, dtIni, dtFim])

  useEffect(() => { fetchRelatorio() }, [fetchRelatorio])

  function exportarCSV() {
    if (dados.length === 0) return
    const rows: string[][] = []
    if (tipo === 'presenca') {
      rows.push(['Data', 'Colaborador', 'Chapa', 'Função', 'Obra', 'Status', 'Horas'])
      dados.forEach((r: any) => rows.push([
        r.data, r.colaboradores?.nome ?? '—', r.colaboradores?.chapa ?? '—',
        r.colaboradores?.funcoes?.nome ?? '—', r.obras?.nome ?? '—',
        r.status, r.horas_extra ?? ''
      ]))
    } else if (tipo === 'producao') {
      rows.push(['Data', 'Colaborador', 'Obra', 'Serviço', 'Qtd', 'Unidade'])
      dados.forEach((r: any) => rows.push([
        r.data, r.colaboradores?.nome ?? '—', r.obras?.nome ?? '—',
        r.servico_descricao ?? '—', r.quantidade, r.unidade
      ]))
    } else if (tipo === 'atestados') {
      rows.push(['Data', 'Tipo', 'Colaborador', 'Obra', 'Dias Afastamento', 'Com Afastamento', 'CID'])
      dados.forEach((r: any) => rows.push([
        r.data, r.tipo ?? '—', r.colaboradores?.nome ?? '—',
        r.colaboradores?.obras?.nome ?? '—', r.dias_afastamento ?? '', r.com_afastamento ? 'Sim' : 'Não', r.cid ?? ''
      ]))
    } else if (tipo === 'acidentes') {
      rows.push(['Data', 'Colaborador', 'Obra', 'Tipo', 'Gravidade', 'CAT'])
      dados.forEach((r: any) => rows.push([
        r.data_ocorrencia, r.colaboradores?.nome ?? '—', r.colaboradores?.obras?.nome ?? '—',
        r.tipo ?? '—', r.gravidade, r.cat_emitida ? 'Sim' : 'Não'
      ]))
    } else {
      rows.push(['Data', 'Obra', 'Condição', 'Choveu', 'Precipitação mm', 'Temp Máx', 'Temp Mín', 'Vento km/h', 'Impacto'])
      dados.forEach((r: any) => rows.push([
        r.data, r.obras?.nome ?? '—', r.condicao, r.choveu ? 'Sim' : 'Não',
        r.precipitacao_mm ?? '', r.temperatura_max ?? '', r.temperatura_min ?? '',
        r.vento_kmh ?? '', r.impacto_obra
      ]))
    }
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `relatorio_${tipo}_${dtIni}_${dtFim}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const TIPOS = [
    { k: 'presenca', emoji: '👥', label: 'Presença' },
    { k: 'producao', emoji: '📦', label: 'Produção' },
    { k: 'atestados', emoji: '🩺', label: 'Atestados' },
    { k: 'acidentes', emoji: '⚠️', label: 'Acidentes' },
    { k: 'clima', emoji: '🌦️', label: 'Clima' },
  ]

  return (
    <GestorLayout>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={22} color="#64748b" /> Relatórios Gerenciais
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Exportação e visualização de dados</p>
        </div>
        <button onClick={exportarCSV} disabled={dados.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: dados.length > 0 ? '#16a34a' : '#94a3b8', color: '#fff', fontWeight: 700, fontSize: 13, cursor: dados.length > 0 ? 'pointer' : 'not-allowed' }}>
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Tipo de relatório */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TIPOS.map(t => (
          <button key={t.k} onClick={() => setTipo(t.k as any)}
            style={{
              padding: '8px 16px', borderRadius: 9, border: `2px solid ${tipo === t.k ? '#2563eb' : '#e2e8f0'}`,
              background: tipo === t.k ? '#eff6ff' : '#fff', color: tipo === t.k ? '#2563eb' : '#64748b',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Período:</label>
        <input type="date" value={dtIni} onChange={e => setDtIni(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 13 }} />
        <span style={{ color: '#94a3b8' }}>até</span>
        <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 13 }} />
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{dados.length} registro(s)</span>
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} color="#64748b" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : dados.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum dado no período</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            {tipo === 'presenca' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['Data', 'Colaborador', 'Chapa', 'Função', 'Obra', 'Status', 'Horas'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{dados.slice(0, 100).map((r: any, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.colaboradores?.nome ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b', fontFamily: 'monospace' }}>{r.colaboradores?.chapa ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.colaboradores?.funcoes?.nome ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.obras?.nome ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: r.status === 'presente' ? '#dcfce7' : r.status === 'falta' ? '#fee2e2' : '#fef3c7',
                        color: r.status === 'presente' ? '#16a34a' : r.status === 'falta' ? '#dc2626' : '#b45309',
                      }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>{r.horas_extra ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {tipo === 'producao' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['Data', 'Colaborador', 'Obra', 'Serviço', 'Qtd', 'Unidade'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{dados.slice(0, 100).map((r: any, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.colaboradores?.nome ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.obras?.nome ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.servico_descricao ?? '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#b45309' }}>{r.quantidade}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{r.unidade}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {tipo === 'atestados' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['Data', 'Tipo', 'Colaborador', 'Chapa', 'Obra', 'Dias Afastam.', 'Afastamento', 'CID'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{dados.slice(0, 100).map((r: any, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#f5f3ff', color: '#7c3aed' }}>{r.tipo ?? '—'}</span>
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.colaboradores?.nome ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b', fontFamily: 'monospace' }}>{r.colaboradores?.chapa ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.colaboradores?.obras?.nome ?? '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: (r.dias_afastamento ?? 0) >= 3 ? '#dc2626' : '#374151' }}>
                      {r.dias_afastamento ? `${r.dias_afastamento}d` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 14 }}>{r.com_afastamento ? '✅' : '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {r.cid ? <span style={{ background: '#f1f5f9', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontFamily: 'monospace', fontWeight: 700 }}>{r.cid}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {tipo === 'acidentes' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['Data', 'Colaborador', 'Obra', 'Tipo', 'Gravidade', 'CAT Emitida'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{dados.slice(0, 100).map((r: any, i) => {
                  const gravBg: Record<string,string> = { leve:'#fef3c7', moderado:'#fff7ed', grave:'#fee2e2', fatal:'#fca5a5' }
                  const gravCor: Record<string,string> = { leve:'#b45309', moderado:'#ea580c', grave:'#dc2626', fatal:'#7f1d1d' }
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{new Date(r.data_ocorrencia + 'T12:00').toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.colaboradores?.nome ?? '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{r.colaboradores?.obras?.nome ?? '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{r.tipo ?? '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: gravBg[r.gravidade] ?? '#f3f4f6', color: gravCor[r.gravidade] ?? '#6b7280' }}>
                          {r.gravidade ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 14 }}>{r.cat_emitida ? '✅' : '❌'}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            )}
            {tipo === 'clima' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['Data', 'Obra', 'Condição', 'Choveu', 'Precip. mm', 'T. Máx.', 'Vento', 'Impacto'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{dados.map((r: any, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.obras?.nome ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.condicao}</td>
                    <td style={{ padding: '8px 12px' }}>{r.choveu ? '🌧️ Sim' : '☀️ Não'}</td>
                    <td style={{ padding: '8px 12px', color: '#0369a1', fontWeight: r.precipitacao_mm ? 700 : 400 }}>{r.precipitacao_mm ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#ea580c' }}>{r.temperatura_max != null ? `${r.temperatura_max}°C` : '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{r.vento_kmh != null ? `${r.vento_kmh} km/h` : '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                        background: r.impacto_obra === 'paralisacao' ? '#fee2e2' : r.impacto_obra === 'nenhum' ? '#dcfce7' : '#fef3c7',
                        color: r.impacto_obra === 'paralisacao' ? '#dc2626' : r.impacto_obra === 'nenhum' ? '#16a34a' : '#b45309',
                      }}>{r.impacto_obra}</span>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          {dados.length > 100 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
              Exibindo 100 de {dados.length} registros. Use "Exportar CSV" para obter todos.
            </div>
          )}
        </div>
      )}
    </GestorLayout>
  )
}
