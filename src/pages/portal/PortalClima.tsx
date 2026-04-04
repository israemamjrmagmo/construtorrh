import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { CloudRain, Sun, Wind, Thermometer, Plus, Loader2 } from 'lucide-react'
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

interface FormClima {
  obra_id: string; data: string; choveu: boolean
  precipitacao_mm: string; temperatura_max: string; temperatura_min: string
  vento_kmh: string; umidade_pct: string
  condicao: string; impacto_obra: string; observacoes: string
}

interface ClimaRow {
  id: string; data: string; condicao: string; choveu: boolean
  precipitacao_mm?: number | null; temperatura_max?: number | null
  vento_kmh?: number | null; impacto_obra: string; observacoes?: string | null
}

export default function PortalClima() {
  const nav = useNavigate()
  const session = useMemo(() => getPortalSession(), [])
  const obras = session?.obras_ids ?? []
  const hoje = new Date().toISOString().slice(0, 10)
  const mesInicio = hoje.slice(0, 8) + '01'

  const [obraId, setObraId] = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{ id: string; nome: string }[]>([])
  const [historico, setHistorico] = useState<ClimaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'form' | 'sucesso'>('form')

  const [form, setForm] = useState<FormClima>({
    obra_id: obraId, data: hoje, choveu: false,
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
      .select('id, data, condicao, choveu, precipitacao_mm, temperatura_max, vento_kmh, impacto_obra, observacoes')
      .eq('obra_id', obraId)
      .gte('data', mesInicio)
      .order('data', { ascending: false })
    setHistorico(data ?? [])
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
      // Upsert por obra_id + data
      const { error } = await supabase.from('obra_clima').upsert(payload, { onConflict: 'obra_id,data' })
      if (error) { toast.error('Erro: ' + error.message); return }
      toast.success('Registro climático salvo!')
      setStep('sucesso')
      fetchHistorico()
    } finally {
      setSaving(false)
    }
  }

  function novoRegistro() {
    setForm({ obra_id: obraId, data: hoje, choveu: false, precipitacao_mm: '', temperatura_max: '', temperatura_min: '', vento_kmh: '', umidade_pct: '', condicao: 'ensolarado', impacto_obra: 'nenhum', observacoes: '' })
    setStep('form')
  }

  const diasChuva = historico.filter(r => r.choveu).length
  const obraNome = obrasData.find(o => o.id === obraId)?.nome ?? '—'

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
            { emoji: '☀️', val: historico.length - diasChuva, label: 'Dias de Sol' },
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
            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 18 }}>Dados climáticos de {new Date(form.data + 'T12:00').toLocaleDateString('pt-BR')} registrados com sucesso.</div>
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
                  {form.choveu ? '🌧️ Choveu neste dia' : '☀️ Não choveu'}
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

        {/* Histórico */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: '#0f172a' }}>📋 Histórico do Mês — {obraNome}</div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={20} color="#0ea5e9" style={{ animation: 'spin 1s linear infinite' }} /></div>
          ) : historico.length === 0 ? (
            <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              🌤️ Nenhum registro climático neste mês
            </div>
          ) : historico.map(r => {
            const cc = CONDICAO_CFG[r.condicao] ?? CONDICAO_CFG['ensolarado']
            const ic = IMPACTO_CFG[r.impacto_obra] ?? IMPACTO_CFG['nenhum']
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 8 }}>
                <div style={{ fontSize: 24, flexShrink: 0 }}>{cc.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
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
              </div>
            )
          })}
        </div>
      </div>
    </PortalLayout>
  )
}
