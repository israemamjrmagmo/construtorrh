import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import {
  Trophy, Plus, Send, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Search, Loader2, AlertCircle, Gift,
} from 'lucide-react'

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface PlaybookItem {
  id: string
  descricao: string
  unidade: string
  categoria: string | null
  codigo: string | null
  valor_sugerido?: number | null   // preço configurado na obra
}

interface ColabRow {
  id: string
  nome: string
  chapa: string | null
}

interface PremiacaoRow {
  id: string
  colaborador_id: string
  descricao: string
  valor: number | null
  competencia: string | null
  status: string
  observacoes: string | null
  created_at: string
  colaboradores?: { nome: string; chapa: string | null }
  obra_id: string | null
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function mesLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MESES[+m - 1]}/${y}`
}
function prevMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function nextMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fmtBRL(v: number | null | undefined) {
  if (!v && v !== 0) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; cor: string; icone: string }> = {
  pendente:  { label: 'Pendente',  bg: '#fef3c7', cor: '#b45309', icone: '⏳' },
  aprovado:  { label: 'Aprovado',  bg: '#dcfce7', cor: '#15803d', icone: '✅' },
  pago:      { label: 'Pago',      bg: '#eff6ff', cor: '#1d4ed8', icone: '💳' },
  cancelado: { label: 'Cancelado', bg: '#fee2e2', cor: '#dc2626', icone: '❌' },
}

const inp: React.CSSProperties = {
  width: '100%', height: 42, border: '1.5px solid #e5e7eb', borderRadius: 10,
  padding: '0 12px', fontSize: 14, boxSizing: 'border-box',
  background: '#fff', color: '#111', outline: 'none',
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function PortalPremiacoes() {
  const nav = useNavigate()
  const session = getPortalSession()
  const obras_ids = session?.obras_ids ?? []

  const [aba, setAba] = useState<'nova' | 'historico'>('nova')
  const [competencia, setCompetencia] = useState(() =>
    new Date().toISOString().slice(0, 7)
  )

  // Playbook
  const [obraId, setObraId] = useState(obras_ids[0] ?? '')
  const [obrasData, setObrasData] = useState<{ id: string; nome: string }[]>([])
  const [playbookItens, setPlaybookItens] = useState<PlaybookItem[]>([])
  const [colabs, setColabs] = useState<ColabRow[]>([])
  const [historico, setHistorico] = useState<PremiacaoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erroMsg, setErroMsg] = useState('')
  const [buscaPlaybook, setBuscaPlaybook] = useState('')

  // Formulário de lançamento
  const [colabId, setColabId] = useState('')
  const [itemSelecionado, setItemSelecionado] = useState<PlaybookItem | null>(null)
  const [valorCustom, setValorCustom] = useState('')
  const [observacoes, setObs] = useState('')
  const [dataRef, setDataRef] = useState(new Date().toISOString().slice(0, 10))

  // ── Carregar dados ──────────────────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    if (!obras_ids.length) return
    setLoading(true)

    const [obraRes, colabRes, histRes] = await Promise.all([
      supabase.from('obras').select('id,nome').in('id', obras_ids).order('nome'),
      supabase
        .from('colaboradores')
        .select('id,nome,chapa')
        .eq('status', 'ativo')
        .order('nome'),
      supabase
        .from('premios')
        .select('id,colaborador_id,descricao,valor,competencia,status,observacoes,created_at,obra_id,colaboradores(nome,chapa)')
        .eq('competencia', competencia)
        .in('obra_id', obras_ids)
        .order('created_at', { ascending: false }),
    ])

    if (obraRes.data?.length) {
      setObrasData(obraRes.data)
      if (!obraId) setObraId(obraRes.data[0].id)
    }
    if (colabRes.data) setColabs(colabRes.data)
    if (histRes.data) setHistorico(histRes.data as PremiacaoRow[])

    setLoading(false)
  }, [session, obras_ids.join(','), competencia])

  // ── Carregar playbook da obra ───────────────────────────────────────────────
  const fetchPlaybook = useCallback(async () => {
    if (!obraId) return
    const [{ data: ativs }, { data: precos }] = await Promise.all([
      supabase
        .from('playbook_atividades')
        .select('id,descricao,unidade,categoria,codigo')
        .eq('ativo', true)
        .order('categoria', { nullsFirst: false })
        .order('descricao'),
      supabase
        .from('playbook_precos')
        .select('atividade_id,preco_unitario')
        .eq('obra_id', obraId)
        .eq('ativo', true),
    ])
    const precosMap = new Map<string, number>(
      (precos ?? []).map((p: any) => [p.atividade_id, p.preco_unitario])
    )
    const itens: PlaybookItem[] = (ativs ?? [])
      .filter((a: any) => precosMap.has(a.id))
      .map((a: any) => ({
        ...a,
        valor_sugerido: precosMap.get(a.id) ?? null,
      }))
    setPlaybookItens(itens)
  }, [obraId])

  useEffect(() => { fetchDados() }, [fetchDados])
  useEffect(() => { fetchPlaybook() }, [fetchPlaybook])

  // ── Filtrar itens do playbook ───────────────────────────────────────────────
  const itensFiltrados = useMemo(() => {
    const q = buscaPlaybook.toLowerCase()
    return playbookItens.filter(
      it =>
        !q ||
        it.descricao.toLowerCase().includes(q) ||
        (it.categoria ?? '').toLowerCase().includes(q) ||
        (it.codigo ?? '').toLowerCase().includes(q)
    )
  }, [playbookItens, buscaPlaybook])

  const porCategoria = useMemo(() => {
    const m = new Map<string, PlaybookItem[]>()
    itensFiltrados.forEach(it => {
      const cat = it.categoria ?? 'Outros'
      if (!m.has(cat)) m.set(cat, [])
      m.get(cat)!.push(it)
    })
    return m
  }, [itensFiltrados])

  // ── Selecionar item do playbook ────────────────────────────────────────────
  function selecionarItem(item: PlaybookItem) {
    setItemSelecionado(item)
    setValorCustom(item.valor_sugerido ? String(item.valor_sugerido) : '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Enviar premiação ────────────────────────────────────────────────────────
  async function enviarPremiacao() {
    setErroMsg('')
    if (!colabId) { setErroMsg('Selecione um colaborador.'); return }
    if (!itemSelecionado) { setErroMsg('Selecione um item do playbook.'); return }
    const valor = parseFloat(valorCustom)
    if (!valorCustom || isNaN(valor) || valor <= 0) { setErroMsg('Informe o valor da premiação.'); return }

    setSaving(true)
    try {
      const payload = {
        colaborador_id: colabId,
        obra_id:        obraId || null,
        tipo:           'Produtividade',
        descricao:      itemSelecionado.descricao,
        valor,
        data:           dataRef,
        competencia,
        observacoes:    observacoes || null,
        status:         'pendente',   // Admin vai aprovar manualmente
      }
      const { error } = await supabase.from('premios').insert(payload)
      if (error) throw error

      setSucesso(true)
      setColabId('')
      setItemSelecionado(null)
      setValorCustom('')
      setObs('')
      await fetchDados()
      setTimeout(() => setSucesso(false), 3000)
    } catch (e: any) {
      setErroMsg('Erro ao enviar: ' + (e?.message ?? String(e)))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!session) return null

  return (
    <PortalLayout>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '12px 16px 80px' }}>

        {/* Cabeçalho */}
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          borderRadius: 16, padding: '18px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'rgba(255,255,255,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Trophy size={26} color="#fff" />
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>Premiações</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
              Lançar premiação do colaborador com base no playbook
            </div>
          </div>
        </div>

        {/* Seletor de competência */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 12, marginBottom: 16,
        }}>
          <button
            onClick={() => setCompetencia(prevMes(competencia))}
            style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1e3a5f', minWidth: 100, textAlign: 'center' }}>
            {mesLabel(competencia)}
          </div>
          <button
            onClick={() => setCompetencia(nextMes(competencia))}
            style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
          {[
            { key: 'nova' as const, label: '➕ Nova Premiação' },
            { key: 'historico' as const, label: `📋 Histórico (${historico.length})` },
          ].map(ab => (
            <button
              key={ab.key}
              onClick={() => setAba(ab.key)}
              style={{
                padding: '10px 18px', border: 'none',
                borderBottom: aba === ab.key ? '3px solid #f59e0b' : '3px solid transparent',
                background: 'transparent',
                color: aba === ab.key ? '#d97706' : '#6b7280',
                fontWeight: aba === ab.key ? 700 : 500, fontSize: 13,
                cursor: 'pointer', marginBottom: -2,
              }}>
              {ab.label}
            </button>
          ))}
        </div>

        {/* ─── ABA NOVA PREMIAÇÃO ─── */}
        {aba === 'nova' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Mensagem sucesso */}
            {sucesso && (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={20} color="#15803d" />
                <span style={{ color: '#15803d', fontWeight: 700, fontSize: 14 }}>
                  Premiação enviada! O RH irá analisar e aprovar.
                </span>
              </div>
            )}

            {/* Erro */}
            {erroMsg && (
              <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={18} color="#dc2626" />
                <span style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erroMsg}</span>
              </div>
            )}

            {/* Card: item selecionado */}
            {itemSelecionado ? (
              <div style={{ background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', marginBottom: 4 }}>
                      Item selecionado · {itemSelecionado.categoria ?? 'Geral'}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1e3a5f' }}>{itemSelecionado.descricao}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      Valor sugerido: <strong style={{ color: '#d97706' }}>{fmtBRL(itemSelecionado.valor_sugerido)}</strong> / {itemSelecionado.unidade}
                    </div>
                  </div>
                  <button
                    onClick={() => { setItemSelecionado(null); setValorCustom('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18 }}>
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: '#fefce8', border: '1.5px dashed #fde68a', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#92400e', fontWeight: 600, textAlign: 'center' }}>
                👇 Selecione um item do playbook abaixo
              </div>
            )}

            {/* Formulário */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1e3a5f', marginBottom: 4 }}>Dados do Lançamento</div>

              {/* Obra */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>OBRA</label>
                <select value={obraId} onChange={e => setObraId(e.target.value)} style={{ ...inp, cursor: 'pointer', fontWeight: 600, color: '#1a56a0' }}>
                  {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>

              {/* Colaborador */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>COLABORADOR *</label>
                <select value={colabId} onChange={e => setColabId(e.target.value)} style={{ ...inp, cursor: 'pointer', fontWeight: 600, color: colabId ? '#1a56a0' : '#9ca3af' }}>
                  <option value="">— Selecione o colaborador —</option>
                  {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.chapa ? ` (${c.chapa})` : ''}</option>)}
                </select>
              </div>

              {/* Valor + Data */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>VALOR (R$) *</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={valorCustom}
                    onChange={e => setValorCustom(e.target.value)}
                    placeholder={itemSelecionado?.valor_sugerido ? fmtBRL(itemSelecionado.valor_sugerido) ?? '0,00' : '0,00'}
                    style={{ ...inp, fontWeight: 700, color: '#d97706' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>DATA</label>
                  <input
                    type="date" value={dataRef}
                    onChange={e => setDataRef(e.target.value)}
                    style={inp}
                  />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>OBSERVAÇÕES</label>
                <textarea
                  value={observacoes} onChange={e => setObs(e.target.value)}
                  rows={2} placeholder="Detalhes adicionais..."
                  style={{ ...inp, height: 64, padding: '10px 12px', resize: 'none', fontFamily: 'inherit' }}
                />
              </div>

              {/* Botão enviar */}
              <button
                onClick={enviarPremiacao}
                disabled={saving || !colabId || !itemSelecionado || !valorCustom}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '13px 20px', borderRadius: 12, border: 'none',
                  background: (saving || !colabId || !itemSelecionado || !valorCustom) ? '#e5e7eb' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: (saving || !colabId || !itemSelecionado || !valorCustom) ? '#9ca3af' : '#fff',
                  fontWeight: 700, fontSize: 15, cursor: (saving || !colabId || !itemSelecionado || !valorCustom) ? 'not-allowed' : 'pointer',
                  transition: 'all .2s',
                }}>
                {saving
                  ? <><Loader2 size={18} className="animate-spin" /> Enviando…</>
                  : <><Send size={16} /> Enviar Premiação ao RH</>
                }
              </button>

              <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
                ⚠️ A premiação ficará pendente até ser aprovada pelo RH. Após aprovação, será integrada automaticamente ao fechamento de ponto do colaborador.
              </div>
            </div>

            {/* ─── Playbook de Premiações ─── */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a5f', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Gift size={16} color="#f59e0b" /> Playbook de Premiações
              </div>

              {/* Busca */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  value={buscaPlaybook}
                  onChange={e => setBuscaPlaybook(e.target.value)}
                  placeholder="Buscar serviço ou categoria…"
                  style={{ ...inp, paddingLeft: 34, height: 38 }}
                />
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
                  <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
                  Carregando playbook…
                </div>
              ) : playbookItens.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 13 }}>
                  Nenhum item configurado para esta obra.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[...porCategoria.entries()].map(([cat, itens]) => (
                    <div key={cat}>
                      <div style={{
                        fontSize: 10, fontWeight: 700, color: '#fff',
                        background: '#1e3a5f', padding: '4px 12px', borderRadius: 6,
                        display: 'inline-block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {cat}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {itens.map(item => {
                          const isAtivo = itemSelecionado?.id === item.id
                          return (
                            <button
                              key={item.id}
                              onClick={() => selecionarItem(item)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 14px', borderRadius: 10,
                                border: isAtivo ? '2px solid #f59e0b' : '1.5px solid #e5e7eb',
                                background: isAtivo ? '#fffbeb' : '#fff',
                                cursor: 'pointer', textAlign: 'left',
                                transition: 'all .15s',
                              }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>{item.descricao}</div>
                                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                  {item.codigo && <span style={{ marginRight: 6 }}>#{item.codigo}</span>}
                                  {item.unidade}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                                <div style={{ fontWeight: 800, fontSize: 14, color: '#d97706' }}>
                                  {fmtBRL(item.valor_sugerido)}
                                </div>
                                <div style={{ fontSize: 10, color: '#9ca3af' }}>/ {item.unidade}</div>
                              </div>
                              {isAtivo && (
                                <div style={{ marginLeft: 10, color: '#f59e0b' }}>
                                  <CheckCircle2 size={18} />
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── ABA HISTÓRICO ─── */}
        {aba === 'historico' && (
          <div>
            {/* Navegação de mês */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <button onClick={() => setCompetencia(prevMes(competencia))}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ← Anterior
              </button>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1e3a5f' }}>{mesLabel(competencia)}</span>
              <button onClick={() => setCompetencia(nextMes(competencia))}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Próximo →
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
                <Loader2 size={24} style={{ display: 'block', margin: '0 auto 8px' }} />
                Carregando…
              </div>
            ) : historico.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
                <Trophy size={36} style={{ display: 'block', margin: '0 auto 12px', opacity: .2 }} />
                <div style={{ fontWeight: 600 }}>Nenhuma premiação lançada em {mesLabel(competencia)}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {historico.map(row => {
                  const st = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.pendente
                  return (
                    <div key={row.id} style={{
                      background: '#fff', border: '1.5px solid #e5e7eb',
                      borderRadius: 14, padding: 16,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a5f' }}>
                            {row.colaboradores?.nome ?? '—'}
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{row.descricao}</div>
                          {row.observacoes && (
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' }}>
                              {row.observacoes}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                            {new Date(row.created_at).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 16, color: '#d97706' }}>
                            {fmtBRL(row.valor)}
                          </div>
                          <div style={{
                            marginTop: 6, fontSize: 11, fontWeight: 700,
                            padding: '3px 10px', borderRadius: 20,
                            background: st.bg, color: st.cor,
                          }}>
                            {st.icone} {st.label}
                          </div>
                        </div>
                      </div>
                      {row.status === 'pendente' && (
                        <div style={{ marginTop: 10, fontSize: 11, color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '6px 10px', fontWeight: 600 }}>
                          ⏳ Aguardando aprovação do RH para integrar ao fechamento
                        </div>
                      )}
                      {row.status === 'aprovado' && (
                        <div style={{ marginTop: 10, fontSize: 11, color: '#15803d', background: '#dcfce7', borderRadius: 8, padding: '6px 10px', fontWeight: 600 }}>
                          ✅ Aprovado — será incluído no fechamento de ponto automaticamente
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
