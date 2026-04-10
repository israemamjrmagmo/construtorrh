import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import { Umbrella, CalendarDays, AlertTriangle, Clock } from 'lucide-react'

// ─── Helpers (mesmo do admin) ────────────────────────────────────────────────
const hoje = new Date()

function addYears(d: Date, n: number) { const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r }
function addDays(d: Date, n: number)  { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function toISO(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDate(d: string | Date) {
  const dt = typeof d === 'string' ? new Date(d + 'T12:00:00') : d
  return dt.toLocaleDateString('pt-BR')
}
function diasEntre(a: Date, b: Date) { return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000)) }
function diasDireito(faltas: number) {
  if (faltas <= 5)  return 30
  if (faltas <= 14) return 24
  if (faltas <= 23) return 18
  if (faltas <= 32) return 12
  return 0
}

interface Periodo {
  numero: number
  aquisitivo_inicio: string; aquisitivo_fim: string
  concessivo_inicio: string; concessivo_fim: string
  faltas: number; dias_direito: number
  situacao: 'vigente' | 'concessivo' | 'vencido'
}

function gerarPeriodos(admissao: Date): Omit<Periodo, 'faltas' | 'dias_direito' | 'situacao'>[] {
  const list: Omit<Periodo, 'faltas' | 'dias_direito' | 'situacao'>[] = []
  let ini = admissao; let num = 1
  while (true) {
    const fim   = addDays(addYears(ini, 1), -1)
    const cIni  = addDays(fim, 1)
    const cFim  = addDays(addYears(cIni, 1), -1)
    if (ini > hoje) break
    list.push({ numero: num, aquisitivo_inicio: toISO(ini), aquisitivo_fim: toISO(fim), concessivo_inicio: toISO(cIni), concessivo_fim: toISO(cFim) })
    ini = addDays(fim, 1); num++
    if (num > 30) break
  }
  return list
}

function situacao(p: Omit<Periodo, 'faltas' | 'dias_direito' | 'situacao'>): Periodo['situacao'] {
  if (hoje <= new Date(p.aquisitivo_fim + 'T23:59:59')) return 'vigente'
  if (hoje <= new Date(p.concessivo_fim + 'T23:59:59')) return 'concessivo'
  return 'vencido'
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function PortalFerias() {
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [loading, setLoading]   = useState(true)
  const [nome, setNome]         = useState('')

  useEffect(() => {
    async function load() {
      const session = getPortalSession()
      if (!session?.colaborador_id) { setLoading(false); return }

      // Dados do colaborador
      const { data: colab } = await supabase
        .from('colaboradores')
        .select('nome, data_admissao, tipo_contrato')
        .eq('id', session.colaborador_id)
        .single()

      if (!colab || colab.tipo_contrato !== 'clt' || !colab.data_admissao) {
        setLoading(false); return
      }
      setNome(colab.nome)

      // Faltas injustificadas
      const { data: faltasRaw } = await supabase
        .from('registro_ponto')
        .select('data, falta, evento')
        .eq('colaborador_id', session.colaborador_id)
        .eq('falta', true)

      const faltasDatas = (faltasRaw ?? [])
        .filter((r: any) => r.evento !== 'atestado')
        .map((r: any) => r.data as string)

      const admissao = new Date(colab.data_admissao + 'T12:00:00')
      const base = gerarPeriodos(admissao)

      const calc: Periodo[] = base.map(p => {
        const acqIni = new Date(p.aquisitivo_inicio + 'T00:00:00')
        const acqFim = new Date(p.aquisitivo_fim    + 'T23:59:59')
        const faltas = faltasDatas.filter(d => {
          const dt = new Date(d + 'T12:00:00')
          return dt >= acqIni && dt <= acqFim
        }).length
        return { ...p, faltas, dias_direito: diasDireito(faltas), situacao: situacao(p) }
      })

      setPeriodos(calc)
      setLoading(false)
    }
    load()
  }, [])

  const periodoAtual = periodos.find(p => p.situacao === 'concessivo') ?? periodos.find(p => p.situacao === 'vigente')
  const vencidos     = periodos.filter(p => p.situacao === 'vencido' && p.dias_direito > 0)

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 32 }}>⏳</div>
      <div style={{ color: '#64748b', fontSize: 14 }}>Calculando férias…</div>
    </div>
  )

  if (!periodoAtual) return (
    <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
      <Umbrella size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
      <div style={{ fontWeight: 600 }}>Informação de férias indisponível</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>Contrato não CLT ou data de admissão não cadastrada.</div>
    </div>
  )

  const isConcessivo = periodoAtual.situacao === 'concessivo'
  const diasRestantes = isConcessivo
    ? diasEntre(hoje, new Date(periodoAtual.concessivo_fim + 'T23:59:59'))
    : null

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ background: 'linear-gradient(135deg,#0369a1,#0284c7)', borderRadius: 14, padding: '20px 22px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Umbrella size={22} />
          <div style={{ fontWeight: 800, fontSize: 17 }}>Minhas Férias</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
          {nome && <span>{nome} · </span>}CLT
        </div>

        {/* Dias de direito */}
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '14px 16px', marginTop: 8 }}>
          {isConcessivo ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginBottom: 4 }}>🏖️ Você tem direito a:</div>
              <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1 }}>
                {periodoAtual.dias_direito} dias
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                {periodoAtual.faltas > 0 ? `(${periodoAtual.faltas} falta${periodoAtual.faltas > 1 ? 's' : ''} no período aquisitivo)` : '(Sem faltas no período aquisitivo)'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginBottom: 4 }}>⏳ Período em aquisição</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
                {periodoAtual.dias_direito} dias projetados
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                Período completa em {fmtDate(periodoAtual.aquisitivo_fim)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Janela de férias */}
      {isConcessivo && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CalendarDays size={16} color="#15803d" />
            <div style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>Janela para tirar férias</div>
          </div>
          <div style={{ fontSize: 14, color: '#166534', fontWeight: 600, marginBottom: 4 }}>
            As férias devem ser programadas dentro do período:
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#14532d', background: '#dcfce7', borderRadius: 8, padding: '8px 14px', display: 'inline-block', marginBottom: 8 }}>
            {fmtDate(periodoAtual.concessivo_inicio)} → {fmtDate(periodoAtual.concessivo_fim)}
          </div>
          {diasRestantes !== null && (
            <div style={{ fontSize: 12, color: diasRestantes <= 60 ? '#b45309' : '#15803d', fontWeight: 600 }}>
              {diasRestantes <= 60 ? '⚠️' : '⏰'} {diasRestantes} dias restantes na janela concessiva
            </div>
          )}
        </div>
      )}

      {/* Alerta vencido */}
      {vencidos.length > 0 && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 10 }}>
          <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#b91c1c', marginBottom: 4 }}>Atenção: Férias vencidas!</div>
            <div style={{ fontSize: 13, color: '#7f1d1d' }}>
              Você possui {vencidos.length} período(s) com férias vencidas. Entre em contato com o RH para regularização.
            </div>
          </div>
        </div>
      )}

      {/* Regras */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10 }}>📋 Regra de dias (CLT art. 130)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { faltas: 'Até 5 faltas', dias: '30 dias' },
            { faltas: '6 a 14 faltas', dias: '24 dias' },
            { faltas: '15 a 23 faltas', dias: '18 dias' },
            { faltas: '24 a 32 faltas', dias: '12 dias' },
          ].map(r => (
            <div key={r.faltas} style={{ background: 'white', borderRadius: 7, padding: '7px 10px', border: '1px solid #e5e7eb', fontSize: 12 }}>
              <span style={{ color: '#64748b' }}>{r.faltas}</span>
              <span style={{ float: 'right', fontWeight: 700, color: '#15803d' }}>{r.dias}</span>
            </div>
          ))}
          <div style={{ background: '#fff1f2', borderRadius: 7, padding: '7px 10px', border: '1px solid #fecaca', fontSize: 12, gridColumn: '1 / -1' }}>
            <span style={{ color: '#b91c1c' }}>Mais de 32 faltas</span>
            <span style={{ float: 'right', fontWeight: 700, color: '#b91c1c' }}>Perde o direito</span>
          </div>
        </div>
      </div>
    </div>
  )
}
