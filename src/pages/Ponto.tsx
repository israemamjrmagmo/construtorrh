import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Search, ChevronLeft, ChevronRight, CheckCircle2, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ColabSimples {
  id: string
  nome: string
  chapa: string | null
  salario: number | null
  obra_id: string | null
  funcao_nome: string
}

interface ObraSimples {
  id: string
  nome: string
}

interface DiaRegistro {
  id?: string
  colaborador_id: string
  data: string
  presente: boolean
  falta: boolean
  hora_entrada:    string
  saida_almoco:    string
  retorno_almoco:  string
  hora_saida:      string
  he_entrada:      string
  he_saida:        string
  justificativa:   string
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function toMin(t: string): number | null {
  if (!t || !t.includes(':')) return null
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function diffMin(a: string, b: string): number {
  const ma = toMin(a), mb = toMin(b)
  if (ma === null || mb === null) return 0
  let d = mb - ma
  if (d < 0) d += 1440
  return d
}

function fmtHHMM(min: number): string {
  if (min <= 0) return '00:00'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtDecimal(min: number): number {
  return parseFloat((min / 60).toFixed(2))
}

function calcDia(d: DiaRegistro): { normais: number; extras: number; total: number } {
  if (!d.presente || d.falta) return { normais: 0, extras: 0, total: 0 }
  let normais = 0
  if (d.hora_entrada && d.hora_saida) {
    let bruto = diffMin(d.hora_entrada, d.hora_saida)
    if (d.saida_almoco && d.retorno_almoco) bruto -= diffMin(d.saida_almoco, d.retorno_almoco)
    else if (d.saida_almoco) bruto -= 60
    normais = Math.max(0, bruto)
  }
  let extras = 0
  if (d.he_entrada && d.he_saida) extras = Math.max(0, diffMin(d.he_entrada, d.he_saida))
  return { normais, extras, total: normais + extras }
}

function diasDoMes(ano: number, mes: number): string[] {
  const dias: string[] = []
  const total = new Date(ano, mes, 0).getDate()
  for (let d = 1; d <= total; d++)
    dias.push(`${ano}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
  return dias
}

function diaSemana(data: string): string {
  return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(data + 'T12:00:00').getDay()]
}

function isFDS(data: string): boolean {
  const d = new Date(data + 'T12:00:00').getDay()
  return d === 0 || d === 6
}

function emptyDia(colaborador_id: string, data: string): DiaRegistro {
  return { colaborador_id, data, presente: false, falta: false,
    hora_entrada: '', saida_almoco: '', retorno_almoco: '', hora_saida: '',
    he_entrada: '', he_saida: '', justificativa: '' }
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Ponto() {
  const hoje = new Date()
  const [ano, setAno]   = useState(hoje.getFullYear())
  const [mes, setMes]   = useState(hoje.getMonth() + 1)
  const [busca, setBusca] = useState('')
  const [obraFiltro, setObraFiltro] = useState<string>('todas')

  const [colaboradores, setColaboradores] = useState<ColabSimples[]>([])
  const [obras, setObras]                 = useState<ObraSimples[]>([])
  const [loadingColabs, setLoadingColabs] = useState(true)

  const [colabSel, setColabSel] = useState<ColabSimples | null>(null)
  const [dias, setDias]         = useState<DiaRegistro[]>([])
  const [loadingDias, setLoadingDias] = useState(false)
  const [saving, setSaving]     = useState(false)

  // ── Carregar colaboradores e obras ────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [{ data: colsRaw, error: colErr }, { data: obsRaw }] = await Promise.all([
        supabase
          .from('colaboradores')
          .select('id, nome, chapa, salario, obra_id, funcoes(nome)')
          .order('nome'),
        supabase.from('obras').select('id, nome').order('nome'),
      ])

      if (colErr) {
        toast.error('Erro ao carregar colaboradores: ' + colErr.message)
        setLoadingColabs(false)
        return
      }

      const colabs: ColabSimples[] = (colsRaw ?? []).map((c: any) => ({
        id:        c.id,
        nome:      c.nome,
        chapa:     c.chapa ?? null,
        salario:   c.salario ?? null,
        obra_id:   c.obra_id ?? null,
        funcao_nome: c.funcoes?.nome ?? 'Sem função',
      }))

      setColaboradores(colabs)
      setObras((obsRaw ?? []) as ObraSimples[])
      setLoadingColabs(false)
    }
    load()
  }, [])

  // ── Filtro de colaboradores ───────────────────────────────────────────────
  const colabsFiltrados = useMemo(() => {
    let lista = colaboradores
    if (obraFiltro !== 'todas') lista = lista.filter(c => c.obra_id === obraFiltro)
    const q = busca.toLowerCase()
    if (q) lista = lista.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      (c.chapa ?? '').toLowerCase().includes(q) ||
      c.funcao_nome.toLowerCase().includes(q)
    )
    return lista
  }, [colaboradores, busca, obraFiltro])

  // ── Carregar registros do mês ─────────────────────────────────────────────
  const fetchDias = useCallback(async (colab: ColabSimples, a: number, m: number) => {
    setLoadingDias(true)
    const inicio = `${a}-${String(m).padStart(2,'0')}-01`
    const fim    = `${a}-${String(m).padStart(2,'0')}-${new Date(a, m, 0).getDate()}`

    const { data, error } = await supabase
      .from('registro_ponto')
      .select('*')
      .eq('colaborador_id', colab.id)
      .gte('data', inicio)
      .lte('data', fim)

    if (error) toast.error('Erro ao carregar ponto: ' + error.message)

    const mapa: Record<string, any> = {}
    ;(data ?? []).forEach((r: any) => { mapa[r.data] = r })

    setDias(diasDoMes(a, m).map(d => {
      const r = mapa[d]
      if (!r) return emptyDia(colab.id, d)
      return {
        id:             r.id,
        colaborador_id: colab.id,
        data:           d,
        presente:       !!(r.hora_entrada || r.hora_saida),
        falta:          r.falta ?? false,
        hora_entrada:   r.hora_entrada   ?? '',
        saida_almoco:   r.saida_almoco   ?? '',
        retorno_almoco: r.retorno_almoco ?? '',
        hora_saida:     r.hora_saida     ?? '',
        he_entrada:     r.he_entrada     ?? '',
        he_saida:       r.he_saida       ?? '',
        justificativa:  r.justificativa  ?? '',
      } as DiaRegistro
    }))
    setLoadingDias(false)
  }, [])

  useEffect(() => {
    if (colabSel) fetchDias(colabSel, ano, mes)
  }, [colabSel, ano, mes, fetchDias])

  // ── Atualizar campo de um dia ─────────────────────────────────────────────
  function updDia(idx: number, field: keyof DiaRegistro, value: unknown) {
    setDias(prev => prev.map((d, i) => i !== idx ? d : { ...d, [field]: value }))
  }

  function togglePresente(idx: number) {
    setDias(prev => prev.map((d, i) => {
      if (i !== idx) return d
      if (d.presente) return { ...d, presente: false, falta: false, hora_entrada: '', saida_almoco: '', retorno_almoco: '', hora_saida: '', he_entrada: '', he_saida: '' }
      return { ...d, presente: true, falta: false }
    }))
  }

  function toggleFalta(idx: number) {
    setDias(prev => prev.map((d, i) => {
      if (i !== idx) return d
      return { ...d, falta: !d.falta, presente: false }
    }))
  }

  // ── Totais do mês ─────────────────────────────────────────────────────────
  const totais = useMemo(() => {
    let normais = 0, extras = 0, faltas = 0, presentes = 0
    dias.forEach(d => {
      const c = calcDia(d)
      normais  += c.normais
      extras   += c.extras
      if (d.presente && !d.falta) presentes++
      if (d.falta) faltas++
    })
    return { normais, extras, total: normais + extras, presentes, faltas }
  }, [dias])

  // valor/hora = salário ÷ 220h
  const valorHora   = colabSel?.salario ? colabSel.salario / 220 : 0
  const valorTotal  = valorHora > 0 ? fmtDecimal(totais.total) * valorHora : 0

  // ── Salvar ────────────────────────────────────────────────────────────────
  const handleSalvar = async () => {
    if (!colabSel) return
    setSaving(true)

    const upserts = dias
      .filter(d => d.presente || d.falta || d.id)
      .map(d => {
        const c = calcDia(d)
        return {
          ...(d.id ? { id: d.id } : {}),
          colaborador_id:    d.colaborador_id,
          data:              d.data,
          hora_entrada:      d.hora_entrada   || null,
          saida_almoco:      d.saida_almoco   || null,
          retorno_almoco:    d.retorno_almoco || null,
          hora_saida:        d.hora_saida     || null,
          horas_trabalhadas: fmtDecimal(c.normais),
          horas_extras:      fmtDecimal(c.extras),
          falta:             d.falta,
          justificativa:     d.justificativa  || null,
        }
      })

    if (upserts.length === 0) { toast.info('Nenhum registro para salvar'); setSaving(false); return }

    const { error } = await supabase
      .from('registro_ponto')
      .upsert(upserts, { onConflict: 'colaborador_id,data' })

    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success('Ponto salvo!')
    fetchDias(colabSel, ano, mes)
  }

  // ── Navegação mês ─────────────────────────────────────────────────────────
  function mesAnterior() { if (mes === 1) { setAno(a => a-1); setMes(12) } else setMes(m => m-1) }
  function mesSeguinte() { if (mes === 12) { setAno(a => a+1); setMes(1) } else setMes(m => m+1) }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', overflow: 'hidden', gap: 0 }}>

      {/* ── PAINEL ESQUERDO ──────────────────────────────────────────────── */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>🕐 Controle de Ponto</div>

          {/* Filtro por obra */}
          <Select value={obraFiltro} onValueChange={setObraFiltro}>
            <SelectTrigger style={{ fontSize: 12, height: 32 }}>
              <SelectValue placeholder="Todas as obras" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Busca */}
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <Input placeholder="Buscar por nome ou chapa…" value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 26, fontSize: 12, height: 32 }} />
          </div>
        </div>

        {/* Lista de colaboradores */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingColabs ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)' }}>Carregando…</div>
          ) : colabsFiltrados.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)' }}>Nenhum colaborador encontrado</div>
          ) : colabsFiltrados.map(c => (
            <button key={c.id} onClick={() => setColabSel(c)} style={{
              width: '100%', textAlign: 'left', padding: '10px 12px',
              border: 'none', borderBottom: '1px solid var(--border)',
              background: colabSel?.id === c.id ? 'var(--primary)' : 'transparent',
              color: colabSel?.id === c.id ? '#fff' : 'var(--foreground)',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, opacity: 0.65 }}>{c.chapa ?? '—'}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nome}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{c.funcao_nome}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── PAINEL DIREITO: folha de ponto ───────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {!colabSel ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted-foreground)' }}>
            <span style={{ fontSize: 44 }}>👈</span>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Selecione um colaborador</div>
            <div style={{ fontSize: 13 }}>para lançar ou visualizar o ponto do mês</div>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{colabSel.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {colabSel.chapa && <><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{colabSel.chapa}</span> · </>}
                  {colabSel.funcao_nome}
                  {valorHora > 0 && <> · <strong>R$ {valorHora.toFixed(2)}/h</strong> <span style={{ opacity: 0.6 }}>(salário ÷ 220h)</span></>}
                </div>
              </div>

              {/* Navegação mês */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={mesAnterior} style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', padding: '4px 8px', display: 'flex' }}><ChevronLeft size={14} /></button>
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 130, textAlign: 'center' }}>{MESES[mes-1]} / {ano}</span>
                <button onClick={mesSeguinte} style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', padding: '4px 8px', display: 'flex' }}><ChevronRight size={14} /></button>
              </div>

              <Button variant="outline" size="sm" onClick={() => window.print()} style={{ gap: 5 }}><Printer size={13} /> Imprimir</Button>
              <Button size="sm" onClick={handleSalvar} disabled={saving}>{saving ? '⏳ Salvando…' : '💾 Salvar Ponto'}</Button>
            </div>

            {/* Tabela */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingDias ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted-foreground)' }}>Carregando…</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#1e3a5f', color: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
                      <th style={TH}>Dia</th>
                      <th style={TH}>Data</th>
                      <th style={{ ...TH, width: 70 }}>Presente</th>
                      <th style={{ ...TH, width: 60 }}>Falta</th>
                      <th style={TH}>Entrada</th>
                      <th style={TH}>Saída Alm.</th>
                      <th style={TH}>Ret. Alm.</th>
                      <th style={TH}>Saída</th>
                      <th style={{ ...TH, background: '#2d5a9e' }}>H.E. Entrada</th>
                      <th style={{ ...TH, background: '#2d5a9e' }}>H.E. Saída</th>
                      <th style={{ ...TH, background: '#1a4a1a' }}>Normais</th>
                      <th style={{ ...TH, background: '#2d5a1a' }}>Extras</th>
                      <th style={{ ...TH, background: '#0f3320' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dias.map((d, idx) => {
                      const fds  = isFDS(d.data)
                      const calc = calcDia(d)
                      const bg   = fds ? 'rgba(100,100,100,0.06)' : d.falta ? 'rgba(239,68,68,0.07)' : d.presente ? 'rgba(22,163,74,0.04)' : 'transparent'
                      return (
                        <tr key={d.data} style={{ borderBottom: '1px solid var(--border)', background: bg }}>
                          <td style={{ ...TD, fontWeight: 700, textAlign: 'center', color: fds ? '#9ca3af' : undefined }}>{diaSemana(d.data)}</td>
                          <td style={{ ...TD, textAlign: 'center', fontFamily: 'monospace', fontWeight: 600 }}>{d.data.slice(8)}/{d.data.slice(5,7)}</td>

                          {/* Presente */}
                          <td style={{ ...TD, textAlign: 'center' }}>
                            {fds ? <span style={{ fontSize: 10, color: '#9ca3af' }}>FDS</span> : (
                              <button onClick={() => togglePresente(idx)} title="Confirmar presença" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: d.presente ? '#16a34a' : '#9ca3af' }}>
                                {d.presente ? <CheckCircle2 size={17} /> : <span style={{ fontSize: 17, opacity: 0.35 }}>○</span>}
                              </button>
                            )}
                          </td>

                          {/* Falta */}
                          <td style={{ ...TD, textAlign: 'center' }}>
                            {!fds && (
                              <button onClick={() => toggleFalta(idx)} title="Marcar falta" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: d.falta ? '#dc2626' : '#9ca3af' }}>
                                {d.falta ? <span style={{ fontSize: 17 }}>✗</span> : <span style={{ fontSize: 17, opacity: 0.3 }}>✗</span>}
                              </button>
                            )}
                          </td>

                          <td style={TD}><TI disabled={!d.presente||d.falta} value={d.hora_entrada}    onChange={v=>updDia(idx,'hora_entrada',v)} /></td>
                          <td style={TD}><TI disabled={!d.presente||d.falta} value={d.saida_almoco}   onChange={v=>updDia(idx,'saida_almoco',v)} /></td>
                          <td style={TD}><TI disabled={!d.presente||d.falta} value={d.retorno_almoco} onChange={v=>updDia(idx,'retorno_almoco',v)} /></td>
                          <td style={TD}><TI disabled={!d.presente||d.falta} value={d.hora_saida}     onChange={v=>updDia(idx,'hora_saida',v)} /></td>
                          <td style={{ ...TD, background: 'rgba(45,90,158,0.05)' }}><TI disabled={!d.presente||d.falta} value={d.he_entrada} onChange={v=>updDia(idx,'he_entrada',v)} /></td>
                          <td style={{ ...TD, background: 'rgba(45,90,158,0.05)' }}><TI disabled={!d.presente||d.falta} value={d.he_saida}   onChange={v=>updDia(idx,'he_saida',v)} /></td>

                          <td style={{ ...TD, textAlign: 'center', fontWeight: 600, color: calc.normais>0?'#15803d':'#9ca3af', background: 'rgba(22,163,74,0.05)' }}>{calc.normais>0?fmtHHMM(calc.normais):'—'}</td>
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 600, color: calc.extras>0?'#1d4ed8':'#9ca3af', background: 'rgba(45,90,158,0.05)' }}>{calc.extras>0?fmtHHMM(calc.extras):'—'}</td>
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: calc.total>0?'var(--foreground)':'#9ca3af', background: 'rgba(0,0,0,0.03)' }}>{calc.total>0?fmtHHMM(calc.total):'—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '10px 14px', fontSize: 12 }}>
                        TOTAIS — {totais.presentes} dia{totais.presentes!==1?'s':''} trabalhado{totais.presentes!==1?'s':''}
                        {totais.faltas>0 && <span style={{ color:'#fca5a5', marginLeft:8 }}>· {totais.faltas} falta{totais.faltas!==1?'s':''}</span>}
                      </td>
                      <td colSpan={6} style={{ padding:'10px 14px', textAlign:'right', fontSize:11, opacity:0.7 }}>
                        {valorHora>0 && <>Valor/hora: R$ {valorHora.toFixed(2)}</>}
                      </td>
                      <td style={{ padding:'10px 8px', textAlign:'center', background:'rgba(22,163,74,0.3)', fontSize:13 }}>{fmtHHMM(totais.normais)}</td>
                      <td style={{ padding:'10px 8px', textAlign:'center', background:'rgba(45,90,158,0.4)', fontSize:13 }}>{fmtHHMM(totais.extras)}</td>
                      <td style={{ padding:'10px 8px', textAlign:'center', background:'rgba(0,0,0,0.2)', fontSize:13 }}>{fmtHHMM(totais.total)}</td>
                    </tr>
                    <tr style={{ background: '#0f2d4a', color: '#fff' }}>
                      <td colSpan={10} style={{ padding:'10px 14px', fontSize:12 }}>
                        {fmtDecimal(totais.normais)}h normais + {fmtDecimal(totais.extras)}h extras = <strong>{fmtDecimal(totais.total)}h total</strong>
                      </td>
                      <td colSpan={3} style={{ padding:'10px 14px', textAlign:'right', fontSize:14 }}>
                        {valorHora>0 ? (
                          <span>💰 <strong>{formatCurrency(valorTotal)}</strong> <span style={{fontSize:10,opacity:0.6}}>estimado</span></span>
                        ) : (
                          <span style={{fontSize:11,opacity:0.6}}>Cadastre o salário do colaborador para ver o total</span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '8px 6px', fontWeight: 700, fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  textAlign: 'center', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '3px 4px' }

function TI({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <input type="time" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{
        width: 78, padding: '3px 4px', fontSize: 12,
        border: '1px solid var(--border)', borderRadius: 4,
        background: disabled ? 'transparent' : 'var(--background)',
        color: disabled ? '#9ca3af' : 'var(--foreground)',
        fontFamily: 'monospace', textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'text', outline: 'none',
      }}
    />
  )
}
