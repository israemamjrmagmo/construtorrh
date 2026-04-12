import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Umbrella, CalendarDays, AlertTriangle, CheckCircle2, Clock, Send, X } from 'lucide-react'

// ─── Session da chave do PortalContracheque ───────────────────────────────────
const SESSION_KEY = 'contracheque_session'
function getSession(): { colaborador_id: string; nome: string } | null {
  try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null } catch { return null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

interface SolicitacaoFerias {
  id: string
  data_inicio_solicitada: string
  data_fim_solicitada: string
  dias_solicitados: number
  status: 'pendente' | 'aprovada' | 'recusada'
  motivo_recusa?: string | null
  created_at: string
}

function gerarPeriodos(admissao: Date): Omit<Periodo, 'faltas' | 'dias_direito' | 'situacao'>[] {
  const list: Omit<Periodo, 'faltas' | 'dias_direito' | 'situacao'>[] = []
  let ini = admissao; let num = 1
  while (true) {
    const fim  = addDays(addYears(ini, 1), -1)
    const cIni = addDays(fim, 1)
    const cFim = addDays(addYears(cIni, 1), -1)
    if (ini > hoje) break
    list.push({ numero: num, aquisitivo_inicio: toISO(ini), aquisitivo_fim: toISO(fim), concessivo_inicio: toISO(cIni), concessivo_fim: toISO(cFim) })
    ini = addDays(fim, 1); num++
    if (num > 30) break
  }
  return list
}

function calcSituacao(p: Omit<Periodo, 'faltas' | 'dias_direito' | 'situacao'>): Periodo['situacao'] {
  if (hoje <= new Date(p.aquisitivo_fim + 'T23:59:59')) return 'vigente'
  if (hoje <= new Date(p.concessivo_fim + 'T23:59:59')) return 'concessivo'
  return 'vencido'
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PortalFeriasColab() {
  const [periodos, setPeriodos]       = useState<Periodo[]>([])
  const [loading, setLoading]         = useState(true)
  const [nome, setNome]               = useState('')
  const [colabId, setColabId]         = useState<string | null>(null)
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoFerias[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [dataInicio, setDataInicio]   = useState('')
  const [dataFim, setDataFim]         = useState('')
  const [enviando, setEnviando]       = useState(false)
  const [erro, setErro]               = useState('')

  useEffect(() => {
    async function load() {
      const session = getSession()
      if (!session?.colaborador_id) { setLoading(false); return }
      setColabId(session.colaborador_id)

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
        return { ...p, faltas, dias_direito: diasDireito(faltas), situacao: calcSituacao(p) }
      })

      setPeriodos(calc)

      // Solicitações existentes
      const { data: sols } = await supabase
        .from('solicitacoes_ferias')
        .select('*')
        .eq('colaborador_id', session.colaborador_id)
        .order('created_at', { ascending: false })
      setSolicitacoes((sols ?? []) as SolicitacaoFerias[])

      setLoading(false)
    }
    load()
  }, [])

  // Período concessivo atual
  const periodoConcessivo = periodos.find(p => p.situacao === 'concessivo')
  const periodoVigente    = periodos.find(p => p.situacao === 'vigente')
  const periodoAtual      = periodoConcessivo ?? periodoVigente
  const vencidos          = periodos.filter(p => p.situacao === 'vencido' && p.dias_direito > 0)

  // Validação do formulário
  const diasSolicitados = useMemo(() => {
    if (!dataInicio || !dataFim) return 0
    const ini = new Date(dataInicio + 'T12:00:00')
    const fim = new Date(dataFim   + 'T12:00:00')
    if (fim < ini) return 0
    return diasEntre(ini, fim) + 1
  }, [dataInicio, dataFim])

  // Data mínima = hoje + 90 dias
  const dataMinSolicitacao = toISO(addDays(hoje, 90))

  async function enviarSolicitacao() {
    if (!colabId || !dataInicio || !dataFim) return
    setErro('')

    const ini = new Date(dataInicio + 'T12:00:00')
    const fim = new Date(dataFim    + 'T12:00:00')

    if (fim < ini) { setErro('Data de fim deve ser após a data de início.'); return }
    if (diasSolicitados < 5) { setErro('O mínimo de dias de férias é 5 dias.'); return }
    if (periodoConcessivo && diasSolicitados > periodoConcessivo.dias_direito) {
      setErro(`Você tem direito a apenas ${periodoConcessivo.dias_direito} dias.`); return
    }

    // Verificar antecedência mínima de 90 dias
    const antecedencia = diasEntre(hoje, ini)
    if (antecedencia < 90) {
      setErro(`As férias devem ser solicitadas com no mínimo 90 dias de antecedência. A data de início mínima é ${fmtDate(dataMinSolicitacao)}.`); return
    }

    setEnviando(true)
    try {
      const { error } = await supabase.from('solicitacoes_ferias').insert({
        colaborador_id: colabId,
        data_inicio_solicitada: dataInicio,
        data_fim_solicitada: dataFim,
        dias_solicitados: diasSolicitados,
        status: 'pendente',
        periodo_concessivo_inicio: periodoConcessivo?.concessivo_inicio,
        periodo_concessivo_fim: periodoConcessivo?.concessivo_fim,
      })
      if (error) throw error

      // Recarregar solicitações
      const { data: sols } = await supabase
        .from('solicitacoes_ferias')
        .select('*')
        .eq('colaborador_id', colabId)
        .order('created_at', { ascending: false })
      setSolicitacoes((sols ?? []) as SolicitacaoFerias[])
      setModalAberto(false)
      setDataInicio(''); setDataFim('')
    } catch {
      setErro('Erro ao enviar solicitação. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  const STATUS_CONFIG = {
    pendente:  { label: '⏳ Aguardando aprovação', color: '#92400e', bg: '#fef3c7' },
    aprovada:  { label: '✅ Aprovada',              color: '#15803d', bg: '#dcfce7' },
    recusada:  { label: '❌ Recusada',              color: '#b91c1c', bg: '#fee2e2' },
  }

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:200, flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:32 }}>⏳</div>
      <div style={{ color:'#64748b', fontSize:14 }}>Calculando férias…</div>
    </div>
  )

  if (!periodoAtual) return (
    <div style={{ padding:24, textAlign:'center', color:'#64748b' }}>
      <Umbrella size={40} style={{ margin:'0 auto 12px', display:'block', opacity:0.3 }}/>
      <div style={{ fontWeight:600 }}>Informação de férias indisponível</div>
      <div style={{ fontSize:13, marginTop:4 }}>Contrato não CLT ou data de admissão não cadastrada.</div>
    </div>
  )

  const isConcessivo  = periodoAtual.situacao === 'concessivo'
  const diasRestantes = isConcessivo ? diasEntre(hoje, new Date(periodoAtual.concessivo_fim + 'T23:59:59')) : null
  const temSolPendente = solicitacoes.some(s => s.status === 'pendente')
  const temSolAprovada  = solicitacoes.some(s => s.status === 'aprovada')

  return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14, maxWidth:600, margin:'0 auto', paddingBottom:80 }}>

      {/* ── Card principal ── */}
      <div style={{ background:'linear-gradient(135deg,#0369a1,#0284c7)', borderRadius:14, padding:'18px 20px', color:'#fff' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <Umbrella size={20}/>
          <div style={{ fontWeight:800, fontSize:16 }}>Minhas Férias</div>
        </div>

        <div style={{ background:'rgba(255,255,255,0.18)', borderRadius:10, padding:'14px 16px' }}>
          {isConcessivo ? (
            <>
              <div style={{ fontSize:12, opacity:0.85, marginBottom:4 }}>🏖️ Você tem direito a:</div>
              <div style={{ fontSize:38, fontWeight:900, lineHeight:1 }}>{periodoAtual.dias_direito} dias</div>
              <div style={{ fontSize:12, opacity:0.75, marginTop:6, display:'flex', gap:12 }}>
                <span>📋 {periodoAtual.faltas === 0 ? 'Sem faltas' : `${periodoAtual.faltas} falta${periodoAtual.faltas > 1 ? 's' : ''}`} no período</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize:12, opacity:0.85, marginBottom:4 }}>⏳ Período em aquisição</div>
              <div style={{ fontSize:26, fontWeight:800, lineHeight:1.2 }}>{periodoAtual.dias_direito} dias projetados</div>
              <div style={{ fontSize:12, opacity:0.75, marginTop:4 }}>
                Completa em {fmtDate(periodoAtual.aquisitivo_fim)}
                {periodoAtual.faltas > 0 && ` · ${periodoAtual.faltas} falta${periodoAtual.faltas > 1 ? 's' : ''} até agora`}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Faltas no período ── */}
      <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ fontWeight:700, fontSize:13, color:'#374151', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
          <CalendarDays size={15} color="#64748b"/> Faltas no período aquisitivo atual
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:32, fontWeight:900, color: periodoAtual.faltas === 0 ? '#15803d' : periodoAtual.faltas > 14 ? '#dc2626' : '#d97706' }}>
              {periodoAtual.faltas}
            </div>
            <div style={{ fontSize:11, color:'#64748b' }}>faltas</div>
          </div>
          <div style={{ flex:1 }}>
            {[
              { max:5,  dias:30, label:'Até 5 faltas' },
              { max:14, dias:24, label:'6 a 14 faltas' },
              { max:23, dias:18, label:'15 a 23 faltas' },
              { max:32, dias:12, label:'24 a 32 faltas' },
            ].map((r, i) => {
              const ativo = periodoAtual.faltas <= r.max && (i === 0 || periodoAtual.faltas > [0,5,14,23][i])
              return (
                <div key={r.label} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'3px 8px', borderRadius:5, marginBottom:2, background: ativo ? '#dbeafe' : 'transparent', fontWeight: ativo ? 700 : 400, color: ativo ? '#1d4ed8' : '#64748b' }}>
                  <span>{r.label}</span><span style={{ color: ativo ? '#1d4ed8' : '#15803d' }}>→ {r.dias} dias</span>
                </div>
              )
            })}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'3px 8px', borderRadius:5, background: periodoAtual.faltas > 32 ? '#fee2e2' : 'transparent', fontWeight: periodoAtual.faltas > 32 ? 700 : 400, color: periodoAtual.faltas > 32 ? '#dc2626' : '#94a3b8' }}>
              <span>Mais de 32 faltas</span><span>→ Perde o direito</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Janela concessiva ── */}
      {isConcessivo && (
        <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <CheckCircle2 size={15} color="#15803d"/>
            <div style={{ fontWeight:700, fontSize:13, color:'#15803d' }}>✅ Período Concessivo — Férias disponíveis!</div>
          </div>
          <div style={{ fontSize:13, color:'#166534', fontWeight:600, marginBottom:6 }}>
            As férias devem ser programadas dentro do período:
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:'#14532d', background:'#dcfce7', borderRadius:8, padding:'8px 14px', display:'inline-block', marginBottom:6 }}>
            {fmtDate(periodoAtual.concessivo_inicio)} → {fmtDate(periodoAtual.concessivo_fim)}
          </div>
          {diasRestantes !== null && (
            <div style={{ fontSize:12, color: diasRestantes <= 60 ? '#b45309' : '#15803d', fontWeight:600, marginTop:4 }}>
              {diasRestantes <= 60 ? '⚠️' : '⏰'} {diasRestantes} dias restantes na janela
            </div>
          )}

          {/* Botão solicitar */}
          {!temSolPendente && !temSolAprovada && (
            <button
              onClick={() => setModalAberto(true)}
              style={{ marginTop:12, width:'100%', background:'#15803d', color:'#fff', border:'none', borderRadius:10, padding:'12px 16px', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
            >
              <Send size={15}/> Solicitar Férias
            </button>
          )}
          {temSolPendente && (
            <div style={{ marginTop:10, background:'#fef3c7', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#92400e', fontWeight:600 }}>
              ⏳ Você já tem uma solicitação aguardando aprovação.
            </div>
          )}
        </div>
      )}

      {/* ── Alerta vencido ── */}
      {vencidos.length > 0 && (
        <div style={{ background:'#fff1f2', border:'1px solid #fecaca', borderRadius:12, padding:'12px 14px', display:'flex', gap:10 }}>
          <AlertTriangle size={16} color="#dc2626" style={{ flexShrink:0, marginTop:2 }}/>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'#b91c1c', marginBottom:2 }}>Férias vencidas!</div>
            <div style={{ fontSize:12, color:'#7f1d1d' }}>Você possui {vencidos.length} período(s) com férias vencidas. Entre em contato com o RH.</div>
          </div>
        </div>
      )}

      {/* ── Histórico de solicitações ── */}
      {solicitacoes.length > 0 && (
        <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#374151', marginBottom:10 }}>📋 Minhas solicitações</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {solicitacoes.map(s => {
              const cfg = STATUS_CONFIG[s.status]
              return (
                <div key={s.id} style={{ background:cfg.bg, borderRadius:8, padding:'10px 12px', border:`1px solid ${cfg.color}30` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>
                        {fmtDate(s.data_inicio_solicitada)} → {fmtDate(s.data_fim_solicitada)}
                      </div>
                      <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{s.dias_solicitados} dias solicitados</div>
                      {s.motivo_recusa && (
                        <div style={{ fontSize:11, color:'#b91c1c', marginTop:4, fontStyle:'italic' }}>Motivo: {s.motivo_recusa}</div>
                      )}
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:6, background:'transparent', color:cfg.color, whiteSpace:'nowrap', flexShrink:0 }}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Modal solicitação ── */}
      {modalAberto && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }}>
          <div style={{ background:'white', borderRadius:'20px 20px 16px 16px', width:'100%', maxWidth:480, padding:'24px 20px 32px', boxShadow:'0 -8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:16, color:'#1e293b' }}>🏖️ Solicitar Férias</div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>Mínimo 90 dias de antecedência</div>
              </div>
              <button onClick={() => { setModalAberto(false); setErro(''); setDataInicio(''); setDataFim('') }}
                style={{ background:'#f1f5f9', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <X size={16} color="#64748b"/>
              </button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#374151', marginBottom:6 }}>Data de início *</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  min={dataMinSolicitacao}
                  max={periodoConcessivo?.concessivo_fim}
                  style={{ width:'100%', height:44, border:'2px solid #e2e8f0', borderRadius:10, padding:'0 12px', fontSize:14, boxSizing:'border-box', background:'#f8fafc', color:'#1e293b' }}/>
                <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>
                  Data mínima: {fmtDate(dataMinSolicitacao)} (90 dias a partir de hoje)
                </div>
              </div>

              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#374151', marginBottom:6 }}>Data de fim *</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  min={dataInicio || dataMinSolicitacao}
                  max={periodoConcessivo?.concessivo_fim}
                  style={{ width:'100%', height:44, border:'2px solid #e2e8f0', borderRadius:10, padding:'0 12px', fontSize:14, boxSizing:'border-box', background:'#f8fafc', color:'#1e293b' }}/>
              </div>

              {diasSolicitados > 0 && (
                <div style={{ background:'#dbeafe', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:24, fontWeight:900, color:'#1d4ed8' }}>{diasSolicitados} dias</div>
                  <div style={{ fontSize:11, color:'#3730a3' }}>de férias solicitados</div>
                  {periodoConcessivo && (
                    <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
                      Dentro da janela: {fmtDate(periodoConcessivo.concessivo_inicio)} → {fmtDate(periodoConcessivo.concessivo_fim)}
                    </div>
                  )}
                </div>
              )}

              {erro && (
                <div style={{ background:'#fee2e2', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#b91c1c', fontWeight:600 }}>
                  ⚠️ {erro}
                </div>
              )}

              <button onClick={enviarSolicitacao} disabled={enviando || !dataInicio || !dataFim}
                style={{ background: (!dataInicio || !dataFim || enviando) ? '#94a3b8' : '#15803d', color:'#fff', border:'none', borderRadius:10, padding:'14px 16px', fontSize:15, fontWeight:700, cursor: (!dataInicio || !dataFim || enviando) ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <Send size={15}/> {enviando ? 'Enviando…' : 'Enviar Solicitação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
