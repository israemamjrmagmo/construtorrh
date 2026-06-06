import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/Shared'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CheckCircle2, XCircle, Clock, Gift, Truck, DollarSign, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym: string) { if (!ym) return '—'; const [y,m] = ym.split('-'); return `${MESES[+m-1]} / ${y}` }

type PremioItem = {
  id: string; colaborador_nome: string; colaborador_id: string; obra_nome: string | null
  tipo: string | null; descricao: string; valor: number | null; competencia: string | null; status: string
}
type VtItem = {
  id: string; colaborador_nome: string; competencia: string; valor: number | null; status: string
}
type FechamentoItem = {
  id: string; colaborador_nome: string; obra_nome: string; mes_referencia: string; status: string; valor_total: number
}
type HoraExtraItem = {
  id: string; colaborador_nome: string; obra_nome: string; data: string; horas_extras: number; status: string
}

export default function CentralAprovacoes() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [premios, setPremios] = useState<PremioItem[]>([])
  const [vts, setVts] = useState<VtItem[]>([])
  const [fechamentos, setFechamentos] = useState<FechamentoItem[]>([])
  const [horasExtras, setHorasExtras] = useState<HoraExtraItem[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmAction, setConfirmAction] = useState<{ type: string; id: string; acao: 'aprovar' | 'reprovar' } | null>(null)
  const [filtroComp, setFiltroComp] = useState(() => {
    const hoje = new Date()
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  })

  const hoje = new Date()
  const competencias = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [premiosRes, vtsRes, fechRes] = await Promise.all([
        supabase.from('premios').select('id, colaborador_id, tipo, descricao, valor, competencia, status, colaboradores(nome), obras(nome)').eq('status', 'pendente').order('created_at', { ascending: false }),
        supabase.from('vale_transportes').select('id, colaborador_id, competencia, valor, status, colaboradores(nome)').eq('status', 'pendente').order('created_at', { ascending: false }),
        supabase.from('ponto_lancamentos').select('id, colaborador_id, obra_id, mes_referencia, status, snap_valor_total, valor_total, colaboradores(nome), obras(nome)').in('status', ['pendente_fechamento', 'aguardando_aprovacao']).order('created_at', { ascending: false }),
      ])

      if (premiosRes.data) {
        setPremios(premiosRes.data.map((p: any) => ({
          id: p.id, colaborador_id: p.colaborador_id,
          colaborador_nome: p.colaboradores?.nome || '—',
          obra_nome: p.obras?.nome || null,
          tipo: p.tipo, descricao: p.descricao, valor: p.valor,
          competencia: p.competencia, status: p.status,
        })))
      }
      if (vtsRes.data) {
        setVts(vtsRes.data.map((v: any) => ({
          id: v.id, colaborador_nome: v.colaboradores?.nome || '—',
          competencia: v.competencia, valor: v.valor, status: v.status,
        })))
      }
      if (fechRes.data) {
        setFechamentos(fechRes.data.map((f: any) => ({
          id: f.id, colaborador_nome: f.colaboradores?.nome || '—',
          obra_nome: f.obras?.nome || '—', mes_referencia: f.mes_referencia,
          status: f.status, valor_total: f.snap_valor_total ?? f.valor_total ?? 0,
        })))
      }
    } catch (e) {
      toast.error('Erro ao carregar aprovações')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const executarAcao = async () => {
    if (!confirmAction) return
    const { type, id, acao } = confirmAction
    const novoStatus = acao === 'aprovar' ? 'aprovado' : 'recusado'
    const statusFech = acao === 'aprovar' ? 'aprovado' : 'recusado'
    try {
      if (type === 'premio') {
        await supabase.from('premios').update({ status: novoStatus }).eq('id', id)
        setPremios(p => p.filter(x => x.id !== id))
      } else if (type === 'vt') {
        await supabase.from('vale_transportes').update({ status: acao === 'aprovar' ? 'pago' : 'cancelado' }).eq('id', id)
        setVts(v => v.filter(x => x.id !== id))
      } else if (type === 'fechamento') {
        await supabase.from('ponto_lancamentos').update({ status: statusFech }).eq('id', id)
        setFechamentos(f => f.filter(x => x.id !== id))
      }
      toast.success(acao === 'aprovar' ? '✅ Aprovado com sucesso!' : '❌ Reprovado.')
    } catch (e) {
      toast.error('Erro ao executar ação')
    } finally {
      setConfirmAction(null)
    }
  }

  const totalPendente = premios.length + vts.length + fechamentos.length

  const BadgePendente = ({ count }: { count: number }) => count > 0 ? (
    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">{count}</span>
  ) : null

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Central de Aprovações"
        subtitle="Gerencie todos os itens pendentes de aprovação em um único lugar"
        icon={<ClipboardCheck className="w-6 h-6" />}
      />

      {totalPendente > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Atenção: {totalPendente} item(s) pendente(s) de aprovação</p>
            <p className="text-sm text-amber-700">Nenhum pagamento poderá ser liberado enquanto houver itens pendentes.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="premios" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="premios">
              <Gift className="w-4 h-4 mr-1" /> Prêmios <BadgePendente count={premios.length} />
            </TabsTrigger>
            <TabsTrigger value="vt">
              <Truck className="w-4 h-4 mr-1" /> Vale Transporte <BadgePendente count={vts.length} />
            </TabsTrigger>
            <TabsTrigger value="fechamentos">
              <ClipboardCheck className="w-4 h-4 mr-1" /> Fechamentos <BadgePendente count={fechamentos.length} />
            </TabsTrigger>
          </TabsList>

          {/* PRÊMIOS */}
          <TabsContent value="premios">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gift className="w-4 h-4" /> Prêmios Pendentes de Aprovação
                </CardTitle>
              </CardHeader>
              <CardContent>
                {premios.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
                    <p>Nenhum prêmio pendente</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Competência</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {premios.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.colaborador_nome}</TableCell>
                          <TableCell><Badge variant="outline">{p.tipo || '—'}</Badge></TableCell>
                          <TableCell className="max-w-xs truncate">{p.descricao}</TableCell>
                          <TableCell>{mesLabel(p.competencia || '')}</TableCell>
                          <TableCell className="font-semibold text-green-700">{formatCurrency(p.valor || 0)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-700 border-green-300 hover:bg-green-50"
                                onClick={() => setConfirmAction({ type: 'premio', id: p.id, acao: 'aprovar' })}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-700 border-red-300 hover:bg-red-50"
                                onClick={() => setConfirmAction({ type: 'premio', id: p.id, acao: 'reprovar' })}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Reprovar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* VALE TRANSPORTE */}
          <TabsContent value="vt">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Vale Transportes Pendentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
                    <p>Nenhum vale transporte pendente</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Competência</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vts.map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">{v.colaborador_nome}</TableCell>
                          <TableCell>{mesLabel(v.competencia)}</TableCell>
                          <TableCell className="font-semibold text-blue-700">{formatCurrency(v.valor || 0)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-700 border-green-300 hover:bg-green-50"
                                onClick={() => setConfirmAction({ type: 'vt', id: v.id, acao: 'aprovar' })}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-700 border-red-300 hover:bg-red-50"
                                onClick={() => setConfirmAction({ type: 'vt', id: v.id, acao: 'reprovar' })}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Reprovar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* FECHAMENTOS */}
          <TabsContent value="fechamentos">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" /> Fechamentos Pendentes de Aprovação
                </CardTitle>
              </CardHeader>
              <CardContent>
                {fechamentos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
                    <p>Nenhum fechamento pendente</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Obra</TableHead>
                        <TableHead>Competência</TableHead>
                        <TableHead>Status Atual</TableHead>
                        <TableHead>Valor Total</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fechamentos.map(f => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{f.colaborador_nome}</TableCell>
                          <TableCell>{f.obra_nome}</TableCell>
                          <TableCell>{mesLabel(f.mes_referencia)}</TableCell>
                          <TableCell>
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                              ⏳ Pendente de Fechamento
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold">{formatCurrency(f.valor_total)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-700 border-green-300 hover:bg-green-50"
                                onClick={() => setConfirmAction({ type: 'fechamento', id: f.id, acao: 'aprovar' })}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-700 border-red-300 hover:bg-red-50"
                                onClick={() => setConfirmAction({ type: 'fechamento', id: f.id, acao: 'reprovar' })}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Reprovar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Confirmação */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.acao === 'aprovar' ? '✅ Confirmar Aprovação' : '❌ Confirmar Reprovação'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.acao === 'aprovar'
                ? 'Tem certeza que deseja aprovar este item? Esta ação não poderá ser desfeita.'
                : 'Tem certeza que deseja reprovar este item? O registro será marcado como recusado.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executarAcao}
              className={confirmAction?.acao === 'aprovar' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {confirmAction?.acao === 'aprovar' ? 'Aprovar' : 'Reprovar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
