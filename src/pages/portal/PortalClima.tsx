import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import MapaChuva, { ClimaItem } from '@/components/MapaChuva'
import { CloudRain, Sun, Wind, Thermometer, Plus, Loader2, Map } from 'lucide-react'
import { toast } from 'sonner'

const CONDICAO_CFG: Record<string, { emoji: string; label: string }> = {
  ensolarado:  { emoji: '☀️',  label: 'Ensolarado' },
  nublado:     { emoji: '⛅',  label: 'Nublado' },
  chuva_leve:  { emoji: '🌦️', label: 'Chuva Leve' },
  chuva_forte: { emoji: '🌧️', label: 'Chuva Forte' },
  tempestade:  { emoji: '⛈️', label: 'Tempestade' },
  garoa:       { emoji: '🌫️', label: 'Garoa' },
  vento_forte: { emoji: '💨',  label: 'Vento Forte' },
}

const IMPACTO_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  nenhum:      { label: 'Sem impacto',  cor: '#16a34a', bg: '#dcfce7' },
  pequeno:     { label: 'Pequeno',      cor: '#b45309', bg: '#fef3c7' },
  moderado:    { label: 'Moderado',     cor: '#ea580c', bg: '#fff7ed' },
  grande:      { label: 'Grande',       cor: '#dc2626', bg: '#fee2e2' },
  paralisacao: { label: 'Paralisação',  cor: '#7c3aed', bg: '#f5f3ff' },
}

const PERIODO_CFG = [
  { key: 'manha', label: '🌅 Manhã',  desc: '06h–12h' },
  { key: 'tarde', label: '☀️ Tarde',  desc: '12h–18h' },
  { key: 'noite', label: '🌙 Noite',  desc: '18h–00h' },
]

interface FormClima {
  obra_id: string; data: string; periodo: 'manha' | 'tarde' | 'noite'; choveu: boolean
  precipitacao_mm: string; temperatura_max: string; temperatura_min: string
  vento_kmh: string; umidade_pct: string
  condicao: string; impacto_obra: string; observacoes: string
}

interface ClimaRow extends ClimaItem {
  id: string
  condicao: string
  precipitacao_mm?: number | null
  temperatura_max?: number | null
  temperatura_min?: number | null
  vento_kmh?: number | null
  umidade_pct?: number | null
  observacoes?: string | null
}

export default function PortalClima() {
  const nav = useNavigate()
  const session = useMemo(() => getPortalSession(), [])
  const obras = session?.obras_ids ?? []
  const hoje = new Date().toISOString().slice(0, 10)
  const mesInicio = hoje.slice(0, 8) + '01'
  const anoMes = hoje.slice(0, 7)

  const [obraId, setObraId] = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{ id: string; nome: string }[]>([])
  const [historico, setHistorico] = useState<ClimaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'form' | 'sucesso'>('form')
  const [abaAtiva, setAbaAtiva] = useState<'historico' | 'mapa'>('historico')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [modalEditar, setModalEditar] = useState(false)
  const [formEditar, setFormEditar] = useState<FormClima & { id?: string }>({
    obra_id: '', data: hoje, periodo: 'manha', choveu: false,
    precipitacao_mm: '', temperatura_max: '', temperatura_min: '',
    vento_kmh: '', umidade_pct: '', condicao: 'ensolarado', impacto_obra: 'nenhum', observacoes: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)

  const [form, setForm] = useState<FormClima>({
    obra_id: obraId, data: hoje, periodo: 'manha', choveu: false,
    precipitacao_mm: '', temperatura_max: '', temperatura_min: '',
    vento_kmh: '', umidade_pct: '', condicao: 'ensolarado', impacto_obra: 'nenhum', observacoes: '',
  })

  useEffect(() => {
    if (!session) { nav('/portal'); return }
    fetchObras()
  }, [])

  useEffect(() => {
    if (obraId) fetchHistorico()
  }, [obraId])

  async function fetchObras() {
    if (!obras.length) return
    const { data } = await supabase.from('obras').select('id, nome').in('id', obras)
    setObrasData(data ?? [])
    if (data && data.length > 0) {
      setObraId(data[0].id)
      setForm(p => ({ ...p, obra_id: data[0].id }))
    }
  }

  async function fetchHistorico() {
    setLoading(true)
    const { data } = await supabase.from('obra_clima')
      .select('id, data, periodo, condicao, choveu, precipitacao_mm, temperatura_max, temperatura_min, vento_kmh, umidade_pct, impacto_obra, observacoes')
      .eq('obra_id', obraId)
      .gte('data', mesInicio)
      .order('data', { ascending: false })
      .order('periodo', { ascending: true })
    setHistorico((data ?? []).map((r: any) => ({
      ...r,
      periodo: r.periodo ?? 'manha',
    })))
    setLoading(false)
  }

  const setF = (k: keyof FormClima, v: any) => setForm(p => ({ ...p, [k]: v }))

  async function handleSalvar() {
    if (!form.obra_id) { toast.error('Selecione a obra'); return }
    setSaving(true)
    try {
      const payload = {
        obra_id: form.obra_id,
        data: form.data,
        periodo: form.periodo,
        choveu: form.choveu,
        precipitacao_mm: form.precipitacao_mm ? parseFloat(form.precipitacao_mm) : null,
        temperatura_max: form.temperatura_max ? parseFloat(form.temperatura_max) : null,
        temperatura_min: form.temperatura_min ? parseFloat(form.temperatura_min) : null,
        vento_kmh: form.vento_kmh ? parseFloat(form.vento_kmh) : null,
        umidade_pct: form.umidade_pct ? parseFloat(form.umidade_pct) : null,
        condicao: form.condicao,
        impacto_obra: form.impacto_obra,
        observacoes: form.observacoes || null,
        lancado_por: session?.nome ?? session?.login ?? 'portal',
      }
      const { error } = await supabase.from('obra_clima').upsert(payload, { onConflict: 'obra_id,data,periodo' })
      if (error) { toast.error('Erro: ' + error.message); return }
      toast.success('Registro climático salvo!')
      setStep('sucesso')
      fetchHistorico()
    } finally {
      setSaving(false)
    }
  }

  function novoRegistro() {
    setForm({ obra_id: obraId, data: hoje, periodo: 'manha', choveu: false, precipitacao_mm: '', temperatura_max: '', temperatura_min: '', vento_kmh: '', umidade_pct: '', condicao: 'ensolarado', impacto_obra: 'nenhum', observacoes: '' })
    setStep('form')
  }

  function abrirEditar(r: ClimaRow) {
    setEditandoId(r.id)
    setFormEditar({
      id: r.id,
      obra_id: obraId,
      data: r.data,
      periodo: r.periodo ?? 'manha',
      choveu: r.choveu,
      precipitacao_mm: r.precipitacao_mm != null ? String(r.precipitacao_mm) : '',
      temperatura_max: r.temperatura_max != null ? String(r.temperatura_max) : '',
      temperatura_min: r.temperatura_min != null ? String(r.temperatura_min) : '',
      vento_kmh: r.vento_kmh != null ? String(r.vento_kmh) : '',
      umidade_pct: r.umidade_pct != null ? String(r.umidade_pct) : '',
      condicao: r.condicao,
      impacto_obra: r.impacto_obra,
      observacoes: r.observacoes ?? '',
    })
    setModalEditar(true)
  }

  const setFE = (k: keyof FormClima, v: any) => setFormEditar(p => ({ ...p, [k]: v }))

  async function handleSalvarEditar() {
    if (!editandoId) return
    setSavingEdit(true)
    try {
      const payload = {
        periodo: formEditar.periodo,
        choveu: formEditar.choveu,
        precipitacao_mm: formEditar.precipitacao_mm ? parseFloat(formEditar.precipitacao_mm) : null,
        temperatura_max: formEditar.temperatura_max ? parseFloat(formEditar.temperatura_max) : null,
        temperatura_min: formEditar.temperatura_min ? parseFloat(formEditar.temperatura_min) : null,
        vento_kmh: formEditar.vento_kmh ? parseFloat(formEditar.vento_kmh) : null,
        umidade_pct: formEditar.umidade_pct ? parseFloat(formEditar.umidade_pct) : null,
        condicao: formEditar.condicao,
        impacto_obra: formEditar.impacto_obra,
        observacoes: formEditar.observacoes || null,
      }
      const { error } = await supabase.from('obra_clima').update(payload).eq('id', editandoId)
      if (error) { toast.error('Erro: ' + error.message); return }
      toast.success('Registro atualizado!')
      setModalEditar(false); setEditandoId(null); fetchHistorico()
    } finally {
      setSavingEdit(false)
    }
  }

  const diasChuva = [...new Set(historico.filter(r => r.choveu).map(r => r.data))].length
  const obraNome = obrasData.find(o => o.id === obraId)?.nome ?? '—'

  // Dados para o MapaChuva
  const mapaRegistros: ClimaItem[] = historico.map(r => ({
    data: r.data,
    periodo: r.periodo ?? 'manha',
    choveu: r.choveu,
    impacto_obra: r.impacto_obra,
  }))

  if (!session) return null

  return (
    <PortalLayout>
      <div style={{ padding: '16px 14px', maxWidth: 520, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌦️</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#0f172a' }}>Estação Climática</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Registre as condições do tempo na obra</p>
        </div>

        {/* Seletor de obra */}
        {obrasData.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Obra</label>
            <select value={obraId} onChange={e => { setObraId(e.target.value); setF('obra_id', e.target.value) }}
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
              {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
        )}

        {/* Resumo do mês */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { emoji: '🌧️', val: diasChuva, label: 'Dias de Chuva' },
            { emoji: '☀️', val: [...new Set(historico.filter(r => !r.choveu).map(r => r.data))].length, label: 'Dias de Sol' },
            { emoji: '⚠️', val: historico.filter(r => r.impacto_obra === 'paralisacao').length, label: 'Paralisações' },
          ].map(k => (
            <div key={k.label} style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '10px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 20 }}>{k.emoji}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{k.val}</div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {step === 'sucesso' ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#15803d', marginBottom: 4 }}>Registro Salvo!</div>
            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 18 }}>
              Dados climáticos de {new Date(form.data + 'T12:00').toLocaleDateString('pt-BR')} ({PERIODO_CFG.find(p => p.key === form.periodo)?.label}) registrados.
            </div>
            <button onClick={novoRegistro} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              ➕ Novo Registro
            </button>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {/* Formulário */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CloudRain size={16} color="#0ea5e9" />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Registrar Condições Climáticas</span>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Data */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>📅 Data</label>
                <input type="date" value={form.data} onChange={e => setF('data', e.target.value)}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
              </div>

              {/* Período do dia */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>⏰ Período do Dia</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {PERIODO_CFG.map(p => (
                    <button key={p.key} onClick={() => setF('periodo', p.key)}
                      style={{
                        padding: '10px 6px', borderRadius: 10,
                        border: `2px solid ${form.periodo === p.key ? '#0ea5e9' : '#e2e8f0'}`,
                        background: form.periodo === p.key ? '#e0f7ff' : '#fff',
                        cursor: 'pointer', textAlign: 'center',
                      }}>
                      <div style={{ fontSize: 16 }}>{p.label.split(' ')[0]}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: form.periodo === p.key ? '#0369a1' : '#374151', marginTop: 2 }}>
                        {p.label.split(' ').slice(1).join(' ')}
                      </div>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Condição */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>🌤️ Condição Climática</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
                  {Object.entries(CONDICAO_CFG).map(([k, v]) => (
                    <button key={k} onClick={() => {
                      setF('condicao', k)
                      setF('choveu', k.includes('chuva') || k === 'garoa' || k === 'tempestade')
                    }}
                      style={{
                        padding: '8px 6px', borderRadius: 9, border: `2px solid ${form.condicao === k ? '#0ea5e9' : '#e2e8f0'}`,
                        background: form.condicao === k ? '#e0f7ff' : '#fff',
                        fontWeight: 600, fontSize: 11, cursor: 'pointer', textAlign: 'center',
                      }}>
                      <div style={{ fontSize: 20 }}>{v.emoji}</div>
                      <div style={{ color: form.condicao === k ? '#0369a1' : '#64748b' }}>{v.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Choveu toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: form.choveu ? '#eff6ff' : '#f8fafc', borderRadius: 10, border: `1px solid ${form.choveu ? '#bfdbfe' : '#e2e8f0'}` }}>
                <button type="button" onClick={() => setF('choveu', !form.choveu)}
                  style={{ position: 'relative', display: 'inline-flex', width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: form.choveu ? '#0ea5e9' : 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 3, left: form.choveu ? 24 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 150ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
                <span style={{ fontSize: 14, fontWeight: 700, color: form.choveu ? '#0369a1' : '#374151' }}>
                  {form.choveu ? '🌧️ Choveu neste período' : '☀️ Não choveu'}
                </span>
              </div>

              {/* Medições */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {form.choveu && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>💧 Precipitação (mm)</label>
                    <input type="number" step="0.1" min="0" value={form.precipitacao_mm} onChange={e => setF('precipitacao_mm', e.target.value)}
                      placeholder="Ex: 35.5"
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                )}
                {[
                  { key: 'temperatura_max', label: '🌡️ Temp. Máxima (°C)', ph: 'Ex: 32' },
                  { key: 'temperatura_min', label: '❄️ Temp. Mínima (°C)', ph: 'Ex: 18' },
                  { key: 'vento_kmh', label: '💨 Vento (km/h)', ph: 'Ex: 25' },
                  { key: 'umidade_pct', label: '💦 Umidade (%)', ph: 'Ex: 75' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>{f.label}</label>
                    <input type="number" step="0.1" min="0" value={(form as any)[f.key]} onChange={e => setF(f.key as any, e.target.value)}
                      placeholder={f.ph}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>

              {/* Impacto na obra */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>🏗️ Impacto na Obra</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(IMPACTO_CFG).map(([k, v]) => (
                    <button key={k} onClick={() => setF('impacto_obra', k)}
                      style={{
                        padding: '7px 12px', borderRadius: 9, border: `2px solid ${form.impacto_obra === k ? v.cor : '#e2e8f0'}`,
                        background: form.impacto_obra === k ? v.bg : '#fff', color: form.impacto_obra === k ? v.cor : '#64748b',
                        fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observações */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>📝 Observações</label>
                <textarea value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} rows={2}
                  placeholder="Descreva o clima e impacto nas atividades…"
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              {/* Salvar */}
              <button onClick={handleSalvar} disabled={saving}
                style={{
                  padding: '13px', borderRadius: 12, border: 'none',
                  background: saving ? '#94a3b8' : 'linear-gradient(135deg, #0ea5e9, #0369a1)',
                  color: '#fff', fontWeight: 800, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: saving ? 'none' : '0 4px 12px rgba(14,165,233,0.4)',
                }}>
                {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> : '💾 Salvar Registro Climático'}
              </button>
            </div>
          </div>
        )}

        {/* Abas: Histórico / Mapa */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 14 }}>
            {[
              { key: 'historico', label: '📋 Histórico' },
              { key: 'mapa',     label: '🗺️ Mapa Pluviométrico' },
            ].map(t => (
              <button key={t.key} onClick={() => setAbaAtiva(t.key as any)}
                style={{
                  padding: '8px 16px', border: 'none', borderBottom: `3px solid ${abaAtiva === t.key ? '#0ea5e9' : 'transparent'}`,
                  background: 'none', fontWeight: abaAtiva === t.key ? 800 : 600, fontSize: 13,
                  color: abaAtiva === t.key ? '#0ea5e9' : '#64748b', cursor: 'pointer', marginBottom: -2,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {abaAtiva === 'mapa' ? (
            <MapaChuva
              registros={mapaRegistros}
              titulo={obraNome}
              mesRef={anoMes}
            />
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: '#0f172a' }}>
                📋 Histórico do Mês — {obraNome}
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={20} color="#0ea5e9" style={{ animation: 'spin 1s linear infinite' }} /></div>
              ) : historico.length === 0 ? (
                <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  🌤️ Nenhum registro climático neste mês
                </div>
              ) : historico.map(r => {
                const cc = CONDICAO_CFG[r.condicao] ?? CONDICAO_CFG['ensolarado']
                const ic = IMPACTO_CFG[r.impacto_obra] ?? IMPACTO_CFG['nenhum']
                const pc = PERIODO_CFG.find(p => p.key === r.periodo) ?? PERIODO_CFG[0]
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 8 }}>
                    <div style={{ fontSize: 24, flexShrink: 0 }}>{cc.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                        <span style={{ fontSize: 10, background: '#f1f5f9', borderRadius: 4, padding: '1px 5px', color: '#64748b' }}>{pc.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                        <span>{cc.label}</span>
                        {r.precipitacao_mm && <span>💧 {r.precipitacao_mm}mm</span>}
                        {r.temperatura_max && <span>🌡️ {r.temperatura_max}°C</span>}
                        {r.vento_kmh && <span>💨 {r.vento_kmh}km/h</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: ic.bg, color: ic.cor, flexShrink: 0 }}>
                      {ic.label}
                    </span>
                    <button onClick={() => abrirEditar(r)}
                      style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#64748b', flexShrink: 0 }}>
                      ✏️ Editar
                    </button>
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Modal Editar Registro Climático */}
        {modalEditar && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>✏️ Editar Registro Climático</span>
                <button onClick={() => setModalEditar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>✕</button>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                  📅 Data: {new Date(formEditar.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </div>
                {/* Período */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>⏰ Período</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                    {PERIODO_CFG.map(p => (
                      <button key={p.key} onClick={() => setFE('periodo', p.key)}
                        style={{ padding: '7px 4px', borderRadius: 8, border: `2px solid ${formEditar.periodo === p.key ? '#0ea5e9' : '#e2e8f0'}`, background: formEditar.periodo === p.key ? '#e0f7ff' : '#fff', fontWeight: 600, fontSize: 10, cursor: 'pointer', textAlign: 'center' }}>
                        <div style={{ fontSize: 14 }}>{p.label.split(' ')[0]}</div>
                        <div style={{ color: formEditar.periodo === p.key ? '#0369a1' : '#64748b' }}>{p.label.split(' ').slice(1).join(' ')}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Condição */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>🌤️ Condição Climática</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 5 }}>
                    {Object.entries(CONDICAO_CFG).map(([k, v]) => (
                      <button key={k} onClick={() => { setFE('condicao', k); setFE('choveu', k.includes('chuva') || k === 'garoa' || k === 'tempestade') }}
                        style={{ padding: '6px 4px', borderRadius: 8, border: `2px solid ${formEditar.condicao === k ? '#0ea5e9' : '#e2e8f0'}`, background: formEditar.condicao === k ? '#e0f7ff' : '#fff', fontWeight: 600, fontSize: 10, cursor: 'pointer', textAlign: 'center' }}>
                        <div style={{ fontSize: 18 }}>{v.emoji}</div>
                        <div style={{ color: formEditar.condicao === k ? '#0369a1' : '#64748b' }}>{v.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Toggle choveu */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: formEditar.choveu ? '#eff6ff' : '#f8fafc', borderRadius: 10, border: `1px solid ${formEditar.choveu ? '#bfdbfe' : '#e2e8f0'}` }}>
                  <button type="button" onClick={() => setFE('choveu', !formEditar.choveu)}
                    style={{ position: 'relative', display: 'inline-flex', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: formEditar.choveu ? '#0ea5e9' : 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 3, left: formEditar.choveu ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 150ms' }} />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: formEditar.choveu ? '#0369a1' : '#374151' }}>
                    {formEditar.choveu ? '🌧️ Choveu' : '☀️ Não choveu'}
                  </span>
                </div>
                {/* Medições */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {formEditar.choveu && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 3 }}>💧 Precipitação (mm)</label>
                      <input type="number" step="0.1" value={formEditar.precipitacao_mm} onChange={e => setFE('precipitacao_mm', e.target.value)}
                        style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} placeholder="0" />
                    </div>
                  )}
                  {[{ k: 'temperatura_max', l: '🌡️ Temp. Máx. (°C)' }, { k: 'temperatura_min', l: '❄️ Temp. Mín. (°C)' }, { k: 'vento_kmh', l: '💨 Vento (km/h)' }, { k: 'umidade_pct', l: '💦 Umidade (%)' }].map(f => (
                    <div key={f.k}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 3 }}>{f.l}</label>
                      <input type="number" step="0.1" value={(formEditar as any)[f.k]} onChange={e => setFE(f.k as any, e.target.value)}
                        style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} placeholder="—" />
                    </div>
                  ))}
                </div>
                {/* Impacto */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>🏗️ Impacto na Obra</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(IMPACTO_CFG).map(([k, v]) => (
                      <button key={k} onClick={() => setFE('impacto_obra', k)}
                        style={{ padding: '6px 10px', borderRadius: 8, border: `2px solid ${formEditar.impacto_obra === k ? v.cor : '#e2e8f0'}`, background: formEditar.impacto_obra === k ? v.bg : '#fff', color: formEditar.impacto_obra === k ? v.cor : '#64748b', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Observações */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 3 }}>📝 Observações</label>
                  <textarea value={formEditar.observacoes} onChange={e => setFE('observacoes', e.target.value)} rows={2}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              </div>
              <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setModalEditar(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>
                  Cancelar
                </button>
                <button onClick={handleSalvarEditar} disabled={savingEdit}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: savingEdit ? '#94a3b8' : '#0369a1', color: '#fff', fontWeight: 700, cursor: savingEdit ? 'not-allowed' : 'pointer' }}>
                  {savingEdit ? 'Salvando…' : '💾 Atualizar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
