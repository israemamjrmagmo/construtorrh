import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { ShieldAlert, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'

interface AcidenteRow {
  id: string; data_acidente: string; hora?: string
  colaborador_nome: string; chapa: string; funcao: string; obra: string
  tipo: string; descricao: string; gravidade: string
  dias_afastamento?: number; cid?: string; cat_emitida: boolean
  status: string; created_at: string
}

const GRAVIDADE_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  leve:        { label: 'Leve',        cor: '#b45309', bg: '#fef3c7' },
  moderado:    { label: 'Moderado',    cor: '#ea580c', bg: '#fff7ed' },
  grave:       { label: 'Grave',       cor: '#dc2626', bg: '#fee2e2' },
  fatal:       { label: 'Fatal',       cor: '#7f1d1d', bg: '#fca5a5' },
  quase_acidente: { label: 'Quase Acidente', cor: '#6b7280', bg: '#f3f4f6' },
}

export default function GestorAcidentes() {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesInicio = hoje.slice(0, 8) + '01'
  const anoInicio = hoje.slice(0, 5) + '01-01'

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AcidenteRow[]>([])
  const [dtIni, setDtIni] = useState(mesInicio)
  const [dtFim, setDtFim] = useState(hoje)
  const [gravFiltro, setGravFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [diasSemAcidente, setDiasSemAcidente] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data }, { data: ultimo }] = await Promise.all([
        supabase.from('acidentes')
          .select(`
            id, data_acidente, hora_acidente, tipo_acidente, descricao,
            gravidade, dias_afastamento, cid, cat_emitida, status, created_at,
            colaboradores(nome, chapa, funcoes(nome), obras(nome))
          `)
          .gte('data_acidente', dtIni)
          .lte('data_acidente', dtFim)
          .order('data_acidente', { ascending: false }),
        supabase.from('acidentes')
          .select('data_acidente')
          .order('data_acidente', { ascending: false })
          .limit(1),
      ])

      // Calcular dias sem acidente
      if (ultimo && ultimo.length > 0) {
        const ultData = new Date(ultimo[0].data_acidente + 'T12:00')
        const diff = Math.floor((new Date().getTime() - ultData.getTime()) / (1000 * 60 * 60 * 24))
        setDiasSemAcidente(diff)
      } else {
        setDiasSemAcidente(999)
      }

      setRows((data ?? []).map((r: any) => ({
        id: r.id,
        data_acidente: r.data_acidente,
        hora: r.hora_acidente,
        colaborador_nome: r.colaboradores?.nome ?? '—',
        chapa: r.colaboradores?.chapa ?? '—',
        funcao: r.colaboradores?.funcoes?.nome ?? '—',
        obra: r.colaboradores?.obras?.nome ?? '—',
        tipo: r.tipo_acidente ?? '—',
        descricao: r.descricao ?? '',
        gravidade: r.gravidade ?? 'leve',
        dias_afastamento: r.dias_afastamento,
        cid: r.cid,
        cat_emitida: r.cat_emitida ?? false,
        status: r.status ?? 'registrado',
        created_at: r.created_at,
      })))
    } finally {
      setLoading(false)
    }
  }, [dtIni, dtFim])

  useEffect(() => { fetchData() }, [fetchData])

  const rowsFiltrados = useMemo(() => {
    let arr = rows
    if (gravFiltro !== 'todos') arr = arr.filter(r => r.gravidade === gravFiltro)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(r => r.colaborador_nome.toLowerCase().includes(q) || r.obra.toLowerCase().includes(q))
    }
    return arr
  }, [rows, gravFiltro, busca])

  const resumo = useMemo(() => ({
    total: rows.length,
    graves: rows.filter(r => r.gravidade === 'grave' || r.gravidade === 'fatal').length,
    comAfastamento: rows.filter(r => (r.dias_afastamento ?? 0) > 0).length,
    totalDiasAfastamento: rows.reduce((s, r) => s + (r.dias_afastamento ?? 0), 0),
    semCAT: rows.filter(r => !r.cat_emitida).length,
  }), [rows])

  return (
    <GestorLayout>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={22} color="#dc2626" /> Registros de Acidentes
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Controle de acidentes de trabalho e segurança</p>
      </div>

      {/* Banner dias sem acidente */}
      <div style={{
        background: diasSemAcidente >= 30
          ? 'linear-gradient(135deg, #15803d, #14532d)'
          : diasSemAcidente >= 7
          ? 'linear-gradient(135deg, #b45309, #92400e)'
          : 'linear-gradient(135deg, #dc2626, #991b1b)',
        borderRadius: 14, padding: '20px 24px', marginBottom: 20, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: `0 4px 16px ${diasSemAcidente >= 30 ? 'rgba(21,128,61,0.4)' : 'rgba(220,38,38,0.3)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 48 }}>{diasSemAcidente >= 30 ? '🏆' : diasSemAcidente >= 7 ? '⚠️' : '🚨'}</div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Dias sem acidentes registrados
            </div>
            <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1 }}>
              {diasSemAcidente >= 999 ? '∞' : diasSemAcidente}
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
              {diasSemAcidente >= 30 ? '🎯 Excelente! Continue assim.' : diasSemAcidente >= 7 ? '⚠️ Reforce as orientações de segurança.' : '🚨 Atenção! Acidente recente.'}
            </div>
          </div>
        </div>
        {resumo.graves > 0 && (
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{resumo.graves}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Grave(s) no período</div>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total no Período', value: resumo.total, cor: '#dc2626', bg: '#fee2e2' },
          { label: 'Graves / Fatais', value: resumo.graves, cor: '#7f1d1d', bg: '#fca5a5', alert: resumo.graves > 0 },
          { label: 'Com Afastamento', value: resumo.comAfastamento, cor: '#b45309', bg: '#fef3c7' },
          { label: 'Dias Afastados', value: resumo.totalDiasAfastamento, cor: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Sem CAT', value: resumo.semCAT, cor: '#ea580c', bg: '#fff7ed', alert: resumo.semCAT > 0 },
        ].map(k => (
          <div key={k.label} style={{
            background: '#fff', borderRadius: 12,
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
        <input placeholder="🔍 Buscar colaborador ou obra…" value={busca} onChange={e => setBusca(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, flex: 1, minWidth: 200 }} />
        <select value={gravFiltro} onChange={e => setGravFiltro(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff' }}>
          <option value="todos">Todas as gravidades</option>
          {Object.entries(GRAVIDADE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} color="#dc2626" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Colaborador</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Obra</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Data</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Tipo</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Gravidade</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Afastamento</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>CAT</th>
              </tr>
            </thead>
            <tbody>
              {rowsFiltrados.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                  {resumo.total === 0 ? '🏆 Nenhum acidente no período! Continue com as boas práticas.' : 'Nenhum resultado para os filtros.'}
                </td></tr>
              ) : rowsFiltrados.map((r, i) => {
                const gc = GRAVIDADE_CFG[r.gravidade] ?? GRAVIDADE_CFG['leve']
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700 }}>{r.colaborador_nome}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.chapa} · {r.funcao}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{r.obra}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b' }}>
                      {new Date(r.data_acidente + 'T12:00').toLocaleDateString('pt-BR')}
                      {r.hora && <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.hora}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>
                      <div style={{ fontWeight: 600 }}>{r.tipo}</div>
                      {r.descricao && <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.descricao}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 7, background: gc.bg, color: gc.cor, fontWeight: 700, fontSize: 11 }}>{gc.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: (r.dias_afastamento ?? 0) > 0 ? '#dc2626' : '#94a3b8' }}>
                      {(r.dias_afastamento ?? 0) > 0 ? `${r.dias_afastamento}d` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ fontSize: 14 }}>{r.cat_emitida ? '✅' : '❌'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
            {rowsFiltrados.length} acidente(s) no período
          </div>
        </div>
      )}
    </GestorLayout>
  )
}
