import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { Umbrella, CheckCircle2, AlertTriangle, Clock, CalendarDays, RefreshCw } from 'lucide-react'

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

function gerarPeriodos(admissao: Date) {
  const list: { numero: number; aquisitivo_inicio: string; aquisitivo_fim: string; concessivo_inicio: string; concessivo_fim: string }[] = []
  let ini = admissao; let num = 1
  while (num <= 30) {
    const fim  = addDays(addYears(ini, 1), -1)
    const cIni = addDays(fim, 1)
    const cFim = addDays(addYears(cIni, 1), -1)
    if (ini > hoje) break
    list.push({ numero: num, aquisitivo_inicio: toISO(ini), aquisitivo_fim: toISO(fim), concessivo_inicio: toISO(cIni), concessivo_fim: toISO(cFim) })
    ini = addDays(fim, 1); num++
  }
  return list
}

type Situacao = 'concessivo' | 'de_ferias' | null

interface ColabFerias {
  id: string
  nome: string
  chapa: string
  funcao: string
  obra_id: string
  obra_nome: string
  situacao: Situacao
  concessivo_inicio?: string
  concessivo_fim?: string
  dias_direito?: number
  dias_restantes?: number
  ferias_inicio?: string
  ferias_fim?: string
  ferias_dias?: number
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PortalFerias() {
  const session   = useMemo(() => getPortalSession(), [])
  const obrasIds  = session?.obras_ids ?? []

  const [colabs,     setColabs]     = useState<ColabFerias[]>([])
  const [obrasData,  setObrasData]  = useState<{ id: string; nome: string }[]>([])
  const [obraFiltro, setObraFiltro] = useState<string>('todas')
  const [loading,    setLoading]    = useState(true)
  const [busca,      setBusca]      = useState('')

  useEffect(() => {
    if (!obrasIds.length) { setLoading(false); return }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obrasIds.join(',')])

  async function load() {
    setLoading(true)

    // 1. Obras
    const { data: obras } = await supabase
      .from('obras').select('id,nome').in('id', obrasIds).order('nome')
    setObrasData(obras ?? [])

    // 2. Colaboradores CLT ativos/em férias nas obras
    const { data: colabsRaw } = await supabase
      .from('colaboradores')
      .select('id,nome,chapa,data_admissao,tipo_contrato,status,obra_id,funcoes(nome)')
      .in('obra_id', obrasIds)
      .eq('tipo_contrato', 'clt')
      .in('status', ['ativo', 'ferias', 'afastado'])
      .order('nome')

    if (!colabsRaw?.length) { setColabs([]); setLoading(false); return }

    const ids = colabsRaw.map((c: any) => c.id)

    // 3. Faltas injustificadas
    const { data: pontosRaw } = await supabase
      .from('registro_ponto')
      .select('colaborador_id,data,falta,evento')
      .in('colaborador_id', ids)
      .eq('falta', true)

    const faltasPorColab: Record<string, string[]> = {}
    ;(pontosRaw ?? []).forEach((r: any) => {
      if (r.evento === 'atestado') return
      if (!faltasPorColab[r.colaborador_id]) faltasPorColab[r.colaborador_id] = []
      faltasPorColab[r.colaborador_id].push(r.data)
    })

    // 4. Solicitações de férias aprovadas
    const { data: solsRaw } = await supabase
      .from('solicitacoes_ferias')
      .select('colaborador_id,data_inicio_solicitada,data_fim_solicitada,dias_solicitados,status')
      .in('colaborador_id', ids)
      .eq('status', 'aprovada')

    const solsPorColab: Record<string, { inicio: string; fim: string; dias: number }[]> = {}
    ;(solsRaw ?? []).forEach((s: any) => {
      if (!solsPorColab[s.colaborador_id]) solsPorColab[s.colaborador_id] = []
      solsPorColab[s.colaborador_id].push({
        inicio: s.data_inicio_solicitada,
        fim:    s.data_fim_solicitada,
        dias:   s.dias_solicitados,
      })
    })

    // 5. Obra nome lookup
    const obraNomePorId: Record<string, string> = {}
    ;(obras ?? []).forEach((o: any) => { obraNomePorId[o.id] = o.nome })

    // 6. Calcular situação de cada colaborador
    const resultado: ColabFerias[] = []

    for (const c of colabsRaw as any[]) {
      if (!c.data_admissao) continue

      const admissao = new Date(c.data_admissao + 'T12:00:00')
      const periodos = gerarPeriodos(admissao)
      const faltasColab = faltasPorColab[c.id] ?? []

      let situacao: Situacao = null
      let concessivo_inicio: string | undefined
      let concessivo_fim: string | undefined
      let dias_direito: number | undefined
      let dias_restantes: number | undefined
      let ferias_inicio: string | undefined
      let ferias_fim: string | undefined
      let ferias_dias: number | undefined

      for (const p of periodos) {
        const acqIni = new Date(p.aquisitivo_inicio + 'T00:00:00')
        const acqFim = new Date(p.aquisitivo_fim    + 'T23:59:59')
        const concIni = new Date(p.concessivo_inicio + 'T00:00:00')
        const concFim = new Date(p.concessivo_fim   + 'T23:59:59')

        // Período concessivo ativo
        if (hoje > acqFim && hoje <= concFim) {
          const faltas = faltasColab.filter(d => {
            const dt = new Date(d + 'T12:00:00')
            return dt >= acqIni && dt <= acqFim
          }).length

          concessivo_inicio = p.concessivo_inicio
          concessivo_fim    = p.concessivo_fim
          dias_direito      = diasDireito(faltas)
          dias_restantes    = diasEntre(hoje, concFim)
          situacao          = 'concessivo'
          break
        }
      }

      // Verificar se está de férias (solicitação aprovada e datas atuais)
      const solsAprov = solsPorColab[c.id] ?? []
      const hoje_iso  = toISO(hoje)
      const feriasAtu = solsAprov.find(s => s.inicio <= hoje_iso && s.fim >= hoje_iso)

      if (feriasAtu) {
        situacao      = 'de_ferias'
        ferias_inicio = feriasAtu.inicio
        ferias_fim    = feriasAtu.fim
        ferias_dias   = feriasAtu.dias
      }

      // Só inclui se concessivo ativo ou de férias
      if (!situacao) continue

      resultado.push({
        id:        c.id,
        nome:      c.nome,
        chapa:     c.chapa ?? '—',
        funcao:    (c.funcoes as any)?.nome ?? 'Sem função',
        obra_id:   c.obra_id,
        obra_nome: obraNomePorId[c.obra_id] ?? '—',
        situacao,
        concessivo_inicio,
        concessivo_fim,
        dias_direito,
        dias_restantes,
        ferias_inicio,
        ferias_fim,
        ferias_dias,
      })
    }

    // Ordenar: de férias primeiro, depois concessivo; dentro de cada grupo por dias_restantes asc
    resultado.sort((a, b) => {
      if (a.situacao === 'de_ferias' && b.situacao !== 'de_ferias') return -1
      if (a.situacao !== 'de_ferias' && b.situacao === 'de_ferias') return  1
      return (a.dias_restantes ?? 999) - (b.dias_restantes ?? 999)
    })

    setColabs(resultado)
    setLoading(false)
  }

  // Filtros
  const visiveis = useMemo(() => {
    let lista = colabs
    if (obraFiltro !== 'todas') lista = lista.filter(c => c.obra_id === obraFiltro)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      lista = lista.filter(c => c.nome.toLowerCase().includes(q) || c.chapa.toLowerCase().includes(q))
    }
    return lista
  }, [colabs, obraFiltro, busca])

  const totalDeFerias   = visiveis.filter(c => c.situacao === 'de_ferias').length
  const totalConcessivo = visiveis.filter(c => c.situacao === 'concessivo').length

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Umbrella size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#1e293b' }}>Férias da Equipe</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Colaboradores em período concessivo ou de férias</div>
          </div>
          <button onClick={load} disabled={loading}
            style={{ marginLeft: 'auto', background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 12 }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Atualizar
          </button>
        </div>

        {/* Filtro de obra */}
        {obrasData.length > 1 && (
          <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)}
            style={{ width: '100%', height: 40, border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 13, padding: '0 12px', marginBottom: 10, color: '#1e293b', fontWeight: 600 }}>
            <option value="todas">🏗️ Todas as obras</option>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        )}

        {/* Busca */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', color: '#94a3b8' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar colaborador (nome ou chapa)…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, background: '#fff', boxSizing: 'border-box', outline: 'none' }}
          />
          {busca && (
            <button onClick={() => setBusca('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14 }}>✕</button>
          )}
        </div>

        {/* Contadores */}
        {!loading && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'De férias agora',   val: totalDeFerias,   cor: '#15803d', bg: '#dcfce7', icon: '🏖️' },
              { label: 'Período concessivo', val: totalConcessivo, cor: '#0369a1', bg: '#dbeafe', icon: '✅' },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.cor }}>{s.icon} {s.val}</div>
                <div style={{ fontSize: 10, color: s.cor, fontWeight: 700, lineHeight: 1.3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista */}
      <div style={{ padding: '0 16px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: 13 }}>Calculando férias…</div>
          </div>
        ) : visiveis.length === 0 ? (
          <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 14, padding: 36, textAlign: 'center' }}>
            <Umbrella size={36} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontWeight: 700, fontSize: 14, color: '#475569', marginBottom: 4 }}>
              Nenhum colaborador em período concessivo ou de férias
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Colaboradores em período aquisitivo não aparecem aqui.
            </div>
          </div>
        ) : (
          <>
            {/* ── DE FÉRIAS ── */}
            {visiveis.filter(c => c.situacao === 'de_ferias').length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#15803d', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  🏖️ De Férias Agora
                </div>
                {visiveis.filter(c => c.situacao === 'de_ferias').map(c => (
                  <CardColab key={c.id} c={c} multiObra={obrasData.length > 1} />
                ))}
              </div>
            )}

            {/* ── PERÍODO CONCESSIVO ── */}
            {visiveis.filter(c => c.situacao === 'concessivo').length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#0369a1', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✅ Período Concessivo — Férias Disponíveis
                </div>
                {visiveis.filter(c => c.situacao === 'concessivo').map(c => (
                  <CardColab key={c.id} c={c} multiObra={obrasData.length > 1} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  )
}

// ─── Card individual ──────────────────────────────────────────────────────────
function CardColab({ c, multiObra }: { c: ColabFerias; multiObra: boolean }) {
  const isFerias     = c.situacao === 'de_ferias'
  const borderColor  = isFerias ? '#bbf7d0' : '#bfdbfe'
  const bgColor      = isFerias ? '#f0fdf4' : '#eff6ff'
  const badgeColor   = isFerias ? '#15803d' : '#1d4ed8'
  const badgeBg      = isFerias ? '#dcfce7' : '#dbeafe'

  // Dias restantes das férias (para quem está de férias)
  const diasRestFerias = isFerias && c.ferias_fim
    ? diasEntre(new Date(), new Date(c.ferias_fim + 'T23:59:59'))
    : null

  return (
    <div style={{
      background: bgColor, border: `1.5px solid ${borderColor}`,
      borderRadius: 12, padding: '12px 14px', marginBottom: 8,
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      {/* Avatar */}
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: badgeColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 900, color: '#fff',
      }}>
        {c.nome.charAt(0)}
      </div>

      {/* Informações */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.nome}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
          {c.funcao} · <span style={{ fontFamily: 'monospace' }}>{c.chapa}</span>
        </div>
        {multiObra && (
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>🏗️ {c.obra_nome}</div>
        )}

        {/* Info de férias / concessivo */}
        <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {isFerias ? (
            <>
              <span style={{ fontSize: 11, fontWeight: 700, background: badgeBg, color: badgeColor, borderRadius: 6, padding: '2px 8px' }}>
                🏖️ {c.ferias_dias} dias de férias
              </span>
              <span style={{ fontSize: 11, color: '#374151' }}>
                {fmtDate(c.ferias_inicio!)} → {fmtDate(c.ferias_fim!)}
              </span>
              {diasRestFerias !== null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '2px 8px' }}>
                  ⏰ {diasRestFerias} dia{diasRestFerias !== 1 ? 's' : ''} restante{diasRestFerias !== 1 ? 's' : ''}
                </span>
              )}
            </>
          ) : (
            <>
              <span style={{ fontSize: 11, fontWeight: 700, background: badgeBg, color: badgeColor, borderRadius: 6, padding: '2px 8px' }}>
                ✅ {c.dias_direito} dias disponíveis
              </span>
              <span style={{ fontSize: 11, color: '#374151' }}>
                Janela: {fmtDate(c.concessivo_inicio!)} → {fmtDate(c.concessivo_fim!)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.dias_restantes! <= 60 ? '#b91c1c' : '#0369a1', background: c.dias_restantes! <= 60 ? '#fee2e2' : '#dbeafe', borderRadius: 6, padding: '2px 8px' }}>
                {c.dias_restantes! <= 60 ? '⚠️' : '⏰'} {c.dias_restantes} dias na janela
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
