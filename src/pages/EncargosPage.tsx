import React, { useState, useCallback } from 'react'
import { formatCurrency } from '@/lib/utils'
import { PageHeader, LoadingSkeleton, EmptyState, SummaryCard } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Briefcase, Download, Printer } from 'lucide-react'
import { useFolhaContext } from '@/contexts/FolhaContext'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const ANOS = [2024, 2025, 2026, 2027]

// ─── Componente ───────────────────────────────────────────────────────────────

export default function EncargosPage() {
  const { mes, ano, setMes, setAno, folha } = useFolhaContext()

  const {
    linhas,
    loading,
    calculado,
    refetch,
    fgtsAliq,
    inssPatronalAliq,
    ratAliq,
    terceirosAliq,
  } = folha

  const [busca, setBusca] = useState('')

  // ── Exportar CSV ────────────────────────────────────────────────────────────
  const exportarCSV = useCallback(() => {
    if (!linhas.length) return
    const cab = [
      'Colaborador','Chapa','Função','Obra',
      'Horas','DSR','Produção','Prêmio','Bruto',
      'VT','AD','INSS','IR','Líquido',
      'FGTS (emp.)','INSS Pat. (emp.)','RAT (emp.)','Terceiros-S (emp.)','Total Emp.',
    ]
    const rows = linhas.map(l => [
      l.nome, l.chapa ?? '', l.funcao_nome, l.obra_nome,
      l.valorHoras.toFixed(2), l.valorDSR.toFixed(2),
      l.valorProducao.toFixed(2), l.valorPremio.toFixed(2),
      l.salarioBruto.toFixed(2),
      l.descontoVT.toFixed(2), l.descontoAD.toFixed(2),
      l.inss.toFixed(2), l.ir.toFixed(2), l.liquido.toFixed(2),
      l.fgts.toFixed(2), l.inssPatronal.toFixed(2),
      l.rat.toFixed(2), l.terceiros.toFixed(2), l.totalEmpresa.toFixed(2),
    ])
    const csv = [cab, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `encargos_${ano}-${String(mes).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [linhas, mes, ano])

  // ── Filtro por busca ────────────────────────────────────────────────────────
  const linhasFiltradas = React.useMemo(() => {
    if (!busca.trim()) return linhas
    const q = busca.toLowerCase()
    return linhas.filter(l =>
      l.nome.toLowerCase().includes(q) ||
      (l.chapa ?? '').toLowerCase().includes(q) ||
      l.obra_nome.toLowerCase().includes(q) ||
      l.funcao_nome.toLowerCase().includes(q)
    )
  }, [linhas, busca])

  // ── Totalizadores ───────────────────────────────────────────────────────────
  const totais = React.useMemo(() => ({
    qtd:           linhasFiltradas.length,
    salarioBruto:  linhasFiltradas.reduce((s, l) => s + l.salarioBruto,  0),
    valorHoras:    linhasFiltradas.reduce((s, l) => s + l.valorHoras,    0),
    valorDSR:      linhasFiltradas.reduce((s, l) => s + l.valorDSR,      0),
    valorProducao: linhasFiltradas.reduce((s, l) => s + l.valorProducao, 0),
    valorPremio:   linhasFiltradas.reduce((s, l) => s + l.valorPremio,   0),
    descontoVT:    linhasFiltradas.reduce((s, l) => s + l.descontoVT,    0),
    descontoAD:    linhasFiltradas.reduce((s, l) => s + l.descontoAD,    0),
    inss:          linhasFiltradas.reduce((s, l) => s + l.inss,          0),
    ir:            linhasFiltradas.reduce((s, l) => s + l.ir,            0),
    liquido:       linhasFiltradas.reduce((s, l) => s + l.liquido,       0),
    fgts:          linhasFiltradas.reduce((s, l) => s + l.fgts,          0),
    inssPatronal:  linhasFiltradas.reduce((s, l) => s + l.inssPatronal,  0),
    rat:           linhasFiltradas.reduce((s, l) => s + l.rat,           0),
    terceiros:     linhasFiltradas.reduce((s, l) => s + l.terceiros,     0),
    totalEmpresa:  linhasFiltradas.reduce((s, l) => s + l.totalEmpresa,  0),
  }), [linhasFiltradas])

  function gerarPdfEncargos() {
    if (!linhasFiltradas.length) return
    const fR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const hasTerceiros = terceirosAliq > 0
    const rows = linhasFiltradas.map((l, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td style="text-align:left;font-weight:600;white-space:nowrap;padding:4px 7px">${l.nome}<br><span style="font-size:8px;color:#666">${l.funcao_nome} · ${l.obra_nome}</span></td>
        <td style="text-align:center;color:#666;padding:4px 7px">${l.chapa ?? '—'}</td>
        <td style="text-align:right;padding:4px 7px">${fR(l.valorHoras)}</td>
        <td style="text-align:right;color:#0369a1;padding:4px 7px">${fR(l.valorDSR)}</td>
        <td style="text-align:right;color:#7c3aed;padding:4px 7px">${l.valorProducao > 0 ? fR(l.valorProducao) : '—'}</td>
        <td style="text-align:right;color:#be185d;padding:4px 7px">${l.valorPremio > 0 ? fR(l.valorPremio) : '—'}</td>
        <td style="text-align:right;font-weight:800;color:#15803d;padding:4px 7px">${fR(l.salarioBruto)}</td>
        <td style="text-align:right;color:#b45309;padding:4px 7px">${l.descontoVT > 0 ? '- '+fR(l.descontoVT) : '—'}</td>
        <td style="text-align:right;color:#0369a1;padding:4px 7px">${l.inss > 0 ? '- '+fR(l.inss) : '—'}</td>
        <td style="text-align:right;color:#dc2626;padding:4px 7px">${l.ir > 0 ? '- '+fR(l.ir) : '—'}</td>
        <td style="text-align:right;font-weight:800;color:#1e3a5f;padding:4px 7px">${fR(l.liquido)}</td>
        <td style="text-align:right;color:#15803d;padding:4px 7px">${fR(l.fgts)}</td>
        <td style="text-align:right;color:#1e3a5f;padding:4px 7px">${fR(l.inssPatronal)}</td>
        <td style="text-align:right;color:#92400e;padding:4px 7px">${fR(l.rat)}</td>
        ${hasTerceiros ? `<td style="text-align:right;color:#0369a1;padding:4px 7px">${fR(l.terceiros)}</td>` : ''}
        <td style="text-align:right;font-weight:700;color:#7c3aed;padding:4px 7px">${fR(l.totalEmpresa)}</td>
      </tr>`).join('')
    const t = totais
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Encargos — ${MESES[mes-1]}/${ano}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:9px;color:#111}
@page{size:A4 landscape;margin:8mm}@media print{body{margin:0}}
h1{font-size:14px;font-weight:800;color:#1e3a5f;margin-bottom:2px}
p.sub{font-size:8px;color:#666;margin-bottom:8px}
table{width:100%;border-collapse:collapse}
th{background:#1e3a5f;color:#fff;font-weight:700;padding:5px 7px;text-align:right;white-space:nowrap;font-size:9px}
tr{border-bottom:1px solid #e5e7eb}
tfoot td{background:#1e3a5f;color:#fff;font-weight:700;padding:5px 7px;text-align:right;white-space:nowrap}
tfoot td:first-child{text-align:left}
</style></head><body>
<h1>Encargos Trabalhistas — ${MESES[mes-1]}/${ano}</h1>
<p class="sub">INSS · IR · FGTS · Encargos Patronais · ${linhasFiltradas.length} colaboradores · Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
<table><thead><tr>
  <th style="text-align:left">Colaborador</th><th style="text-align:left">Chapa</th>
  <th>Horas</th><th>DSR</th><th>Produção</th><th>Prêmio</th><th>Bruto</th>
  <th>VT</th><th>INSS</th><th>IR</th><th>Líquido</th>
  <th>FGTS</th><th>INSS Pat.</th><th>RAT</th>
  ${hasTerceiros ? '<th>Terceiros</th>' : ''}
  <th>Total Emp.</th>
</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr>
  <td colspan="2">TOTAIS (${t.qtd} lançamentos)</td>
  <td>${fR(t.valorHoras)}</td><td>${fR(t.valorDSR)}</td><td>${fR(t.valorProducao)}</td><td>${fR(t.valorPremio)}</td>
  <td>${fR(t.salarioBruto)}</td><td>${t.descontoVT>0?'- '+fR(t.descontoVT):'—'}</td><td>${fR(t.inss)}</td><td>${fR(t.ir)}</td>
  <td>${fR(t.liquido)}</td><td>${fR(t.fgts)}</td><td>${fR(t.inssPatronal)}</td><td>${fR(t.rat)}</td>
  ${hasTerceiros ? '<td>'+fR(t.terceiros)+'</td>' : ''}
  <td>${fR(t.totalEmpresa)}</td>
</tr></tfoot>
</table>
<script>window.onload=()=>window.print()</script>
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-root">
      <PageHeader
        title="Encargos Trabalhistas"
        subtitle="INSS, IR, FGTS e encargos patronais — dados do Fechamento de Ponto"
        action={
          calculado && linhas.length > 0 ? (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="outline" size="sm" onClick={exportarCSV}>
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
              <Button variant="outline" size="sm" onClick={gerarPdfEncargos}
                style={{ borderColor:'#1a56a0', color:'#1a56a0', background:'#eff6ff' }}>
                <Printer className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div
        style={{ background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', padding: '14px 16px' }}
        className="flex flex-wrap items-end gap-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mês</span>
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ano</span>
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Busca — visível assim que há linhas */}
        {linhas.length > 0 && (
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar</span>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Colaborador, obra, função…"
              style={{
                height: 36, padding: '0 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--background)',
                color: 'var(--foreground)', fontSize: 13, width: '100%',
              }}
            />
          </div>
        )}
      </div>

      {loading && <LoadingSkeleton />}

      {/* ── Cards de resumo ─────────────────────────────────────────────────── */}
      {!loading && calculado && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <SummaryCard
              sigla="CLT"
              label="Lançamentos"
              value={String(totais.qtd)}
              sub="colaboradores CLT"
              color="#1e3a5f"
              bg="#1e3a5f"
            />
            <SummaryCard
              sigla="RS"
              label="Bruto Total"
              value={formatCurrency(totais.salarioBruto)}
              color="#15803d"
              bg="#15803d"
            />
            <SummaryCard
              sigla="IN"
              label="INSS Retido"
              value={formatCurrency(totais.inss)}
              color="#0369a1"
              bg="#0369a1"
            />
            <SummaryCard
              sigla="IR"
              label="IR Retido"
              value={formatCurrency(totais.ir)}
              color="#dc2626"
              bg="#dc2626"
            />

            <SummaryCard
              sigla="EMP"
              label="Enc. Empresa"
              value={formatCurrency(totais.totalEmpresa)}
              sub="FGTS + INSS Pat. + RAT"
              color="#7c3aed"
              bg="#7c3aed"
            />
          </div>

          {/* ── Tabela ────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Detalhamento por Colaborador</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#dbeafe', color: '#1d4ed8', fontWeight: 700, marginLeft: 8 }}>
              CLT apenas
            </span>
          </div>
          {linhasFiltradas.length === 0 ? (
            <EmptyState
              icon={<Briefcase size={32} />}
              title="Nenhum resultado"
              description={busca ? 'Nenhum colaborador encontrado para a busca.' : 'Não há lançamentos CLT aprovados no período.'}
            />
          ) : (
            <div style={{ background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <Table style={{ fontSize: 11 }}>
                <TableHeader>
                  <TableRow>
                    {[
                      { label: 'Colaborador',    tip: ''  },
                      { label: 'Chapa',          tip: ''  },
                      { label: 'Horas ³',        tip: 'Normais + extras' },
                      { label: 'DSR ³',          tip: 'Descanso Semanal' },
                      { label: 'Produção ³',     tip: 'Produtividade' },
                      { label: 'Prêmio ³',       tip: 'Bônus produtividade' },
                      { label: '💰 Bruto',       tip: 'Total bruto' },
                      { label: '🚌 - VT ¹',      tip: 'Vale transporte descontado' },
                      { label: '💳 - AD ¹',      tip: 'Adiantamento descontado' },
                      { label: '🏛️ - INSS ¹',    tip: 'INSS retido do funcionário' },
                      { label: '📋 - IR ¹',      tip: 'IR retido do funcionário' },
                      { label: '✅ Líquido',     tip: 'Valor a pagar' },
                      { label: 'FGTS ²',         tip: `${(fgtsAliq*100).toFixed(1)}% sobre horas+DSR` },
                      { label: 'INSS Pat. ²',    tip: `${(inssPatronalAliq*100).toFixed(1)}% sobre bruto` },
                      { label: 'RAT ²',          tip: `${(ratAliq*100).toFixed(1)}% sobre horas+DSR` },
                      ...(terceirosAliq > 0 ? [{ label: 'Terceiros-S ²', tip: `${(terceirosAliq*100).toFixed(1)}% sobre horas+DSR (Sistema S)` }] : []),
                      { label: 'Total Emp. ²',   tip: 'FGTS + INSS Pat. + RAT' + (terceirosAliq > 0 ? ' + Terceiros-S' : '') },
                    ].map(h => (
                      <TableHead
                        key={h.label}
                        title={h.tip}
                        style={{ background: '#1e3a5f', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11, padding: '8px 10px' }}
                      >
                        {h.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {linhasFiltradas.map((l, idx) => (
                    <TableRow key={`${l.lancamento_id}-${idx}`} style={{ background: idx % 2 === 0 ? 'var(--card)' : 'var(--muted)' }}>
                      <TableCell style={{ whiteSpace: 'nowrap', padding: '7px 10px' }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{l.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{l.funcao_nome} · {l.obra_nome}</div>
                      </TableCell>
                      <TableCell style={{ color: 'var(--muted-foreground)', padding: '7px 10px' }}>{l.chapa ?? '—'}</TableCell>
                      {/* Composição */}
                      <TableCell style={{ padding: '7px 10px' }}>{formatCurrency(l.valorHoras)}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#0369a1' }}>{formatCurrency(l.valorDSR)}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#7c3aed' }}>{l.valorProducao > 0 ? formatCurrency(l.valorProducao) : '—'}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#be185d' }}>{l.valorPremio > 0 ? formatCurrency(l.valorPremio) : '—'}</TableCell>
                      {/* Bruto */}
                      <TableCell style={{ padding: '7px 10px', fontWeight: 700, color: '#15803d' }}>{formatCurrency(l.salarioBruto)}</TableCell>
                      {/* Descontos funcionário */}
                      <TableCell style={{ padding: '7px 10px', color: '#b45309' }}>{l.descontoVT > 0 ? `- ${formatCurrency(l.descontoVT)}` : '—'}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#7c3aed' }}>{l.descontoAD > 0 ? `- ${formatCurrency(l.descontoAD)}` : '—'}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#0369a1' }}>{l.inss > 0 ? `- ${formatCurrency(l.inss)}` : '—'}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#dc2626' }}>{l.ir > 0 ? `- ${formatCurrency(l.ir)}` : '—'}</TableCell>
                      {/* Líquido */}
                      <TableCell style={{ padding: '7px 10px', fontWeight: 800, color: '#1e3a5f' }}>{formatCurrency(l.liquido)}</TableCell>
                      {/* Encargos empresa */}
                      <TableCell style={{ padding: '7px 10px', color: '#15803d' }}>{formatCurrency(l.fgts)}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#1e3a5f' }}>{formatCurrency(l.inssPatronal)}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#92400e' }}>{formatCurrency(l.rat)}</TableCell>
                      {terceirosAliq > 0 && <TableCell style={{ padding: '7px 10px', color: '#0369a1' }}>{formatCurrency(l.terceiros)}</TableCell>}
                      <TableCell style={{ padding: '7px 10px', fontWeight: 700, color: '#7c3aed' }}>{formatCurrency(l.totalEmpresa)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>

                <TableFooter>
                  <TableRow style={{ fontSize: 11 }}>
                    <TableCell colSpan={2} style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, padding: '8px 10px' }}>
                      TOTAIS ({totais.qtd} lançamentos)
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fff', padding: '8px 10px' }}>{formatCurrency(totais.valorHoras)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#93c5fd', padding: '8px 10px' }}>{formatCurrency(totais.valorDSR)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#c4b5fd', padding: '8px 10px' }}>{formatCurrency(totais.valorProducao)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#f9a8d4', padding: '8px 10px' }}>{formatCurrency(totais.valorPremio)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#86efac', fontWeight: 700, padding: '8px 10px' }}>{formatCurrency(totais.salarioBruto)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fde68a', padding: '8px 10px' }}>{totais.descontoVT > 0 ? `- ${formatCurrency(totais.descontoVT)}` : '—'}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#c4b5fd', padding: '8px 10px' }}>{totais.descontoAD > 0 ? `- ${formatCurrency(totais.descontoAD)}` : '—'}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#93c5fd', padding: '8px 10px' }}>{formatCurrency(totais.inss)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fca5a5', padding: '8px 10px' }}>{formatCurrency(totais.ir)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#86efac', fontWeight: 800, padding: '8px 10px' }}>{formatCurrency(totais.liquido)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#86efac', padding: '8px 10px' }}>{formatCurrency(totais.fgts)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#bfdbfe', padding: '8px 10px' }}>{formatCurrency(totais.inssPatronal)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fde68a', padding: '8px 10px' }}>{formatCurrency(totais.rat)}</TableCell>
                    {terceirosAliq > 0 && <TableCell style={{ background: '#1e3a5f', color: '#67e8f9', padding: '8px 10px' }}>{formatCurrency(totais.terceiros)}</TableCell>}
                    <TableCell style={{ background: '#1e3a5f', color: '#c4b5fd', fontWeight: 700, padding: '8px 10px' }}>{formatCurrency(totais.totalEmpresa)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>

              {/* Legenda */}
              <div className="flex flex-wrap gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
                <span>¹ Desconto retido do funcionário</span>
                <span>² Encargo da empresa</span>
                <span>³ Composição do salário bruto</span>
              </div>
            </div>
          )}

          {/* ── Painéis de totais ─────────────────────────────────────────────── */}
          {linhasFiltradas.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Composição do bruto */}
              <div style={{ background: 'var(--card)', borderRadius: 10, border: '2px solid #15803d', padding: '18px 20px' }}>
                <p className="text-sm font-semibold text-muted-foreground mb-3">
                  Composição do Salário Bruto
                </p>
                <div className="space-y-2">
                  {[
                    { label: 'Horas trabalhadas',   val: totais.valorHoras,    cor: '#374151' },
                    { label: 'DSR',                  val: totais.valorDSR,      cor: '#0369a1' },
                    { label: 'Produção',             val: totais.valorProducao, cor: '#7c3aed', skip: totais.valorProducao === 0 },
                    { label: 'Prêmios',              val: totais.valorPremio,   cor: '#be185d', skip: totais.valorPremio === 0 },
                  ].filter(i => !i.skip).map(i => (
                    <div key={i.label} className="flex justify-between items-center text-sm">
                      <span style={{ color: i.cor }} className="font-medium">{i.label}</span>
                      <span style={{ color: i.cor }} className="font-bold">{formatCurrency(i.val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-bold text-base" style={{ color: '#15803d' }}>Total Bruto</span>
                    <span className="font-bold text-lg" style={{ color: '#15803d' }}>{formatCurrency(totais.salarioBruto)}</span>
                  </div>
                </div>
              </div>

              {/* Descontos dos funcionários */}
              <div style={{ background: 'var(--card)', borderRadius: 10, border: '2px solid #be123c', padding: '18px 20px' }}>
                <p className="text-sm font-semibold text-muted-foreground mb-3">
                  Descontos Retidos dos Funcionários
                  <span className="text-xs ml-1 font-normal">(a recolher ao governo)</span>
                </p>
                <div className="space-y-2">
                  {totais.descontoVT > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span style={{ color: '#b45309' }} className="font-medium">🚌 Vale Transporte</span>
                      <span style={{ color: '#b45309' }} className="font-bold">- {formatCurrency(totais.descontoVT)}</span>
                    </div>
                  )}
                  {totais.descontoAD > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span style={{ color: '#7c3aed' }} className="font-medium">💳 Adiantamentos</span>
                      <span style={{ color: '#7c3aed' }} className="font-bold">- {formatCurrency(totais.descontoAD)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#0369a1' }} className="font-medium">🏛️ INSS dos funcionários</span>
                    <span style={{ color: '#0369a1' }} className="font-bold">- {formatCurrency(totais.inss)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#dc2626' }} className="font-medium">📋 IR dos funcionários</span>
                    <span style={{ color: '#dc2626' }} className="font-bold">- {formatCurrency(totais.ir)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-bold text-base" style={{ color: '#be123c' }}>Total a Recolher</span>
                    <span className="font-bold text-lg" style={{ color: '#be123c' }}>
                      {formatCurrency(totais.inss + totais.ir)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-1">
                    <span className="font-bold" style={{ color: '#1e3a5f' }}>💵 Líquido total a pagar</span>
                    <span className="font-bold" style={{ color: '#1e3a5f' }}>{formatCurrency(totais.liquido)}</span>
                  </div>
                </div>
              </div>

              {/* Encargos da empresa */}
              <div style={{ background: 'var(--card)', borderRadius: 10, border: '2px solid #7c3aed', padding: '18px 20px' }}>
                <p className="text-sm font-semibold text-muted-foreground mb-3">
                  Encargos da Empresa
                  <span className="text-xs ml-1 font-normal">(a recolher ao governo)</span>
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#15803d' }} className="font-medium">FGTS ({(fgtsAliq*100).toFixed(1)}%)</span>
                    <span style={{ color: '#15803d' }} className="font-bold">{formatCurrency(totais.fgts)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#1e3a5f' }} className="font-medium">INSS Patronal ({(inssPatronalAliq*100).toFixed(1)}%)</span>
                    <span style={{ color: '#1e3a5f' }} className="font-bold">{formatCurrency(totais.inssPatronal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#92400e' }} className="font-medium">RAT ({(ratAliq*100).toFixed(1)}%)</span>
                    <span style={{ color: '#92400e' }} className="font-bold">{formatCurrency(totais.rat)}</span>
                  </div>
                  {terceirosAliq > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span style={{ color: '#0369a1' }} className="font-medium">Terceiros — Sistema S ({(terceirosAliq*100).toFixed(1)}%)</span>
                      <span style={{ color: '#0369a1' }} className="font-bold">{formatCurrency(totais.terceiros)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-bold text-base" style={{ color: '#7c3aed' }}>Total a Recolher</span>
                    <span className="font-bold text-lg" style={{ color: '#7c3aed' }}>{formatCurrency(totais.totalEmpresa)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-1">
                    <span className="font-medium text-muted-foreground">Custo total empresa</span>
                    <span className="font-bold" style={{ color: '#dc2626' }}>
                      {formatCurrency(totais.salarioBruto + totais.totalEmpresa)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Estado vazio */}
      {!loading && linhas.length === 0 && (
        <EmptyState
          icon={<Briefcase size={32} />}
          title="Nenhum encargo encontrado"
          description="Não há lançamentos CLT aprovados para este período."
        />
      )}
    </div>
  )
}
