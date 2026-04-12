/**
 * MapaChuva — Mapa Pluviométrico Radial (Estação Climática)
 *
 * SVG circular com 31 posições (dias) × 3 anéis (MANHÃ / TARDE / NOITE)
 *
 * Cores:
 *  🟢 Verde   (#22c55e) — Seco produtível       (sem chuva, impacto nenhum/pequeno)
 *  🟡 Amarelo (#eab308) — Seco improdutível      (sem chuva, impacto moderado/grande)
 *  🔵 Azul    (#3b82f6) — Chuva produtível       (choveu, impacto nenhum/pequeno/moderado)
 *  🔴 Vermelho(#ef4444) — Chuva c/ paralisação   (choveu, impacto grande/paralisacao)
 *  ⬜ Cinza   (#e2e8f0) — Sem registro
 *
 * Regra de períodos:
 *  - 1 lançamento no dia → replica mesma cor nos 3 anéis
 *  - 2 lançamentos → 1º=manhã, 2º=tarde; noite replica tarde
 *  - 3 lançamentos → 1º=manhã, 2º=tarde, 3º=noite
 */

import React, { useRef, useCallback } from 'react'
import { Download } from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ClimaItem {
  data: string          // 'YYYY-MM-DD'
  periodo: 'manha' | 'tarde' | 'noite'
  choveu: boolean
  impacto_obra: string  // 'nenhum' | 'pequeno' | 'moderado' | 'grande' | 'paralisacao'
}

interface Props {
  /** Array de registros climáticos do mês atual */
  registros: ClimaItem[]
  /** Título opcional (exibido no centro do mapa) */
  titulo?: string
  /** Mês de referência no formato 'YYYY-MM'. Se omitido usa o mês atual. */
  mesRef?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Cor = 'verde' | 'amarelo' | 'azul' | 'vermelho' | 'branco'

const COR_HEX: Record<Cor, string> = {
  verde:    '#22c55e',
  amarelo:  '#eab308',
  azul:     '#3b82f6',
  vermelho: '#ef4444',
  branco:   '#e2e8f0',
}

function calcularCor(choveu: boolean, impacto: string): Cor {
  if (!choveu) {
    if (impacto === 'nenhum' || impacto === 'pequeno') return 'verde'
    return 'amarelo'
  }
  if (impacto === 'grande' || impacto === 'paralisacao') return 'vermelho'
  return 'azul'
}

/**
 * Para um dia com N lançamentos, retorna as cores dos 3 anéis (manhã, tarde, noite).
 * Regra:
 *  N=0 → branco, branco, branco
 *  N=1 → cor1, cor1, cor1
 *  N=2 → cor1, cor2, cor2
 *  N=3 → cor1, cor2, cor3
 */
function coresDia(lancamentos: ClimaItem[]): [Cor, Cor, Cor] {
  const sorted = [...lancamentos].sort((a, b) => {
    const order = { manha: 0, tarde: 1, noite: 2 }
    return order[a.periodo] - order[b.periodo]
  })

  if (sorted.length === 0) return ['branco', 'branco', 'branco']

  const c = (i: number): Cor => {
    const item = sorted[Math.min(i, sorted.length - 1)]
    return calcularCor(item.choveu, item.impacto_obra)
  }

  return [c(0), c(1), c(2)]
}

// ─── Geometria SVG ───────────────────────────────────────────────────────────

const SVG_SIZE  = 400
const CX        = SVG_SIZE / 2   // 200
const CY        = SVG_SIZE / 2   // 200
const DAYS      = 31
const GAP_DEG   = 1              // gap em graus entre fatias

// Raios dos 3 anéis (do centro para fora: manhã → tarde → noite)
const RINGS = [
  { inner: 55,  outer: 90  },  // manhã   (anel interno)
  { inner: 93,  outer: 128 },  // tarde   (anel médio)
  { inner: 131, outer: 166 },  // noite   (anel externo)
]

function polarToXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function arcPath(startDeg: number, endDeg: number, inner: number, outer: number): string {
  const s1 = polarToXY(startDeg, outer)
  const e1 = polarToXY(endDeg, outer)
  const s2 = polarToXY(endDeg, inner)
  const e2 = polarToXY(startDeg, inner)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${s1.x} ${s1.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${e1.x} ${e1.y}`,
    `L ${s2.x} ${s2.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${e2.x} ${e2.y}`,
    'Z',
  ].join(' ')
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function MapaChuva({ registros, titulo, mesRef }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Determinar o mês de referência
  const hoje = new Date()
  const anoMes = mesRef ?? `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const [ano, mes] = anoMes.split('-').map(Number)
  const diasNoMes = new Date(ano, mes, 0).getDate() // dias reais do mês

  // Agrupar registros por dia
  const byDay = new Map<number, ClimaItem[]>()
  for (const r of registros) {
    if (!r.data.startsWith(anoMes)) continue
    const day = parseInt(r.data.slice(8, 10), 10)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(r)
  }

  // Contadores para legenda
  const contadores: Record<Cor, number> = { verde: 0, amarelo: 0, azul: 0, vermelho: 0, branco: 0 }
  for (let d = 1; d <= DAYS; d++) {
    const cols = coresDia(byDay.get(d) ?? [])
    // Conta a cor "dominante" do dia (usando o anel manhã como referência)
    contadores[cols[0]]++
  }

  // Construir fatias SVG
  const sliceAngle = 360 / DAYS
  const fatias: JSX.Element[] = []

  for (let d = 1; d <= DAYS; d++) {
    const cols = coresDia(byDay.get(d) ?? [])
    const startDeg = (d - 1) * sliceAngle + GAP_DEG / 2
    const endDeg   = d * sliceAngle - GAP_DEG / 2
    const isFuture = d > diasNoMes

    RINGS.forEach((ring, ri) => {
      const cor = isFuture ? 'branco' : cols[ri]
      const opacity = isFuture ? 0.35 : 1
      fatias.push(
        <path
          key={`d${d}-r${ri}`}
          d={arcPath(startDeg, endDeg, ring.inner, ring.outer)}
          fill={COR_HEX[cor]}
          opacity={opacity}
          stroke="#fff"
          strokeWidth={0.5}
        />
      )
    })

    // Número do dia (só exibe a cada 5 dias ou dia 1)
    if (d === 1 || d % 5 === 0) {
      const midDeg = (startDeg + endDeg) / 2
      const pos = polarToXY(midDeg, RINGS[2].outer + 12)
      fatias.push(
        <text
          key={`lbl${d}`}
          x={pos.x}
          y={pos.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fontWeight={600}
          fill="#64748b"
        >
          {d}
        </text>
      )
    }
  }

  // Rótulos dos anéis (no lado direito do SVG)
  const ringLabels = [
    { ring: RINGS[0], label: 'MANHÃ' },
    { ring: RINGS[1], label: 'TARDE' },
    { ring: RINGS[2], label: 'NOITE' },
  ]

  // ─── Download PNG ─────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const scale = 2 // 2× para alta resolução
    canvas.width = SVG_SIZE * scale
    canvas.height = SVG_SIZE * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(scale, scale)
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, SVG_SIZE, SVG_SIZE)
      ctx.drawImage(img, 0, 0, SVG_SIZE, SVG_SIZE)
      const link = document.createElement('a')
      link.download = `mapa-chuva-${anoMes}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }, [anoMes])

  const mesNome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>🗺️ Mapa Pluviométrico</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, textTransform: 'capitalize' }}>
            {titulo ? `${titulo} — ` : ''}{mesNome}
          </div>
        </div>
        <button
          onClick={handleDownload}
          title="Baixar mapa como PNG"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 9, border: '1px solid #e2e8f0',
            background: '#f8fafc', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#374151',
          }}
        >
          <Download size={14} />
          Baixar PNG
        </button>
      </div>

      {/* SVG */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg
          ref={svgRef}
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          style={{ maxWidth: '100%', height: 'auto' }}
          xmlns="http://www.w3.org/2000/svg"
          fontFamily="system-ui, sans-serif"
        >
          {/* Fundo branco para exportação PNG */}
          <rect width={SVG_SIZE} height={SVG_SIZE} fill="#fff" />

          {/* Fatias */}
          {fatias}

          {/* Rótulos dos anéis */}
          {ringLabels.map(({ ring, label }) => {
            const midR = (ring.inner + ring.outer) / 2
            const pos = polarToXY(0, midR) // topo (0°)
            return (
              <text
                key={label}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={6.5}
                fontWeight={700}
                fill="#fff"
                style={{ pointerEvents: 'none' }}
              >
                {label}
              </text>
            )
          })}

          {/* Centro: título e mês */}
          <circle cx={CX} cy={CY} r={52} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} />
          <text x={CX} y={CY - 10} textAnchor="middle" fontSize={10} fontWeight={800} fill="#0f172a">
            🌦️
          </text>
          <text x={CX} y={CY + 5} textAnchor="middle" fontSize={7.5} fontWeight={800} fill="#0f172a">
            CHUVA
          </text>
          <text x={CX} y={CY + 16} textAnchor="middle" fontSize={6.5} fontWeight={600} fill="#64748b">
            {new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase()}
          </text>
        </svg>
      </div>

      {/* Legenda */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {[
          { cor: 'verde'    as Cor, emoji: '🟢', label: 'Seco Produtível',       count: contadores.verde    },
          { cor: 'amarelo'  as Cor, emoji: '🟡', label: 'Seco Improdutível',     count: contadores.amarelo  },
          { cor: 'azul'     as Cor, emoji: '🔵', label: 'Chuva Produtível',      count: contadores.azul     },
          { cor: 'vermelho' as Cor, emoji: '🔴', label: 'Chuva c/ Paralisação',  count: contadores.vermelho },
          { cor: 'branco'   as Cor, emoji: '⬜', label: 'Sem Registro',          count: contadores.branco   },
        ].map(item => (
          <div
            key={item.cor}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 8,
              background: item.cor === 'branco' ? '#f8fafc' : `${COR_HEX[item.cor]}18`,
              border: `1px solid ${item.cor === 'branco' ? '#e2e8f0' : `${COR_HEX[item.cor]}44`}`,
            }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              background: COR_HEX[item.cor],
              border: item.cor === 'branco' ? '1px solid #cbd5e1' : 'none',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{item.label}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 20, textAlign: 'right' }}>
              {item.count}
            </div>
          </div>
        ))}
      </div>

      {/* Legenda dos anéis */}
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 16 }}>
        {[
          { label: 'Anel interno = MANHÃ', color: '#94a3b8' },
          { label: 'Anel médio = TARDE',   color: '#64748b' },
          { label: 'Anel externo = NOITE', color: '#334155' },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: r.color }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${r.color}` }} />
            {r.label}
          </div>
        ))}
      </div>
    </div>
  )
}
