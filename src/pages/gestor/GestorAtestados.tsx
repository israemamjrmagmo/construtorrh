import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { FileText, Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react'

interface AtestadoRow {
  id: string
  data: string
  colaborador_nome: string
  chapa: string
  funcao: string
  obra: string
  cid?: string
  dias: number
  com_afastamento: boolean
  tipo: string
  documento_url?: string
  observacoes?: string
  created_at: string
}

const TIPO_CFG: Record<string, { label: string; cor: string; bg: string; icon: React.ReactNode }> = {
  medico:         { label: 'Médico',         cor: '#7c3aed', bg: '#f5f3ff', icon: <FileText  size={13} /> },
  comparecimento: { label: 'Comparecimento', cor: '#2563eb', bg: '#eff6ff', icon: <Clock      size={13} /> },
  declaracao:     { label: 'Declaração',     cor: '#16a34a', bg: '#dcfce7', icon: <CheckCircle2 size={13} /> },
}

export default function GestorAtestados() {
  const hoje      = new Date().toISOString().slice(0, 10)
  const mesInicio = hoje.slice(0, 8) + '01'

  const [loading,     setLoading]     = useState(true)
  const [rows,        setRows]        = useState<AtestadoRow[]>([])
  const [tipoFiltro,  setTipoFiltro]  = useState('todos')
  const [dtIni,       setDtIni]       = useState(mesInicio)
  const [dtFim,       setDtFim]       = useState(hoje)
  const [busca,       setBusca]       = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('atestados')
        .select(`
          id, data, tipo, dias_afastamento, com_afastamento,
          cid, medico, descricao, observacoes, documento_url, created_at,
          colaboradores(nome, chapa, funcoes(nome), obras(nome))
        `)
        .gte('data', dtIni)
        .lte('data', dtFim)
        .order('data', { ascending: false })

      setRows((data ?? []).map((r: any) => ({
        id:               r.id,
        data:             r.data,
        colaborador_nome: r.colaboradores?.nome   ?? '—',
        chapa:            r.colaboradores?.chapa  ?? '—',
        funcao:           r.colaboradores?.funcoes?.nome ?? '—',
        obra:             r.colaboradores?.obras?.nome   ?? '—',
        cid:              r.cid,
        dias:             r.dias_afastamento ?? 0,
        com_afastamento:  r.com_afastamento  ?? false,
        tipo:             r.tipo             ?? 'medico',
        documento_url:    r.documento_url,
        observacoes:      r.observacoes,
        created_at:       r.created_at,
      })))
    } finally {
      setLoading(false)
    }
  }, [dtIni, dtFim])

  useEffect(() => { fetchData() }, [fetchData])

  const rowsFiltrados = useMemo(() => {
    let arr = rows
    if (tipoFiltro !== 'todos') arr = arr.filter(r => r.tipo === tipoFiltro)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(r =>
        r.colaborador_nome.toLowerCase().includes(q) ||
        (r.cid ?? '').toLowerCase().includes(q)
      )
    }
    return arr
  }, [rows, tipoFiltro, busca])

  const resumo = useMemo(() => ({
    total:          rows.length,
    comAfastamento: rows.filter(r => r.com_afastamento).length,
    diasTotal:      rows.reduce((s, r) => s + (r.dias ?? 0), 0),
  }), [rows])

  return (
    <GestorLayout>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={22} color="#7c3aed" /> Atestados Médicos
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Controle de atestados e afastamentos da equipe</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total no Período',   value: resumo.total,          cor: '#2563eb', bg: '#eff6ff' },
          { label: 'Com Afastamento',    value: resumo.comAfastamento, cor: '#dc2626', bg: '#fee2e2', alert: resumo.comAfastamento > 0 },
          { label: 'Dias de Afastamento',value: resumo.diasTotal,      cor: '#7c3aed', bg: '#f5f3ff' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#fff', borderRadius: 12,
            border: `1px solid ${(k as any).alert ? k.cor + '44' : '#e2e8f0'}`,
            padding: '14px 18px',
            boxShadow: (k as any).alert ? `0 0 0 2px ${k.cor}22` : 'none',
          }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.cor }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>De</label>
          <input type="date" value={dtIni} onChange={e => setDtIni(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 13 }} />
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>até</label>
          <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 13 }} />
        </div>
        <input
          placeholder="🔍 Buscar colaborador ou CID…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, flex: 1, minWidth: 200 }}
        />
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {['todos', 'medico', 'comparecimento', 'declaracao'].map(t => (
            <button key={t} onClick={() => setTipoFiltro(t)} style={{
              padding: '6px 12px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12,
              background: tipoFiltro === t ? '#7c3aed' : '#fff',
              color:      tipoFiltro === t ? '#fff'    : '#64748b',
              transition: 'all 0.1s',
            }}>
              {t === 'todos' ? 'Todos' : TIPO_CFG[t]?.label ?? t}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} color="#7c3aed" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left',   fontWeight: 700, color: '#374151' }}>Colaborador</th>
                <th style={{ padding: '10px 14px', textAlign: 'left',   fontWeight: 700, color: '#374151' }}>Obra</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Data</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Tipo</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Dias</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>CID</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Afastamento</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Documento</th>
              </tr>
            </thead>
            <tbody>
              {rowsFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                    🩺 Nenhum atestado no período
                  </td>
                </tr>
              ) : rowsFiltrados.map((r, i) => {
                const tc = TIPO_CFG[r.tipo] ?? TIPO_CFG['medico']
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700 }}>{r.colaborador_nome}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.chapa} · {r.funcao}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{r.obra}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b' }}>
                      {new Date(r.data + 'T12:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 9px', borderRadius: 7,
                        background: tc.bg, color: tc.cor, fontWeight: 700, fontSize: 11,
                      }}>
                        {tc.icon} {tc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: r.dias >= 3 ? '#dc2626' : '#374151' }}>
                      {r.dias > 0 ? `${r.dias}d` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {r.cid
                        ? <span style={{ background: '#f1f5f9', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontFamily: 'monospace', fontWeight: 700 }}>{r.cid}</span>
                        : <span style={{ color: '#94a3b8' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 14 }}>
                      {r.com_afastamento ? '✅' : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {r.documento_url
                        ? <a href={r.documento_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
                            📎 Ver
                          </a>
                        : <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
            {rowsFiltrados.length} atestado(s)
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </GestorLayout>
  )
}
