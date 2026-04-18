import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Users, Plus, Pencil, Trash2, Search, Building2,
  CheckCircle2, XCircle, Award, HardHat,
  ChevronRight, DollarSign, Trophy, RefreshCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useProfile } from '@/hooks/useProfile'
import { traduzirErro } from '@/lib/erros'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Obra        { id: string; nome: string }
interface Colaborador { id: string; nome: string; chapa: string | null }

interface ObraVinculo {
  id: string
  obra_id: string
  colaborador_id: string
  funcao: 'encarregado' | 'cabo'
  ativo: boolean
  colaboradores?: { nome: string; chapa: string | null }
}

/** Linha de produção de um profissional (portal_producao) */
interface ProducaoItem {
  id: string
  colaborador_id: string
  obra_id: string | null
  playbook_item_id: string | null
  quantidade: number
  data: string
  colaboradores?: { nome: string; chapa: string | null }
  playbook_itens?: { descricao: string; unidade: string; categoria: string | null }
}

/** Preço de uma atividade na obra — contém valor_premiacao_enc/cabo */
interface PlaybookPreco {
  id: string
  atividade_id: string
  obra_id: string
  preco_unitario: number
  valor_premiacao_enc: number | null
  valor_premiacao_cabo: number | null
  playbook_atividades?: { descricao: string; unidade: string; categoria: string | null }
}

/** Linha de comissão calculada/lançada */
interface ComissaoRow {
  id: string
  obra_id: string | null
  colaborador_id: string       // quem recebe (enc ou cabo)
  funcao: 'encarregado' | 'cabo'
  descricao: string | null
  quantidade_total: number
  valor_unitario_premiacao: number
  valor_bruto: number
  num_cabos: number            // divisor se cabo
  valor_final: number
  competencia: string
  status: string
  premio_id: string | null
  observacoes: string | null
  data_geracao: string
  obras?: { nome: string } | null
  colaboradores?: { nome: string; chapa: string | null }
}

type Aba = 'vinculos' | 'calculo'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MESES[+m - 1]} / ${y}`
}

const STATUS_COR: Record<string, { bg: string; border: string; cor: string; label: string }> = {
  pendente:  { bg: '#fef3c7', border: '#fde68a', cor: '#b45309', label: '⏳ Pendente'  },
  aprovado:  { bg: '#dcfce7', border: '#bbf7d0', cor: '#15803d', label: '✅ Aprovado'  },
  cancelado: { bg: '#fee2e2', border: '#fecaca', cor: '#dc2626', label: '❌ Cancelado' },
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function ComissaoEquipe() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()
  const [aba, setAba] = useState<Aba>('vinculos')

  // ─── Dados base ────────────────────────────────────────────────────────────
  const [obras,         setObras]         = useState<Obra[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [vinculos,      setVinculos]      = useState<ObraVinculo[]>([])
  const [precos,        setPrecos]        = useState<PlaybookPreco[]>([])
  const [producoes,     setProducoes]     = useState<ProducaoItem[]>([])
  const [comissoes,     setComissoes]     = useState<ComissaoRow[]>([])
  const [loading,       setLoading]       = useState(true)

  // ─── Filtros ───────────────────────────────────────────────────────────────
  const [competencia,   setCompetencia]   = useState(new Date().toISOString().slice(0, 7))
  const [filtroObra,    setFiltroObra]    = useState('todas')
  const [filtroStatus,  setFiltroStatus]  = useState('todos')
  const [busca,         setBusca]         = useState('')

  // ─── Modais ────────────────────────────────────────────────────────────────
  const [aprovarCom,  setAprovarCom]  = useState<ComissaoRow | null>(null)
  const [cancelarCom, setCancelarCom] = useState<ComissaoRow | null>(null)
  const [deleteCom,   setDeleteCom]   = useState<ComissaoRow | null>(null)
  const [calculando,  setCalculando]  = useState(false)

  // ─── Detalhe de uma obra (preview de produção) ─────────────────────────────
  const [obraDetalhe, setObraDetalhe] = useState<Obra | null>(null)

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const mesInicio = `${competencia}-01`
    const mesFim    = `${competencia}-31`

    const [obrRes, colRes, vinRes, preRes, proRes, comRes] = await Promise.all([
      supabase.from('obras').select('id, nome').order('nome'),
      supabase.from('colaboradores').select('id, nome, chapa').eq('status', 'ativo').order('nome'),
      supabase.from('obra_vinculos_equipe').select('*, colaboradores(nome, chapa)').eq('ativo', true),
      supabase.from('playbook_precos').select('*, playbook_atividades(descricao, unidade, categoria)'),
      supabase.from('portal_producao')
        .select('id, colaborador_id, obra_id, playbook_item_id, quantidade, data, colaboradores(nome, chapa), playbook_itens(descricao, unidade, categoria)')
        .gte('data', mesInicio).lte('data', mesFim),
      supabase.from('comissoes_equipe_v2')
        .select('*, obras(nome), colaboradores(nome, chapa)')
        .eq('competencia', competencia)
        .order('created_at', { ascending: false }),
    ])

    setObras((obrRes.data ?? []) as Obra[])
    setColaboradores((colRes.data ?? []) as Colaborador[])
    setVinculos((vinRes.data ?? []) as ObraVinculo[])
    setPrecos((preRes.data ?? []) as PlaybookPreco[])
    setProducoes((proRes.data ?? []) as ProducaoItem[])
    setComissoes((comRes.data ?? []) as ComissaoRow[])
    setLoading(false)
  }, [competencia])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Calcular premiações para a competência selecionada ────────────────────
  // Lógica:
  //   1. Para cada obra com vínculos, agrupa produções dos profissionais vinculados
  //   2. Encarregado: qtd_total × valor_premiacao_enc da atividade
  //   3. Cabos: qtd_total × valor_premiacao_cabo ÷ nº de cabos da obra
  //   4. Gera/atualiza linha em comissoes_equipe_v2 (status: pendente)
  async function calcularComissoes() {
    if (!canCreate) return
    setCalculando(true)

    // Mapas de acesso rápido
    const precosMap = new Map<string, PlaybookPreco>() // playbook_item_id → preco
    precos.forEach(p => {
      // playbook_itens é uma tabela diferente - precosMap por obra_id+atividade_id
      precosMap.set(`${p.obra_id}::${p.atividade_id}`, p)
    })

    // Agrupar vínculos por obra
    const vinculosPorObra = new Map<string, { encarregado: ObraVinculo | null; cabos: ObraVinculo[] }>()
    vinculos.forEach(v => {
      if (!vinculosPorObra.has(v.obra_id)) vinculosPorObra.set(v.obra_id, { encarregado: null, cabos: [] })
      const obj = vinculosPorObra.get(v.obra_id)!
      if (v.funcao === 'encarregado') obj.encarregado = v
      else obj.cabos.push(v)
    })

    let gerados = 0
    let erros    = 0

    for (const [obraId, equipe] of vinculosPorObra.entries()) {
      if (!equipe.encarregado && equipe.cabos.length === 0) continue

      // Produções da obra no período — de qualquer colaborador (não só vinculados)
      // A premição é sobre TODA a produção da obra naquele mês
      const prodsObra = producoes.filter(p => p.obra_id === obraId)
      if (prodsObra.length === 0) continue

      // Agrupar por playbook_item_id → soma de quantidade
      const grupoPorItem = new Map<string, { qtd: number; item: ProducaoItem }>()
      prodsObra.forEach(p => {
        if (!p.playbook_item_id) return
        if (!grupoPorItem.has(p.playbook_item_id)) grupoPorItem.set(p.playbook_item_id, { qtd: 0, item: p })
        grupoPorItem.get(p.playbook_item_id)!.qtd += p.quantidade
      })

      // Para cada item produzido, buscar o preço na obra
      // playbook_precos.atividade_id ≠ playbook_item_id — usamos a descrição para match
      // Simplificação: buscar por playbook_item_id direto na tabela playbook_precos se existir
      // Caso contrário, tentar pelo nome do item

      // Calcular total de premiação enc e cabo por obra
      let totalPremioEnc  = 0
      let totalPremioCabo = 0
      const detalhesEnc: string[] = []
      const detalhesCabo: string[] = []

      for (const [itemId, { qtd, item }] of grupoPorItem.entries()) {
        // Buscar preco correspondente na obra
        const precoObra = precos.find(p =>
          p.obra_id === obraId &&
          p.playbook_atividades?.descricao === item.playbook_itens?.descricao
        )
        if (!precoObra) continue

        const valEnc  = (precoObra.valor_premiacao_enc  ?? 0) * qtd
        const valCabo = (precoObra.valor_premiacao_cabo ?? 0) * qtd

        if (valEnc > 0) {
          totalPremioEnc += valEnc
          detalhesEnc.push(`${item.playbook_itens?.descricao ?? itemId}: ${qtd.toLocaleString('pt-BR')} ${item.playbook_itens?.unidade ?? ''} × R$ ${precoObra.valor_premiacao_enc?.toFixed(2)} = R$ ${valEnc.toFixed(2)}`)
        }
        if (valCabo > 0) {
          totalPremioCabo += valCabo
          detalhesCabo.push(`${item.playbook_itens?.descricao ?? itemId}: ${qtd.toLocaleString('pt-BR')} ${item.playbook_itens?.unidade ?? ''} × R$ ${precoObra.valor_premiacao_cabo?.toFixed(2)} = R$ ${valCabo.toFixed(2)}`)
        }
      }

      // Inserir/atualizar linha de premiação do ENCARREGADO
      if (equipe.encarregado && totalPremioEnc > 0) {
        const payload = {
          obra_id:                obraId,
          colaborador_id:         equipe.encarregado.colaborador_id,
          funcao:                 'encarregado' as const,
          descricao:              `Premiação Encarregado – ${detalhesEnc.join(' | ')}`,
          quantidade_total:       prodsObra.reduce((s, p) => s + p.quantidade, 0),
          valor_unitario_premiacao: 0,
          valor_bruto:            totalPremioEnc,
          num_cabos:              1,
          valor_final:            totalPremioEnc,
          competencia,
          status:                 'pendente',
          data_geracao:           new Date().toISOString().slice(0, 10),
          observacoes:            detalhesEnc.join('\n'),
        }
        const { error } = await supabase.from('comissoes_equipe_v2').upsert(payload, {
          onConflict: 'obra_id,colaborador_id,funcao,competencia',
          ignoreDuplicates: false,
        })
        if (error) { console.error(error); erros++ } else gerados++
      }

      // Inserir/atualizar linha de premiação de cada CABO (valor dividido igualmente)
      if (equipe.cabos.length > 0 && totalPremioCabo > 0) {
        const numCabos = equipe.cabos.length
        const valPorCabo = totalPremioCabo / numCabos

        for (const cabo of equipe.cabos) {
          const payload = {
            obra_id:                obraId,
            colaborador_id:         cabo.colaborador_id,
            funcao:                 'cabo' as const,
            descricao:              `Premiação Cabo (${numCabos} cabo${numCabos > 1 ? 's' : ''}) – ${detalhesCabo.join(' | ')}`,
            quantidade_total:       prodsObra.reduce((s, p) => s + p.quantidade, 0),
            valor_unitario_premiacao: 0,
            valor_bruto:            totalPremioCabo,
            num_cabos:              numCabos,
            valor_final:            valPorCabo,
            competencia,
            status:                 'pendente',
            data_geracao:           new Date().toISOString().slice(0, 10),
            observacoes:            detalhesCabo.join('\n'),
          }
          const { error } = await supabase.from('comissoes_equipe_v2').upsert(payload, {
            onConflict: 'obra_id,colaborador_id,funcao,competencia',
            ignoreDuplicates: false,
          })
          if (error) { console.error(error); erros++ } else gerados++
        }
      }
    }

    setCalculando(false)
    if (erros > 0) toast.error(`${erros} erro(s) ao calcular. Verifique o console.`)
    else toast.success(`${gerados} premiação(ões) calculada(s) para ${mesLabel(competencia)}!`)
    fetchData()
  }

  // ─── Aprovar: gera Prêmio ─────────────────────────────────────────────────
  async function handleAprovar() {
    if (!aprovarCom) return
    if (aprovarCom.valor_final <= 0) {
      toast.error('Valor final é zero — revise a produção.')
      setAprovarCom(null); return
    }
    const { data: premioData, error: premioErr } = await supabase.from('premios').insert({
      colaborador_id: aprovarCom.colaborador_id,
      obra_id:        aprovarCom.obra_id,
      tipo:           'Produtividade',
      descricao:      `Premiação ${aprovarCom.funcao === 'encarregado' ? 'Encarregado' : 'Cabo'} — ${mesLabel(aprovarCom.competencia)}`,
      valor:          aprovarCom.valor_final,
      data:           new Date().toISOString().slice(0, 10),
      competencia:    aprovarCom.competencia,
      observacoes:    aprovarCom.observacoes ?? '',
      status:         'pendente',
    }).select('id').single()
    if (premioErr || !premioData) { toast.error('Erro ao criar prêmio'); return }
    await supabase.from('comissoes_equipe_v2').update({ status: 'aprovado', premio_id: premioData.id }).eq('id', aprovarCom.id)
    toast.success('Aprovado! Prêmio gerado.')
    setAprovarCom(null); fetchData()
  }

  async function handleCancelar() {
    if (!cancelarCom) return
    await supabase.from('comissoes_equipe_v2').update({ status: 'cancelado' }).eq('id', cancelarCom.id)
    toast.success('Cancelado.'); setCancelarCom(null); fetchData()
  }

  async function handleDelete() {
    if (!deleteCom) return
    await supabase.from('comissoes_equipe_v2').delete().eq('id', deleteCom.id)
    toast.success('Excluído.'); setDeleteCom(null); fetchData()
  }

  // ─── Filtros e derivados ───────────────────────────────────────────────────
  const comFiltradas = useMemo(() => {
    const q = busca.toLowerCase()
    return comissoes.filter(c =>
      (filtroObra   === 'todas' || c.obra_id === filtroObra) &&
      (filtroStatus === 'todos' || c.status === filtroStatus) &&
      (!q || (c.descricao ?? '').toLowerCase().includes(q) ||
             (c.colaboradores?.nome ?? '').toLowerCase().includes(q) ||
             (c.obras?.nome ?? '').toLowerCase().includes(q))
    )
  }, [comissoes, filtroObra, filtroStatus, busca])

  const totalFinal  = comFiltradas.reduce((s, c) => s + c.valor_final, 0)
  const totalAprov  = comFiltradas.filter(c => c.status === 'aprovado').reduce((s, c) => s + c.valor_final, 0)
  const totalPend   = comFiltradas.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor_final, 0)

  // Vínculos agrupados por obra para visualização
  const vinculosPorObra = useMemo(() => {
    const m = new Map<string, ObraVinculo[]>()
    vinculos.forEach(v => {
      if (!m.has(v.obra_id)) m.set(v.obra_id, [])
      m.get(v.obra_id)!.push(v)
    })
    return m
  }, [vinculos])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trophy size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: 0 }}>Comissão de Equipe</h1>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Premiação automática por produção — Encarregado e Cabo vinculados às obras</p>
          </div>
        </div>
        {aba === 'calculo' && (
          <Button onClick={calcularComissoes} disabled={calculando}
            style={{ gap: 6, background: '#0d3f56', color: '#fff' }}>
            <RefreshCw size={14} className={calculando ? 'animate-spin' : ''} />
            {calculando ? 'Calculando…' : `Calcular ${mesLabel(competencia)}`}
          </Button>
        )}
      </div>

      {/* ── Abas ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {([
          { id: 'vinculos', label: '🔗 Vínculos por Obra' },
          { id: 'calculo',  label: '💰 Cálculo de Premiações' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: aba === t.id ? '#fff' : 'transparent',
            color: aba === t.id ? '#0d3f56' : '#64748b',
            boxShadow: aba === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ABA: VÍNCULOS
      ══════════════════════════════════════════════════════════════════════ */}
      {aba === 'vinculos' && (
        <div>
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#0369a1' }}>
            📌 Os vínculos são gerenciados na tela <strong>Playbooks → Preços por Obra → botão "Vincular Equipe"</strong>.
            Aqui você visualiza o resumo de todas as obras e suas equipes.
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando…</div>
          ) : obras.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Nenhuma obra cadastrada.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {obras.map(obra => {
                const equipe = vinculosPorObra.get(obra.id) ?? []
                const enc    = equipe.filter(v => v.funcao === 'encarregado')
                const cabos  = equipe.filter(v => v.funcao === 'cabo')
                const prodMes = producoes.filter(p => p.obra_id === obra.id)
                const qtdProd = prodMes.reduce((s, p) => s + p.quantidade, 0)

                return (
                  <div key={obra.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
                    {/* Header da obra */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#0d3f56,#1e3a5f)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Building2 size={16} color="#fff" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{obra.nome}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {qtdProd > 0 ? `${qtdProd.toLocaleString('pt-BR')} un. produzidas em ${mesLabel(competencia)}` : 'Sem produção neste mês'}
                        </div>
                      </div>
                      {equipe.length === 0 && (
                        <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', borderRadius: 20, padding: '2px 8px' }}>Sem equipe</span>
                      )}
                    </div>

                    {/* Encarregado */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>👷 Encarregado</div>
                      {enc.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>— não vinculado —</div>
                      ) : enc.map(v => (
                        <div key={v.id} style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <HardHat size={13} color="#c2410c" />
                          {v.colaboradores?.nome ?? '—'}
                          {v.colaboradores?.chapa && <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>({v.colaboradores.chapa})</span>}
                        </div>
                      ))}
                    </div>

                    {/* Cabos */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                        🔧 Cabo{cabos.length > 1 ? 's' : ''} {cabos.length > 1 && <span style={{ color: '#64748b', fontWeight: 400 }}>(valor dividido igualmente)</span>}
                      </div>
                      {cabos.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>— não vinculado —</div>
                      ) : cabos.map(v => (
                        <div key={v.id} style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Users size={12} color="#0369a1" />
                          {v.colaboradores?.nome ?? '—'}
                          {v.colaboradores?.chapa && <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>({v.colaboradores.chapa})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ABA: CÁLCULO DE PREMIAÇÕES
      ══════════════════════════════════════════════════════════════════════ */}
      {aba === 'calculo' && (
        <div>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '6px 12px' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Competência:</span>
              <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: 13, fontWeight: 700, color: '#0d3f56', background: 'transparent' }} />
            </div>
            <Select value={filtroObra} onValueChange={setFiltroObra}>
              <SelectTrigger style={{ width: 200 }}><SelectValue placeholder="Obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as obras</SelectItem>
                {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger style={{ width: 160 }}><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pendente">⏳ Pendente</SelectItem>
                <SelectItem value="aprovado">✅ Aprovado</SelectItem>
                <SelectItem value="cancelado">❌ Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por obra, colaborador…" style={{ paddingLeft: 30 }} />
            </div>
          </div>

          {/* Cards de totais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Pendente', valor: formatCurrency(totalPend), cor: '#b45309', bg: '#fffbeb', icon: '⏳' },
              { label: 'Aprovado (→ Prêmios)', valor: formatCurrency(totalAprov), cor: '#15803d', bg: '#f0fdf4', icon: '✅' },
              { label: 'Total Competência', valor: formatCurrency(totalFinal), cor: '#0d3f56', bg: '#f0f9ff', icon: '📊' },
            ].map(card => (
              <div key={card.label} style={{ background: card.bg, border: `1px solid ${card.cor}22`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{card.icon} {card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: card.cor }}>{card.valor}</div>
              </div>
            ))}
          </div>

          {/* Instrução quando vazio */}
          {comFiltradas.length === 0 && !loading && (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <Trophy size={40} style={{ marginBottom: 12, opacity: 0.25 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Nenhuma premiação calculada para {mesLabel(competencia)}</div>
              <div style={{ fontSize: 12, marginBottom: 16 }}>
                1. Configure os valores R$ Enc. e R$ Cabo nas atividades (Playbooks → Preços por Obra)<br />
                2. Vincule o Encarregado e Cabo a cada obra<br />
                3. Clique em "Calcular {mesLabel(competencia)}" acima
              </div>
              <Button onClick={calcularComissoes} disabled={calculando} style={{ gap: 6, background: '#0d3f56', color: '#fff' }}>
                <RefreshCw size={14} className={calculando ? 'animate-spin' : ''} />
                {calculando ? 'Calculando…' : 'Calcular Agora'}
              </Button>
            </div>
          )}

          {/* Tabela */}
          {comFiltradas.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <Table>
                  <TableHeader>
                    <TableRow style={{ background: '#f8fafc' }}>
                      <TableHead>Colaborador</TableHead>
                      <TableHead style={{ textAlign: 'center' }}>Função</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead style={{ textAlign: 'right' }}>Valor Total Prod.</TableHead>
                      <TableHead style={{ textAlign: 'center' }}>Cabos</TableHead>
                      <TableHead style={{ textAlign: 'right', fontWeight: 800 }}>💰 Premiação</TableHead>
                      <TableHead style={{ textAlign: 'center' }}>Status</TableHead>
                      <TableHead style={{ textAlign: 'center' }}>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comFiltradas.map((c, idx) => {
                      const st = STATUS_COR[c.status] ?? STATUS_COR.pendente
                      return (
                        <TableRow key={c.id} style={{ background: idx % 2 === 0 ? 'transparent' : '#fafafa' }}>
                          <TableCell>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{c.colaboradores?.nome ?? '—'}</div>
                            {c.colaboradores?.chapa && <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{c.colaboradores.chapa}</div>}
                          </TableCell>
                          <TableCell style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                              background: c.funcao === 'encarregado' ? '#fff7ed' : '#f0f9ff',
                              color: c.funcao === 'encarregado' ? '#c2410c' : '#0369a1',
                              border: `1px solid ${c.funcao === 'encarregado' ? '#fed7aa' : '#bae6fd'}`,
                            }}>
                              {c.funcao === 'encarregado' ? '👷 Encarregado' : '🔧 Cabo'}
                            </span>
                          </TableCell>
                          <TableCell style={{ fontSize: 12, color: '#64748b' }}>{c.obras?.nome ?? '—'}</TableCell>
                          <TableCell style={{ textAlign: 'right', fontSize: 12 }}>{formatCurrency(c.valor_bruto)}</TableCell>
                          <TableCell style={{ textAlign: 'center', fontSize: 12 }}>
                            {c.funcao === 'cabo' && c.num_cabos > 1 ? (
                              <span style={{ background: '#f0f9ff', color: '#0369a1', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                                ÷ {c.num_cabos}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: c.valor_final > 0 ? '#15803d' : '#dc2626' }}>
                            {formatCurrency(c.valor_final)}
                          </TableCell>
                          <TableCell style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                              background: st.bg, color: st.cor, border: `1px solid ${st.border}` }}>
                              {st.label}
                            </span>
                          </TableCell>
                          <TableCell style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                              {c.status === 'pendente' && (
                                <>
                                  <Button variant="ghost" size="icon" style={{ width: 26, height: 26 }} title="Aprovar → gerar Prêmio" onClick={() => setAprovarCom(c)}>
                                    <CheckCircle2 size={12} color="#15803d" />
                                  </Button>
                                  <Button variant="ghost" size="icon" style={{ width: 26, height: 26 }} title="Cancelar" onClick={() => setCancelarCom(c)}>
                                    <XCircle size={12} color="#dc2626" />
                                  </Button>
                                </>
                              )}
                              {c.status === 'aprovado' && (
                                <span style={{ fontSize: 10, color: '#15803d' }}>✅ Prêmio gerado</span>
                              )}
                              {canDelete && c.status !== 'aprovado' && (
                                <Button variant="ghost" size="icon" style={{ width: 26, height: 26 }} title="Excluir" onClick={() => setDeleteCom(c)}>
                                  <Trash2 size={12} color="#dc2626" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Detalhe expandível — ao clicar na linha futuramente */}
              <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, color: '#64748b' }}>
                💡 Clique em ✅ para aprovar e gerar prêmio automaticamente. O valor é calculado com base na produção lançada no portal durante a competência.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Confirm Aprovar ────────────────────────────────────────────────── */}
      <AlertDialog open={!!aprovarCom} onOpenChange={o => !o && setAprovarCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar premiação?</AlertDialogTitle>
            <AlertDialogDescription>
              Será gerado um prêmio de <strong>{formatCurrency(aprovarCom?.valor_final ?? 0)}</strong> para{' '}
              <strong>{aprovarCom?.colaboradores?.nome}</strong> ({aprovarCom?.funcao}) referente a {mesLabel(aprovarCom?.competencia ?? '')}.
              <br /><br />
              <details style={{ fontSize: 12, color: '#475569' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver detalhes da produção</summary>
                <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 11 }}>{aprovarCom?.observacoes ?? '—'}</pre>
              </details>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAprovar} style={{ background: '#15803d', color: '#fff' }}>✅ Aprovar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Cancelar ───────────────────────────────────────────────── */}
      <AlertDialog open={!!cancelarCom} onOpenChange={o => !o && setCancelarCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar premiação?</AlertDialogTitle>
            <AlertDialogDescription>
              A premiação de <strong>{cancelarCom?.colaboradores?.nome}</strong> ({formatCurrency(cancelarCom?.valor_final ?? 0)}) será marcada como cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelar} style={{ background: '#dc2626', color: '#fff' }}>Cancelar Premiação</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Excluir ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteCom} onOpenChange={o => !o && setDeleteCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Recalcule quando necessário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ background: '#dc2626', color: '#fff' }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
