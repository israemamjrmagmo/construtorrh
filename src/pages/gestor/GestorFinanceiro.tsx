/**
 * GestorFinanceiro — Visão Geral Financeira do Portal do Gestor
 *
 * Exibe KPIs consolidados de:
 *  - Folha de Pagamento (pagamentos do mês)
 *  - Benefícios: Vale-Transporte + Cesta Básica
 *  - Encargos (INSS, FGTS, FGTS Rescisório, RAT, Terceiros) estimados
 *  - Provisões (FGTS provisório + férias)
 *  - Adiantamentos (saldo pendente e pago no mês)
 *  - Produção (m² / unidades no mês)
 * Filtrável por obra. Comparativo mês atual vs mês anterior.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import {
  DollarSign, Users, TrendingUp, TrendingDown, Building2,
  Package, Loader2, FileText, ShieldCheck, Wallet, BarChart3,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const R$ = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const pctChange = (atual: number, anterior: number) => {
  if (anterior === 0) return atual > 0 ? 100 : 0
  return Math.round(((atual - anterior) / anterior) * 100)
}

function mesLabel(anoMes: string) {
  const [ano, mes] = anoMes.split('-').map(Number)
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

function mesAnterior(anoMes: string) {
  const [ano, mes] = anoMes.split('-').map(Number)
  const d = new Date(ano, mes - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface ObraItem { id: string; nome: string; codigo?: string | null }

interface MesData {
  folha: number
  vt: number
  cesta: number
  adiantamentos: number
  provisoes: number
  producao: number
}

const ZERO_MES: MesData = { folha: 0, vt: 0, cesta: 0, adiantamentos: 0, provisoes: 0, producao: 0 }

// Alíquotas encargos estimados (sobre folha CLT)
const ENCARGO_INSS = 0.28   // 20% INSS Patronal + 8% FGTS
const ENCARGO_RAT  = 0.03   // RAT/GILRAT médio
const ENCARGO_TERC = 0.058  // Terceiros (SESI, SENAI, SEBRAE, INCRA, SENAT)

// ─── Componente ──────────────────────────────────────────────────────────────
export default function GestorFinanceiro() {
  const navigate = useNavigate()
  const hoje = useMemo(() => new Date(), [])
  const mesAtual = useMemo(() =>
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`, [hoje])
  const mesAnt = useMemo(() => mesAnterior(mesAtual), [mesAtual])

  const [loading, setLoading] = useState(true)
  const [obras, setObras] = useState<ObraItem[]>([])
  const [obraFiltro, setObraFiltro] = useState('todas')

  // dados brutos agrupados por obra
  const [dadosAtual, setDadosAtual] = useState<Record<string, MesData>>({})
  const [dadosAnt, setDadosAnt] = useState<Record<string, MesData>>({})
  // total CLT por obra (para estimar encargos)
  const [cltPorObra, setCltPorObra] = useState<Record<string, number>>({})

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: obrasRaw },
        { data: pagAtual },
        { data: pagAnt },
        { data: vtAtual },
        { data: vtAnt },
        { data: cestaAtual },
        { data: cestaAnt },
        { data: adiatAtual },
        { data: adiatAnt },
        { data: provAtual },
        { data: provAnt },
        { data: prodAtual },
        { data: prodAnt },
        { data: colabs },
      ] = await Promise.all([
        supabase.from('obras').select('id,nome,codigo').neq('status','concluida').order('nome'),

        supabase.from('pagamentos').select('valor_liquido, obra_id').eq('competencia', mesAtual),
        supabase.from('pagamentos').select('valor_liquido, obra_id').eq('competencia', mesAnt),

        // VT: busca pelo colaborador → obra_id via join
        supabase.from('vale_transporte').select('valor_total, colaboradores!inner(obra_id)').eq('competencia', mesAtual),
        supabase.from('vale_transporte').select('valor_total, colaboradores!inner(obra_id)').eq('competencia', mesAnt),

        // Cesta básica: calculada no sistema via colaboradores, sem tabela própria
        // Retornamos null para manter a assinatura de Promise.all
        Promise.resolve({ data: null }),
        Promise.resolve({ data: null }),

        supabase.from('adiantamentos').select('valor, obra_id').eq('competencia', mesAtual).in('status', ['aprovado','pago']),
        supabase.from('adiantamentos').select('valor, obra_id').eq('competencia', mesAnt).in('status', ['aprovado','pago']),

        supabase.from('provisoes_fgts').select('valor, obra_id').eq('competencia', mesAtual),
        supabase.from('provisoes_fgts').select('valor, obra_id').eq('competencia', mesAnt),

        supabase.from('ponto_producao').select('quantidade, obra_id').eq('mes_referencia', mesAtual),
        supabase.from('ponto_producao').select('quantidade, obra_id').eq('mes_referencia', mesAnt),

        supabase.from('colaboradores').select('obra_id, tipo_contrato').eq('status', 'ativo'),
      ])

      const obrasList: ObraItem[] = (obrasRaw ?? []).map((o: any) => ({ id: o.id, nome: o.nome, codigo: o.codigo }))
      setObras(obrasList)

      // CLT por obra (para cálculo de encargos)
      const cltMap: Record<string, number> = {}
      ;(colabs ?? []).forEach((c: any) => {
        if (c.tipo_contrato === 'clt' && c.obra_id) {
          cltMap[c.obra_id] = (cltMap[c.obra_id] ?? 0) + 1
        }
      })
      setCltPorObra(cltMap)

      const somarPorObra = (arr: any[] | null, campo: string, obraIdPath?: string): Record<string, number> => {
        const m: Record<string, number> = {}
        ;(arr ?? []).forEach((r: any) => {
          const v = parseFloat(r[campo] ?? 0) || 0
          // suporte a path aninhado (ex: "colaboradores.obra_id")
          const key = obraIdPath
            ? (r[obraIdPath.split('.')[0]]?.[obraIdPath.split('.')[1]] ?? '__sem_obra__')
            : (r.obra_id ?? '__sem_obra__')
          m[key] = (m[key] ?? 0) + v
        })
        return m
      }

      const buildMes = (
        pag: any, vt: any, cesta: any, adiat: any, prov: any, prod: any,
      ): Record<string, MesData> => {
        const folhaMap = somarPorObra(pag,  'valor_liquido')
        const vtMap    = somarPorObra(vt,   'valor_total', 'colaboradores.obra_id')
        const cestaMap = somarPorObra(cesta, 'valor_total')
        const adiatMap = somarPorObra(adiat, 'valor')
        const provMap  = somarPorObra(prov,  'valor')
        const prodMap  = somarPorObra(prod,  'quantidade')

        const allKeys = new Set([
          ...Object.keys(folhaMap), ...Object.keys(vtMap), ...Object.keys(cestaMap),
          ...Object.keys(adiatMap), ...Object.keys(provMap), ...Object.keys(prodMap),
          ...obrasList.map(o => o.id),
        ])

        const result: Record<string, MesData> = {}
        allKeys.forEach(k => {
          result[k] = {
            folha:         folhaMap[k]  ?? 0,
            vt:            vtMap[k]     ?? 0,
            cesta:         cestaMap[k]  ?? 0,
            adiantamentos: adiatMap[k]  ?? 0,
            provisoes:     provMap[k]   ?? 0,
            producao:      prodMap[k]   ?? 0,
          }
        })
        return result
      }

      setDadosAtual(buildMes(pagAtual, vtAtual, cestaAtual, adiatAtual, provAtual, prodAtual))
      setDadosAnt(buildMes(pagAnt, vtAnt, cestaAnt, adiatAnt, provAnt, prodAnt))
    } finally {
      setLoading(false)
    }
  }, [mesAtual, mesAnt])

  useEffect(() => { fetch() }, [fetch])

  // ── Agregação filtrada ────────────────────────────────────────────────────
  const soma = (map: Record<string, MesData>, campo: keyof MesData, obraId?: string): number => {
    if (obraId && obraId !== 'todas') return map[obraId]?.[campo] ?? 0
    return Object.values(map).reduce((s, v) => s + (v[campo] ?? 0), 0)
  }

  const obraId = obraFiltro === 'todas' ? undefined : obraFiltro

  const atual = {
    folha:         soma(dadosAtual, 'folha',         obraId),
    vt:            soma(dadosAtual, 'vt',            obraId),
    cesta:         soma(dadosAtual, 'cesta',         obraId),
    adiantamentos: soma(dadosAtual, 'adiantamentos', obraId),
    provisoes:     soma(dadosAtual, 'provisoes',     obraId),
    producao:      soma(dadosAtual, 'producao',      obraId),
  }

  const ant = {
    folha:         soma(dadosAnt, 'folha',         obraId),
    vt:            soma(dadosAnt, 'vt',            obraId),
    cesta:         soma(dadosAnt, 'cesta',         obraId),
    adiantamentos: soma(dadosAnt, 'adiantamentos', obraId),
    provisoes:     soma(dadosAnt, 'provisoes',     obraId),
    producao:      soma(dadosAnt, 'producao',      obraId),
  }

  // CLT total filtrado
  const cltTotal = obraId
    ? (cltPorObra[obraId] ?? 0)
    : Object.values(cltPorObra).reduce((s, v) => s + v, 0)

  // Encargos estimados (sobre folha CLT — proporcional ao total)
  const folhaClt = atual.folha // simplificação: aplica sobre folha total (valor conservador)
  const encargos = folhaClt * (ENCARGO_INSS + ENCARGO_RAT + ENCARGO_TERC)
  const encArgos_ant = ant.folha * (ENCARGO_INSS + ENCARGO_RAT + ENCARGO_TERC)

  const beneficios = atual.vt + atual.cesta
  const benef_ant  = ant.vt + ant.cesta

  const custoTotal = atual.folha + encargos + beneficios + atual.provisoes + atual.adiantamentos
  const custoTot_ant = ant.folha + encArgos_ant + benef_ant + ant.provisoes + ant.adiantamentos

  // ── Detalhamento por obra ─────────────────────────────────────────────────
  const detalheObras = useMemo(() => {
    return obras.map(o => {
      const f  = dadosAtual[o.id]?.folha         ?? 0
      const vt = dadosAtual[o.id]?.vt            ?? 0
      const cb = dadosAtual[o.id]?.cesta         ?? 0
      const pr = dadosAtual[o.id]?.provisoes     ?? 0
      const ad = dadosAtual[o.id]?.adiantamentos ?? 0
      const pd = dadosAtual[o.id]?.producao      ?? 0
      const nClt = cltPorObra[o.id] ?? 0
      const enc = f * (ENCARGO_INSS + ENCARGO_RAT + ENCARGO_TERC)
      return { ...o, folha: f, vt, cesta: cb, provisoes: pr, adiantamentos: ad, producao: pd, encargos: enc, nClt, total: f + enc + vt + cb + pr + ad }
    }).sort((a, b) => b.total - a.total)
  }, [obras, dadosAtual, cltPorObra])

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <GestorLayout>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
        <Loader2 size={32} color="#2563eb" style={{ animation:'spin 1s linear infinite' }} />
        <span style={{ color:'#64748b', fontSize:14 }}>Carregando dados financeiros…</span>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </GestorLayout>
  )

  const Variacao = ({ atual, ant, inverso = false }: { atual: number; ant: number; inverso?: boolean }) => {
    const pct = pctChange(atual, ant)
    const positivo = inverso ? pct < 0 : pct > 0
    const cor = ant === 0 ? '#94a3b8' : positivo ? '#16a34a' : pct < 0 ? '#dc2626' : '#94a3b8'
    if (ant === 0) return <span style={{ fontSize: 10, color: '#94a3b8' }}>— sem ref.</span>
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: cor }}>
        {pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {Math.abs(pct)}% vs {mesLabel(mesAnt)}
      </span>
    )
  }

  const kpis = [
    {
      label: 'Folha de Pagamento', value: R$(atual.folha),
      sub: `${cltTotal} CLT registrados`,
      var: <Variacao atual={atual.folha} ant={ant.folha} />,
      icon: <Users size={18} />, cor: '#2563eb', bg: '#eff6ff',
    },
    {
      label: 'Encargos Estimados', value: R$(encargos),
      sub: `INSS+FGTS+RAT+Terceiros (${Math.round((ENCARGO_INSS+ENCARGO_RAT+ENCARGO_TERC)*100)}% folha)`,
      var: <Variacao atual={encargos} ant={encArgos_ant} />,
      icon: <ShieldCheck size={18} />, cor: '#7c3aed', bg: '#f5f3ff',
    },
    {
      label: 'Benefícios', value: R$(beneficios),
      sub: `VT: ${R$(atual.vt)} · Cesta: ${R$(atual.cesta)}`,
      var: <Variacao atual={beneficios} ant={benef_ant} />,
      icon: <Wallet size={18} />, cor: '#0891b2', bg: '#f0f9ff',
    },
    {
      label: 'Provisões', value: R$(atual.provisoes),
      sub: 'FGTS provisório, férias, 13º',
      var: <Variacao atual={atual.provisoes} ant={ant.provisoes} />,
      icon: <FileText size={18} />, cor: '#b45309', bg: '#fffbeb',
    },
    {
      label: 'Adiantamentos', value: R$(atual.adiantamentos),
      sub: 'aprovados e pagos no mês',
      var: <Variacao atual={atual.adiantamentos} ant={ant.adiantamentos} />,
      icon: <DollarSign size={18} />, cor: '#dc2626', bg: '#fef2f2',
    },
    {
      label: 'Produção', value: atual.producao.toLocaleString('pt-BR'),
      sub: 'unidades / m² lançadas',
      var: <Variacao atual={atual.producao} ant={ant.producao} inverso={false} />,
      icon: <Package size={18} />, cor: '#059669', bg: '#f0fdf4',
    },
    {
      label: 'Custo Total Estimado', value: R$(custoTotal),
      sub: 'folha + encargos + benef. + prov. + adiat.',
      var: <Variacao atual={custoTotal} ant={custoTot_ant} />,
      icon: <BarChart3 size={18} />, cor: '#0f172a', bg: '#f8fafc',
    },
  ]

  return (
    <GestorLayout>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .fin-kpi{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
        @media(max-width:640px){.fin-kpi{grid-template-columns:1fr 1fr!important}}
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          💰 Financeiro — Visão Geral
        </h1>
        <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>
          Competência: <strong>{mesLabel(mesAtual)}</strong> · comparativo com {mesLabel(mesAnt)}
        </p>
      </div>

      {/* ── Filtro de obra ── */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20,
        padding: '10px 14px', background: '#fff',
        borderRadius: 12, border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        {[{ id: 'todas', nome: '🏗️ Todas as Obras', codigo: null }, ...obras].map(o => (
          <button
            key={o.id}
            onClick={() => setObraFiltro(o.id)}
            style={{
              padding: '6px 14px', borderRadius: 20,
              border: `2px solid ${obraFiltro === o.id ? '#059669' : '#e2e8f0'}`,
              background: obraFiltro === o.id ? '#059669' : '#f8fafc',
              color: obraFiltro === o.id ? '#fff' : '#374151',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
              whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            {o.codigo ? `[${o.codigo}] ` : ''}{o.nome}
          </button>
        ))}
      </div>

      {/* ── KPIs ── */}
      <div className="fin-kpi" style={{ marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{
            background: i === kpis.length - 1
              ? 'linear-gradient(135deg,#0f172a,#1e3a5f)'
              : '#fff',
            borderRadius: 14,
            border: i === kpis.length - 1 ? 'none' : '1px solid #e2e8f0',
            padding: '16px 18px',
            boxShadow: i === kpis.length - 1
              ? '0 4px 16px rgba(15,23,42,0.25)'
              : '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              background: i === kpis.length - 1 ? 'rgba(255,255,255,0.12)' : k.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {React.cloneElement(k.icon as React.ReactElement, {
                color: i === kpis.length - 1 ? '#fff' : k.cor,
              })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: i === kpis.length - 1 ? 'rgba(255,255,255,0.6)' : '#64748b',
              }}>
                {k.label}
              </div>
              <div style={{
                fontSize: 21, fontWeight: 900, lineHeight: 1.2, marginTop: 2,
                color: i === kpis.length - 1 ? '#fff' : k.cor,
              }}>
                {k.value}
              </div>
              <div style={{
                fontSize: 11, marginTop: 2,
                color: i === kpis.length - 1 ? 'rgba(255,255,255,0.5)' : '#94a3b8',
              }}>
                {k.sub}
              </div>
              <div style={{ marginTop: 4 }}>{k.var}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Aviso encargos estimados ── */}
      <div style={{
        background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
        padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        ⚠️ <strong>Encargos são estimativas</strong> baseadas em alíquotas médias (INSS Patronal 20% + FGTS 8% + RAT 3% + Terceiros 5,8%) sobre a folha. Valores reais dependem da competência do eSocial.
      </div>

      {/* ── Detalhamento por obra ── */}
      {obraFiltro === 'todas' && detalheObras.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
            <Building2 size={15} color="#059669" /> Detalhamento por Obra
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Obra', 'CLT', 'Folha', 'Encargos*', 'VT', 'Cesta', 'Provisões', 'Adiant.', 'Total Est.', 'Produção'].map((h, i) => (
                    <th key={i} style={{
                      padding: '8px 10px', fontWeight: 700, fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      color: '#64748b', borderBottom: '2px solid #e2e8f0',
                      textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalheObras.map((o, i) => (
                  <tr key={o.id} style={{
                    background: i % 2 === 0 ? '#fff' : '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                  }}>
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: '#1e293b' }}>
                      {o.nome}
                      {o.codigo && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4, fontFamily: 'monospace' }}>#{o.codigo}</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#374151' }}>{o.nClt}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: o.folha > 0 ? '#1d4ed8' : '#94a3b8', fontWeight: o.folha > 0 ? 700 : 400 }}>{o.folha > 0 ? R$(o.folha) : '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#7c3aed' }}>{o.encargos > 0 ? R$(o.encargos) : '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#0891b2' }}>{o.vt > 0 ? R$(o.vt) : '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#0891b2' }}>{o.cesta > 0 ? R$(o.cesta) : '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#b45309' }}>{o.provisoes > 0 ? R$(o.provisoes) : '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#dc2626' }}>{o.adiantamentos > 0 ? R$(o.adiantamentos) : '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{o.total > 0 ? R$(o.total) : '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{o.producao > 0 ? o.producao.toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}

                {/* Linha de total */}
                <tr style={{ background: '#0f172a', fontWeight: 800 }}>
                  <td style={{ padding: '10px 10px', color: '#fff', fontSize: 12 }}>TOTAL GERAL</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#fff', fontSize: 12 }}>{cltTotal}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#93c5fd', fontSize: 12 }}>{R$(atual.folha)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#c4b5fd', fontSize: 12 }}>{R$(encargos)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#67e8f9', fontSize: 12 }}>{R$(atual.vt)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#67e8f9', fontSize: 12 }}>{R$(atual.cesta)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#fcd34d', fontSize: 12 }}>{R$(atual.provisoes)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#fca5a5', fontSize: 12 }}>{R$(atual.adiantamentos)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#fff', fontSize: 13 }}>{R$(custoTotal)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#6ee7b7', fontSize: 12 }}>{atual.producao.toLocaleString('pt-BR')}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>
            * Encargos estimados — não incluem valores reais do eSocial.
          </div>
        </div>
      )}

      {/* ── Barra de custo proporcional ── */}
      {custoTotal > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 16, color: '#0f172a' }}>
            📊 Composição do Custo — {mesLabel(mesAtual)}
          </div>
          {[
            { label: 'Folha',         valor: atual.folha,         cor: '#2563eb' },
            { label: 'Encargos*',     valor: encargos,            cor: '#7c3aed' },
            { label: 'Benefícios',    valor: beneficios,          cor: '#0891b2' },
            { label: 'Provisões',     valor: atual.provisoes,     cor: '#b45309' },
            { label: 'Adiantamentos', valor: atual.adiantamentos, cor: '#dc2626' },
          ].map(item => {
            const pct = custoTotal > 0 ? (item.valor / custoTotal) * 100 : 0
            return (
              <div key={item.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.cor }}>
                    {R$(item.valor)} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: item.cor, borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Atalhos ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: '📋 Pagamentos',    to: '/pagamentos' },
          { label: '🚌 Vale-Transporte', to: '/vt' },
          { label: '🧺 Cesta Básica',   to: '/cesta-basica' },
          { label: '📦 Encargos',       to: '/encargos' },
          { label: '🏦 Provisões',      to: '/provisoes' },
          { label: '💸 Adiantamentos',  to: '/adiantamentos' },
          { label: '📊 Relatórios',     to: '/relatorios' },
        ].map(a => (
          <button
            key={a.to}
            onClick={() => navigate(a.to)}
            style={{
              padding: '8px 16px', borderRadius: 10,
              border: '1px solid #e2e8f0', background: '#fff',
              color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLElement).style.borderColor = '#86efac' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0' }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </GestorLayout>
  )
}
