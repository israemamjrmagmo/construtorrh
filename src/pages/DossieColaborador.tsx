import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatCPF } from '@/lib/utils'
import { PageHeader } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  User, Briefcase, Clock, DollarSign, FileText,
  AlertTriangle, Trophy, Truck, Calendar, TrendingUp, Building2,
  ChevronRight, History, Search
} from 'lucide-react'
import { toast } from 'sonner'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const fmtData = (d: string | null) => { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}` }
const fmtMes = (ym: string | null) => { if (!ym) return '—'; const [y,m] = ym.split('-'); return `${MESES[+m-1]}/${y}` }

type ColaboradorByCPF = {
  id: string; nome: string; cpf: string | null; telefone: string | null; email: string | null
  data_nascimento: string | null; status: string; data_admissao: string | null; data_demissao: string | null
  funcoes?: { nome: string } | null; obras?: { nome: string } | null
}

type LinhaDoTempo = {
  data: string; tipo: 'admissao' | 'demissao' | 'obra' | 'epi' | 'advertencia' | 'premio' | 'pagamento' | 'recontratacao'
  descricao: string; valor?: number | null; cor: string; icone: string
}

export default function DossieColaborador() {
  const [busca, setBusca] = useState('')
  const [colaboradores, setColaboradores] = useState<{id:string;label:string;cpf:string|null}[]>([])
  const [cpfSelecionado, setCpfSelecionado] = useState<string | null>(null)
  const [vinculos, setVinculos] = useState<ColaboradorByCPF[]>([])
  const [vinculoAtivo, setVinculoAtivo] = useState<ColaboradorByCPF | null>(null)
  const [linhaDoTempo, setLinhaDoTempo] = useState<LinhaDoTempo[]>([])
  const [pagamentos, setPagamentos] = useState<any[]>([])
  const [premios, setPremios] = useState<any[]>([])
  const [epis, setEpis] = useState<any[]>([])
  const [advertencias, setAdvertencias] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modoRelatorio, setModoRelatorio] = useState<'vinculo' | 'completo'>('vinculo')
  const [vinculoSelecionado, setVinculoSelecionado] = useState<string | null>(null)

  // Carregar lista de colaboradores para busca
  useEffect(() => {
    supabase.from('colaboradores').select('id, nome, cpf').order('nome')
      .then(({ data }) => {
        if (data) {
          // Agrupar por CPF para exibir único
          const mapCPF: Record<string, {id:string;label:string;cpf:string|null}> = {}
          data.forEach((c: any) => {
            const key = c.cpf || c.id
            if (!mapCPF[key]) {
              mapCPF[key] = { id: c.id, label: c.nome, cpf: c.cpf }
            }
          })
          setColaboradores(Object.values(mapCPF))
        }
      })
  }, [])

  const carregarDossie = useCallback(async (cpf: string) => {
    setLoading(true)
    try {
      // Carregar todos os vínculos com mesmo CPF
      const { data: vincsData } = await supabase
        .from('colaboradores')
        .select('id, nome, cpf, funcao_id, telefone, email, data_nascimento, status, data_admissao, data_demissao, obras(nome)')
        .eq('cpf', cpf)
        .order('data_admissao', { ascending: true })

      if (!vincsData || vincsData.length === 0) {
        toast.error('Nenhum colaborador encontrado com este CPF')
        setLoading(false)
        return
      }

      setVinculos(vincsData as ColaboradorByCPF[])
      const ativo = vincsData.find((v: any) => v.status === 'ativo') || vincsData[vincsData.length - 1]
      setVinculoAtivo(ativo as ColaboradorByCPF)
      setVinculoSelecionado(ativo.id)
      setCpfSelecionado(cpf)

      // Carregar dados de todos os vínculos
      const ids = vincsData.map((v: any) => v.id)

      const [pagRes, premRes, epiRes, advRes] = await Promise.all([
        supabase.from('ponto_lancamentos').select('id, colaborador_id, mes_referencia, status, snap_valor_total, valor_total, obras(nome)').in('colaborador_id', ids).in('status', ['pago', 'aprovado', 'liberado']).order('mes_referencia', { ascending: false }).limit(50),
        supabase.from('premios').select('id, colaborador_id, tipo, descricao, valor, data, competencia, status').in('colaborador_id', ids).order('data', { ascending: false }).limit(50),
        supabase.from('colaborador_epis').select('id, colaborador_id, data_entrega, status, epi_catalogo(nome, categoria), quantidade').in('colaborador_id', ids).order('data_entrega', { ascending: false }).limit(50),
        supabase.from('advertencias').select('id, colaborador_id, data_advertencia, tipo, motivo').in('colaborador_id', ids).order('data_advertencia', { ascending: false }).limit(20),
      ])

      setPagamentos(pagRes.data || [])
      setPremios(premRes.data || [])
      setEpis(epiRes.data || [])
      setAdvertencias(advRes.data || [])

      // Montar linha do tempo
      const eventos: LinhaDoTempo[] = []

      vincsData.forEach((v: any) => {
        if (v.data_admissao) {
          eventos.push({ data: v.data_admissao, tipo: 'admissao', descricao: `Admissão — ${v.obras?.nome || 'Sem obra'} — ${v.funcoes?.nome || ''}`, cor: '#16a34a', icone: '✅' })
        }
        if (v.data_demissao) {
          eventos.push({ data: v.data_demissao, tipo: 'demissao', descricao: `Desligamento — ${v.obras?.nome || ''}`, cor: '#dc2626', icone: '🔴' })
        }
      });

      (premRes.data || []).forEach((p: any) => {
        if (p.data) eventos.push({ data: p.data, tipo: 'premio', descricao: `Prêmio: ${p.tipo || p.descricao}`, valor: p.valor, cor: '#d97706', icone: '🏆' })
      });

      (advRes.data || []).forEach((a: any) => {
        if (a.data_advertencia) eventos.push({ data: a.data_advertencia, tipo: 'advertencia', descricao: `Advertência: ${a.motivo}`, cor: '#dc2626', icone: '⚠️' })
      });

      (epiRes.data || []).forEach((e: any) => {
        if (e.data_entrega) eventos.push({ data: e.data_entrega, tipo: 'epi', descricao: `EPI Entregue: ${e.epi_catalogo?.nome || ''}`, cor: '#7c3aed', icone: '🦺' })
      })

      eventos.sort((a, b) => b.data.localeCompare(a.data))
      setLinhaDoTempo(eventos)

    } catch (e) {
      toast.error('Erro ao carregar dossiê')
    } finally {
      setLoading(false)
    }
  }, [])

  // Indicadores consolidados
  const totalPago = pagamentos.reduce((s, p) => s + (p.snap_valor_total ?? p.valor_total ?? 0), 0)
  const totalPremios = premios.reduce((s, p) => s + (p.valor || 0), 0)
  const totalFaltas = 0 // seria calculado dos pontos
  const tempoTotalMeses = vinculos.reduce((s, v) => {
    if (!v.data_admissao) return s
    const inicio = new Date(v.data_admissao)
    const fim = v.data_demissao ? new Date(v.data_demissao) : new Date()
    const meses = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth())
    return s + Math.max(0, meses)
  }, 0)

  const colaboradoresOptions = colaboradores.map(c => ({ value: c.cpf || c.id, label: `${c.label}${c.cpf ? ` — ${c.cpf}` : ''}` }))

  const pessoa = vinculos.length > 0 ? vinculos[0] : null

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dossiê do Colaborador"
        subtitle="Prontuário digital completo — histórico de vínculos, pagamentos, EPIs e documentos"
        icon={<User className="w-6 h-6" />}
      />

      {/* Busca */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Buscar colaborador por nome ou CPF</label>
              <SearchableSelect
                options={colaboradoresOptions}
                value={cpfSelecionado || ''}
                onChange={(v) => { if (v) carregarDossie(v) }}
                placeholder="Selecione um colaborador..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!loading && pessoa && (
        <>
          {/* Dados da Pessoa */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-4 h-4" /> Dados do Colaborador
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><p className="text-xs text-gray-500 uppercase font-semibold">Nome</p><p className="font-semibold">{pessoa.nome}</p></div>
                <div><p className="text-xs text-gray-500 uppercase font-semibold">CPF</p><p className="font-semibold">{pessoa.cpf ? formatCPF(pessoa.cpf) : '—'}</p></div>
                <div><p className="text-xs text-gray-500 uppercase font-semibold">Telefone</p><p>{pessoa.telefone || '—'}</p></div>
                <div><p className="text-xs text-gray-500 uppercase font-semibold">E-mail</p><p>{pessoa.email || '—'}</p></div>
              </div>
            </CardContent>
          </Card>

          {/* Indicadores */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="text-center p-4">
              <p className="text-2xl font-bold text-blue-600">{vinculos.length}</p>
              <p className="text-xs text-gray-500 mt-1">Vínculos</p>
            </Card>
            <Card className="text-center p-4">
              <p className="text-2xl font-bold text-green-600">{tempoTotalMeses}m</p>
              <p className="text-xs text-gray-500 mt-1">Tempo Total</p>
            </Card>
            <Card className="text-center p-4">
              <p className="text-2xl font-bold text-emerald-600 text-sm">{formatCurrency(totalPago)}</p>
              <p className="text-xs text-gray-500 mt-1">Total Recebido</p>
            </Card>
            <Card className="text-center p-4">
              <p className="text-2xl font-bold text-amber-600 text-sm">{formatCurrency(totalPremios)}</p>
              <p className="text-xs text-gray-500 mt-1">Prêmios</p>
            </Card>
            <Card className="text-center p-4">
              <p className="text-2xl font-bold text-purple-600">{epis.length}</p>
              <p className="text-xs text-gray-500 mt-1">EPIs Entregues</p>
            </Card>
          </div>

          <Tabs defaultValue="vinculos">
            <TabsList className="mb-4">
              <TabsTrigger value="vinculos"><Briefcase className="w-4 h-4 mr-1" /> Vínculos</TabsTrigger>
              <TabsTrigger value="timeline"><History className="w-4 h-4 mr-1" /> Linha do Tempo</TabsTrigger>
              <TabsTrigger value="pagamentos"><DollarSign className="w-4 h-4 mr-1" /> Pagamentos</TabsTrigger>
              <TabsTrigger value="premios"><Trophy className="w-4 h-4 mr-1" /> Prêmios</TabsTrigger>
              <TabsTrigger value="advertencias"><AlertTriangle className="w-4 h-4 mr-1" /> Advertências</TabsTrigger>
            </TabsList>

            {/* VÍNCULOS */}
            <TabsContent value="vinculos">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {vinculos.map((v, i) => (
                      <div
                        key={v.id}
                        className={`border rounded-xl p-4 ${v.status === 'ativo' ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-900">Vínculo {String(i + 1).padStart(2, '0')}</h3>
                          <Badge className={v.status === 'ativo' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-100 text-gray-700 border-gray-300'}>
                            {v.status === 'ativo' ? '✅ Ativo' : '⭕ Encerrado'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div><p className="text-xs text-gray-500">Admissão</p><p className="font-medium">{fmtData(v.data_admissao)}</p></div>
                          <div><p className="text-xs text-gray-500">Desligamento</p><p className="font-medium">{fmtData(v.data_demissao)}</p></div>
                          <div><p className="text-xs text-gray-500">Função</p><p className="font-medium">{v.funcoes?.nome || '—'}</p></div>
                          <div><p className="text-xs text-gray-500">Obra</p><p className="font-medium">{v.obras?.nome || '—'}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* LINHA DO TEMPO */}
            <TabsContent value="timeline">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">📅 Linha do Tempo do Colaborador</CardTitle>
                </CardHeader>
                <CardContent>
                  {linhaDoTempo.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Nenhum evento registrado</p>
                  ) : (
                    <div className="relative ml-4">
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200" />
                      <div className="space-y-4">
                        {linhaDoTempo.map((evt, i) => (
                          <div key={i} className="relative pl-8">
                            <div
                              className="absolute left-[-7px] top-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-xs"
                              style={{ backgroundColor: evt.cor }}
                            >
                              <span style={{ fontSize: 9 }}>{evt.icone}</span>
                            </div>
                            <div className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
                              <p className="text-xs text-gray-500 font-medium">{fmtData(evt.data)}</p>
                              <p className="text-sm font-semibold text-gray-800 mt-0.5">{evt.descricao}</p>
                              {evt.valor != null && (
                                <p className="text-sm text-green-700 font-semibold">{formatCurrency(evt.valor)}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* PAGAMENTOS */}
            <TabsContent value="pagamentos">
              <Card>
                <CardContent className="pt-6">
                  {pagamentos.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhum pagamento encontrado</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Competência</TableHead>
                          <TableHead>Obra</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagamentos.map((p: any) => (
                          <TableRow key={p.id}>
                            <TableCell>{fmtMes(p.mes_referencia)}</TableCell>
                            <TableCell>{p.obras?.nome || '—'}</TableCell>
                            <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(p.snap_valor_total ?? p.valor_total ?? 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* PRÊMIOS */}
            <TabsContent value="premios">
              <Card>
                <CardContent className="pt-6">
                  {premios.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhum prêmio</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {premios.map((p: any) => (
                          <TableRow key={p.id}>
                            <TableCell>{fmtData(p.data)}</TableCell>
                            <TableCell><Badge variant="outline">{p.tipo || '—'}</Badge></TableCell>
                            <TableCell className="max-w-xs truncate">{p.descricao || '—'}</TableCell>
                            <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                            <TableCell className="text-right font-semibold text-green-700">
                              {formatCurrency(p.valor || 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ADVERTÊNCIAS */}
            <TabsContent value="advertencias">
              <Card>
                <CardContent className="pt-6">
                  {advertencias.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhuma advertência registrada</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {advertencias.map((a: any) => (
                          <TableRow key={a.id}>
                            <TableCell>{fmtData(a.data_advertencia)}</TableCell>
                            <TableCell><Badge variant="outline">{a.tipo}</Badge></TableCell>
                            <TableCell className="max-w-sm truncate">{a.motivo}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
