import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { StatCard, PageHeader, BadgeStatus, LoadingSkeleton } from '@/components/Shared'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import {
  Users, Building2, AlertTriangle, FileWarning,
  DollarSign, Gift, Clock, CheckCircle2, ChevronRight,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useNavigate } from 'react-router-dom'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObraRecente {
  id: string
  nome: string
  status: string
  data_inicio: string | null
}

interface AcidenteRecente {
  id: string
  data_ocorrencia: string | null
  tipo: string | null
  gravidade: string | null
  colaborador_nome: string | null
}

interface ColaboradoresPorObra {
  obra: string
  total: number
}

interface AdiantPendente {
  id: string
  colaborador_nome: string
  valor: number
  tipo: string
  competencia: string
}

interface PremioPendente {
  id: string
  colaborador_nome: string
  valor: number
  descricao: string
  competencia: string
}

interface DashboardData {
  totalColaboradores: number
  obrasAndamento: number
  acidentesMes: number
  atestadosMes: number
  totalFolha: number
  totalAdiantPendente: number
  totalPremioPendente: number
  qtdAdiantPendente: number
  qtdPremioPendente: number
  obrasRecentes: ObraRecente[]
  ultimosAcidentes: AcidenteRecente[]
  colabPorObra: ColaboradoresPorObra[]
  adiantPendentes: AdiantPendente[]
  premiosPendentes: PremioPendente[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

function currentCompetencia(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayPtBR(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

const TIPO_ADIANT_LABEL: Record<string, string> = {
  adiantamento: '💵 Adiantamento', vale: '🎫 Vale',
  ajuda_custo: '🚗 Ajuda de Custo', outro: '📋 Outro', outros: '📋 Outro',
}

const TIPO_PREMIO_EMOJI: Record<string, string> = {
  Produtividade: '⚡', Assiduidade: '📅', Segurança: '🦺',
  Desempenho: '🏆', 'Tempo de serviço': '⏱️', Outros: '🎁',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data,    setData]    = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true)
        const { start, end } = currentMonthRange()
        const competencia     = currentCompetencia()

        const [
          colaboradoresRes,
          obrasRes,
          acidentesRes,
          atestadosRes,
          folhaRes,
          obrasRecentesRes,
          ultimosAcidentesRes,
          colabPorObraRes,
          adiantPendRes,
          premiosPendRes,
        ] = await Promise.all([
          // 1. Colaboradores ativos
          supabase.from('colaboradores').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
          // 2. Obras em andamento
          supabase.from('obras').select('id', { count: 'exact', head: true }).eq('status', 'em_andamento'),
          // 3. Acidentes do mês
          supabase.from('acidentes').select('id', { count: 'exact', head: true }).gte('data_ocorrencia', start).lte('data_ocorrencia', end),
          // 4. Atestados do mês
          supabase.from('atestados').select('id', { count: 'exact', head: true }).gte('data', start).lte('data', end),
          // 5. Total folha do mês
          supabase.from('pagamentos').select('valor_liquido').eq('competencia', competencia),
          // 6. 5 obras mais recentes
          supabase.from('obras').select('id, nome, status, data_inicio').order('created_at', { ascending: false }).limit(5),
          // 7. 5 últimos acidentes
          supabase.from('acidentes').select('id, data_ocorrencia, tipo, gravidade, colaboradores(nome)').order('data_ocorrencia', { ascending: false }).limit(5),
          // 8. Colaboradores por obra (top 5)
          supabase.from('colaboradores').select('obras(nome)').eq('status', 'ativo').not('obra_id', 'is', null),
          // 9. Adiantamentos pendentes do mês atual
          supabase.from('adiantamentos').select('id, valor, tipo, competencia, colaboradores(nome)').eq('status', 'pendente').eq('competencia', competencia).order('created_at', { ascending: false }).limit(8),
          // 10. Prêmios pendentes do mês atual
          supabase.from('premios').select('id, valor, tipo, descricao, competencia, colaboradores(nome)').eq('competencia', competencia).order('data', { ascending: false }).limit(8),
        ])

        // Soma de folha
        const totalFolha = (folhaRes.data ?? []).reduce(
          (acc: number, p: { valor_liquido: number | null }) => acc + (p.valor_liquido ?? 0), 0
        )

        // Colaboradores por obra — agrupamento client-side
        const obraCount: Record<string, number> = {}
        ;(colabPorObraRes.data ?? []).forEach((c: { obras: { nome: string }[] | { nome: string } | null }) => {
          const obraObj = Array.isArray(c.obras) ? c.obras[0] : c.obras
          const nome = obraObj?.nome ?? 'Sem obra'
          obraCount[nome] = (obraCount[nome] ?? 0) + 1
        })
        const colabPorObra: ColaboradoresPorObra[] = Object.entries(obraCount)
          .sort((a, b) => b[1] - a[1])
          .map(([obra, total]) => ({ obra, total }))

        // Últimos acidentes — flatten join
        const ultimosAcidentes: AcidenteRecente[] = (ultimosAcidentesRes.data ?? []).map(
          (a: { id: string; data_ocorrencia: string | null; tipo: string | null; gravidade: string | null; colaboradores: { nome: string }[] | { nome: string } | null }) => ({
            id: a.id,
            data_ocorrencia: a.data_ocorrencia,
            tipo: a.tipo,
            gravidade: a.gravidade,
            colaborador_nome: (Array.isArray(a.colaboradores) ? a.colaboradores[0]?.nome : (a.colaboradores as { nome: string } | null)?.nome) ?? null,
          })
        )

        // Adiantamentos pendentes
        const adiantPendentes: AdiantPendente[] = (adiantPendRes.data ?? []).map((r: any) => ({
          id: r.id,
          colaborador_nome: (Array.isArray(r.colaboradores) ? r.colaboradores[0]?.nome : r.colaboradores?.nome) ?? '—',
          valor: r.valor ?? 0,
          tipo: r.tipo ?? 'adiantamento',
          competencia: r.competencia ?? '',
        }))

        // Prêmios pendentes (status pendente)
        const premiosPendentes: PremioPendente[] = (premiosPendRes.data ?? [])
          .filter((r: any) => (r.status ?? 'pendente') === 'pendente')
          .slice(0, 8)
          .map((r: any) => ({
            id: r.id,
            colaborador_nome: (Array.isArray(r.colaboradores) ? r.colaboradores[0]?.nome : r.colaboradores?.nome) ?? '—',
            valor: r.valor ?? 0,
            descricao: r.descricao ?? r.tipo ?? '—',
            competencia: r.competencia ?? '',
          }))

        setData({
          totalColaboradores: colaboradoresRes.count ?? 0,
          obrasAndamento:     obrasRes.count ?? 0,
          acidentesMes:       acidentesRes.count ?? 0,
          atestadosMes:       atestadosRes.count ?? 0,
          totalFolha,
          totalAdiantPendente:  adiantPendentes.reduce((s, r) => s + r.valor, 0),
          totalPremioPendente:  premiosPendentes.reduce((s, r) => s + r.valor, 0),
          qtdAdiantPendente:    adiantPendentes.length,
          qtdPremioPendente:    premiosPendentes.length,
          obrasRecentes: (obrasRecentesRes.data as ObraRecente[]) ?? [],
          ultimosAcidentes,
          colabPorObra,
          adiantPendentes,
          premiosPendentes,
        })
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  if (loading) {
    return <div className="flex flex-col gap-6 p-6"><LoadingSkeleton /></div>
  }

  if (error) {
    return <div className="p-6"><p className="text-destructive text-sm">Erro: {error}</p></div>
  }

  const d = data!

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* ── Header ── */}
      <PageHeader title="Dashboard" subtitle={todayPtBR()} />

      {/* ── Stat cards principais ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard title="Colaboradores" value={d.totalColaboradores} subtitle="ativos"
          color="bg-blue-600" icon={<Users className="w-5 h-5 text-white" />} />
        <StatCard title="Obras" value={d.obrasAndamento} subtitle="em andamento"
          color="bg-orange-500" icon={<Building2 className="w-5 h-5 text-white" />} />
        <StatCard title="Acidentes" value={d.acidentesMes} subtitle="este mês"
          color="bg-red-600" icon={<AlertTriangle className="w-5 h-5 text-white" />} />
        <StatCard title="Atestados" value={d.atestadosMes} subtitle="este mês"
          color="bg-yellow-500" icon={<FileWarning className="w-5 h-5 text-white" />} />
        <StatCard title="Folha do mês" value={formatCurrency(d.totalFolha)} subtitle="total líquido"
          color="bg-emerald-600" icon={<DollarSign className="w-5 h-5 text-white" />} />
      </div>

      {/* ── Cards financeiros pendentes ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Adiantamentos pendentes */}
        <div style={{ background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 12, overflow: 'hidden' }}>
          {/* cabeçalho */}
          <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#f59e0b', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={17} style={{ color: '#fff' }} />
              </span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#92400e' }}>⏳ Adiantamentos Pendentes</div>
                <div style={{ fontSize: 11, color: '#b45309' }}>Aguardando aprovação · mês atual</div>
              </div>
            </div>
            <button onClick={() => navigate('/adiantamentos')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#b45309', background: 'transparent', border: '1.5px solid #fde68a', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>
              Ver todos <ChevronRight size={13} />
            </button>
          </div>

          {/* resumo valores */}
          <div style={{ padding: '10px 18px', display: 'flex', gap: 20, borderBottom: '1px solid #fde68a', background: 'rgba(255,255,255,.5)' }}>
            <div>
              <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>Total pendente</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#92400e' }}>{formatCurrency(d.totalAdiantPendente)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>Lançamentos</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#92400e' }}>{d.qtdAdiantPendente}</div>
            </div>
          </div>

          {/* lista */}
          {d.adiantPendentes.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: '#b45309', opacity: .6, fontSize: 13 }}>
              ✅ Nenhum adiantamento pendente
            </div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {d.adiantPendentes.map((r, i) => (
                <div key={r.id}
                  style={{ padding: '9px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < d.adiantPendentes.length - 1 ? '1px solid #fde68a' : 'none', background: i % 2 === 0 ? 'rgba(255,255,255,.4)' : 'transparent' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#92400e' }}>{r.colaborador_nome}</div>
                    <div style={{ fontSize: 11, color: '#b45309' }}>{TIPO_ADIANT_LABEL[r.tipo] ?? r.tipo}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#92400e' }}>{formatCurrency(r.valor)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prêmios pendentes */}
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, overflow: 'hidden' }}>
          {/* cabeçalho */}
          <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#f59e0b', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Gift size={17} style={{ color: '#fff' }} />
              </span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#92400e' }}>🏆 Prêmios Pendentes</div>
                <div style={{ fontSize: 11, color: '#b45309' }}>Aguardando aprovação · mês atual</div>
              </div>
            </div>
            <button onClick={() => navigate('/premios')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#b45309', background: 'transparent', border: '1.5px solid #fde68a', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>
              Ver todos <ChevronRight size={13} />
            </button>
          </div>

          {/* resumo valores */}
          <div style={{ padding: '10px 18px', display: 'flex', gap: 20, borderBottom: '1px solid #fde68a', background: 'rgba(255,255,255,.5)' }}>
            <div>
              <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>Total pendente</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#92400e' }}>{formatCurrency(d.totalPremioPendente)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>Prêmios</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#92400e' }}>{d.qtdPremioPendente}</div>
            </div>
          </div>

          {/* lista */}
          {d.premiosPendentes.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: '#b45309', opacity: .6, fontSize: 13 }}>
              ✅ Nenhum prêmio pendente
            </div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {d.premiosPendentes.map((r, i) => (
                <div key={r.id}
                  style={{ padding: '9px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < d.premiosPendentes.length - 1 ? '1px solid #fde68a' : 'none', background: i % 2 === 0 ? 'rgba(255,255,255,.4)' : 'transparent' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#92400e' }}>{r.colaborador_nome}</div>
                    <div style={{ fontSize: 11, color: '#b45309', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}
                      title={r.descricao}>{r.descricao}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#92400e' }}>{formatCurrency(r.valor)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Gráfico + Obras recentes ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Gráfico colaboradores por obra */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">👷 Colaboradores Ativos por Obra</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {d.colabPorObra.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum dado disponível</p>
            ) : (() => {
              const CORES = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#14b8a6','#f97316']
              return (
                <ResponsiveContainer width="100%" height={Math.max(180, d.colabPorObra.length * 46)}>
                  <BarChart layout="vertical" data={d.colabPorObra} margin={{ top: 4, right: 40, left: 8, bottom: 4 }} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="obra" width={130}
                      tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false}
                      tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                    <Tooltip isAnimationActive={false} cursor={{ fill: 'transparent' }}
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => [`${value} colaborador(es)`, 'Total']} />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={28} isAnimationActive={false}>
                      {d.colabPorObra.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            })()}
          </CardContent>
        </Card>

        {/* Obras recentes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Obras Recentes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {d.obrasRecentes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma obra cadastrada</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.obrasRecentes.map(obra => (
                  <li key={obra.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium text-foreground truncate">{obra.nome}</span>
                      {obra.data_inicio && (
                        <span className="text-xs text-muted-foreground">Início: {formatDate(obra.data_inicio)}</span>
                      )}
                    </div>
                    <BadgeStatus status={obra.status} className="flex-shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Alertas financeiros do mês ── */}
      {(d.qtdAdiantPendente > 0 || d.qtdPremioPendente > 0) && (
        <div style={{ background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 10, padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>⚠️ Pendências financeiras este mês:</span>
          {d.qtdAdiantPendente > 0 && (
            <button onClick={() => navigate('/adiantamentos')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Clock size={13} />
              {d.qtdAdiantPendente} adiantamento(s) — {formatCurrency(d.totalAdiantPendente)}
              <ChevronRight size={13} />
            </button>
          )}
          {d.qtdPremioPendente > 0 && (
            <button onClick={() => navigate('/premios')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Gift size={13} />
              {d.qtdPremioPendente} prêmio(s) — {formatCurrency(d.totalPremioPendente)}
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* ── Últimos acidentes ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Últimos Acidentes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {d.ultimosAcidentes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum acidente registrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Data</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Colaborador</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Tipo</th>
                    <th className="text-left py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Gravidade</th>
                  </tr>
                </thead>
                <tbody>
                  {d.ultimosAcidentes.map(ac => (
                    <tr key={ac.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">{formatDate(ac.data_ocorrencia)}</td>
                      <td className="py-2.5 pr-4 font-medium text-foreground">{ac.colaborador_nome ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{ac.tipo ?? '—'}</td>
                      <td className="py-2.5">
                        {ac.gravidade ? <BadgeStatus status={ac.gravidade} /> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
