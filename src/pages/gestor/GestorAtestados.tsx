import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { FileText, Loader2, CheckCircle2, Clock, AlertCircle, XCircle } from 'lucide-react'

interface AtestadoRow {
  id: string; data: string; data_fim?: string; colaborador_nome: string
  chapa: string; funcao: string; obra: string; cid?: string
  dias: number; status: string; tipo: string
  arquivo_url?: string; observacoes?: string; created_at: string
}

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string; icon: React.ReactNode }> = {
  pendente:  { label: 'Pendente',   cor: '#b45309', bg: '#fef3c7', icon: <Clock size={13} /> },
  validado:  { label: 'Validado',   cor: '#16a34a', bg: '#dcfce7', icon: <CheckCircle2 size={13} /> },
  rejeitado: { label: 'Rejeitado',  cor: '#dc2626', bg: '#fee2e2', icon: <XCircle size={13} /> },
  processado:{ label: 'Processado', cor: '#2563eb', bg: '#eff6ff', icon: <CheckCircle2 size={13} /> },
}

export default function GestorAtestados() {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesInicio = hoje.slice(0, 8) + '01'

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AtestadoRow[]>([])
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const [dtIni, setDtIni] = useState(mesInicio)
  const [dtFim, setDtFim] = useState(hoje)
  const [busca, setBusca] = useState('')
  const [atualizando, setAtualizando] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('atestados')
        .select(`
          id, data_inicio, data_fim, cid, dias_afastamento, status, tipo,
          arquivo_url, observacoes, created_at,
          colaboradores(nome, chapa, funcoes(nome), obras(nome))
        `)
        .gte('data_inicio', dtIni)
        .lte('data_inicio', dtFim)
        .order('created_at', { ascending: false })

      setRows((data ?? []).map((r: any) => ({
        id: r.id,
        data: r.data_inicio,
        data_fim: r.data_fim,
        colaborador_nome: r.colaboradores?.nome ?? '—',
        chapa: r.colaboradores?.chapa ?? '—',
        funcao: r.colaboradores?.funcoes?.nome ?? '—',
        obra: r.colaboradores?.obras?.nome ?? '—',
        cid: r.cid,
        dias: r.dias_afastamento ?? 1,
        status: r.status ?? 'pendente',
        tipo: r.tipo ?? 'medico',
        arquivo_url: r.arquivo_url,
        observacoes: r.observacoes,
        created_at: r.created_at,
      })))
    } finally {
      setLoading(false)
    }
  }, [dtIni, dtFim])

  useEffect(() => { fetchData() }, [fetchData])

  const rowsFiltrados = useMemo(() => {
    let arr = rows
    if (statusFiltro !== 'todos') arr = arr.filter(r => r.status === statusFiltro)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(r => r.colaborador_nome.toLowerCase().includes(q) || (r.cid ?? '').toLowerCase().includes(q))
    }
    return arr
  }, [rows, statusFiltro, busca])

  const resumo = useMemo(() => ({
    total: rows.length,
    pendentes: rows.filter(r => r.status === 'pendente').length,
    validados: rows.filter(r => r.status === 'validado' || r.status === 'processado').length,
    diasTotal: rows.reduce((s, r) => s + (r.dias ?? 0), 0),
  }), [rows])

  async function atualizarStatus(id: string, novoStatus: string) {
    setAtualizando(id)
    await supabase.from('atestados').update({ status: novoStatus }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: novoStatus } : r))
    setAtualizando(null)
  }

  return (
    <GestorLayout>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={22} color="#7c3aed" /> Atestados Médicos
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Controle e validação de atestados e afastamentos</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total no Período', value: resumo.total, cor: '#2563eb', bg: '#eff6ff' },
          { label: 'Pendentes', value: resumo.pendentes, cor: '#b45309', bg: '#fef3c7', alert: resumo.pendentes > 0 },
          { label: 'Validados / Proc.', value: resumo.validados, cor: '#16a34a', bg: '#dcfce7' },
          { label: 'Total Dias', value: resumo.diasTotal, cor: '#7c3aed', bg: '#f5f3ff' },
        ].map(k => (
          <div key={k.label} style={{
            background: k.alert ? k.bg : '#fff', borderRadius: 12,
            border: `1px solid ${k.alert ? k.cor + '44' : '#e2e8f0'}`,
            padding: '14px 18px', boxShadow: k.alert ? `0 0 0 2px ${k.cor}22` : 'none',
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
        <input placeholder="🔍 Buscar colaborador ou CID…" value={busca} onChange={e => setBusca(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, flex: 1, minWidth: 200 }} />
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {['todos', 'pendente', 'validado', 'rejeitado'].map(s => (
            <button key={s} onClick={() => setStatusFiltro(s)} style={{
              padding: '6px 12px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12,
              background: statusFiltro === s ? '#7c3aed' : '#fff', color: statusFiltro === s ? '#fff' : '#64748b',
            }}>
              {s === 'todos' ? 'Todos' : STATUS_CFG[s]?.label ?? s}
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
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Colaborador</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Obra</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Data Início</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Data Fim</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Dias</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>CID</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rowsFiltrados.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>🩺 Nenhum atestado no período</td></tr>
              ) : rowsFiltrados.map((r, i) => {
                const sc = STATUS_CFG[r.status] ?? STATUS_CFG['pendente']
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
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b' }}>
                      {r.data_fim ? new Date(r.data_fim + 'T12:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: r.dias >= 3 ? '#dc2626' : '#374151' }}>
                      {r.dias}d
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {r.cid ? <span style={{ background: '#f1f5f9', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontFamily: 'monospace', fontWeight: 700 }}>{r.cid}</span> : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 7, background: sc.bg, color: sc.cor, fontWeight: 700, fontSize: 11 }}>
                        {sc.icon} {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {r.arquivo_url && (
                          <a href={r.arquivo_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
                            📎 Ver
                          </a>
                        )}
                        {r.status === 'pendente' && (
                          <>
                            <button disabled={atualizando === r.id} onClick={() => atualizarStatus(r.id, 'validado')}
                              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#dcfce7', color: '#16a34a', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                              ✓ Validar
                            </button>
                            <button disabled={atualizando === r.id} onClick={() => atualizarStatus(r.id, 'rejeitado')}
                              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#fee2e2', color: '#dc2626', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                              ✗ Rejeitar
                            </button>
                          </>
                        )}
                      </div>
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
    </GestorLayout>
  )
}
