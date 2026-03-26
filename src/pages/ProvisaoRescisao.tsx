/*
 * ─── SQL para criar a tabela rescisoes ───────────────────────────────────────
 *
 * create table public.rescisoes (
 *   id                      uuid primary key default gen_random_uuid(),
 *   colaborador_id           uuid not null references public.colaboradores(id) on delete restrict,
 *   data_rescisao            date not null,
 *   tipo                     text not null
 *                              check (tipo in ('sem_justa_causa','com_justa_causa','pedido_demissao','acordo','aposentadoria','outros')),
 *   valor_saldo_fgts         numeric(12,2) not null default 0,
 *   valor_aviso_previo       numeric(12,2) not null default 0,
 *   valor_ferias_proporcionais numeric(12,2) not null default 0,
 *   valor_13_proporcional    numeric(12,2) not null default 0,
 *   valor_multa_fgts         numeric(12,2) not null default 0,
 *   valor_outros             numeric(12,2) not null default 0,
 *   total_rescisao           numeric(12,2) not null default 0,
 *   observacoes              text,
 *   created_at               timestamptz not null default now()
 * );
 *
 * -- Habilitar RLS (opcional, ajuste conforme suas policies)
 * alter table public.rescisoes enable row level security;
 *
 * create policy "Autenticados podem ver rescisoes"
 *   on public.rescisoes for select to authenticated using (true);
 *
 * create policy "Autenticados podem inserir rescisoes"
 *   on public.rescisoes for insert to authenticated with check (true);
 *
 * create policy "Autenticados podem excluir rescisoes"
 *   on public.rescisoes for delete to authenticated using (true);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Calculator, Plus, Trash2, Search, TrendingDown, Wallet, Users, FileText } from 'lucide-react'
import type { Colaborador } from '@/lib/supabase'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TipoRescisao =
  | 'sem_justa_causa'
  | 'com_justa_causa'
  | 'pedido_demissao'
  | 'acordo'
  | 'aposentadoria'
  | 'outros'

interface Rescisao {
  id: string
  colaborador_id: string
  data_rescisao: string
  tipo: TipoRescisao
  valor_saldo_fgts: number
  valor_aviso_previo: number
  valor_ferias_proporcionais: number
  valor_13_proporcional: number
  valor_multa_fgts: number
  valor_outros: number
  total_rescisao: number
  observacoes: string | null
  created_at: string
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
}

type FormData = {
  colaborador_id: string
  data_rescisao: string
  tipo: TipoRescisao | ''
  valor_saldo_fgts: string
  valor_aviso_previo: string
  valor_ferias_proporcionais: string
  valor_13_proporcional: string
  valor_multa_fgts: string
  valor_outros: string
  observacoes: string
}

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  data_rescisao: new Date().toISOString().slice(0, 10),
  tipo: '',
  valor_saldo_fgts: '',
  valor_aviso_previo: '',
  valor_ferias_proporcionais: '',
  valor_13_proporcional: '',
  valor_multa_fgts: '',
  valor_outros: '',
  observacoes: '',
}

const TIPO_LABELS: Record<TipoRescisao, string> = {
  sem_justa_causa: 'Sem Justa Causa',
  com_justa_causa: 'Com Justa Causa',
  pedido_demissao: 'Pedido de Demissão',
  acordo: 'Acordo (§ 484-A)',
  aposentadoria: 'Aposentadoria',
  outros: 'Outros',
}

const TIPO_COLORS: Record<TipoRescisao, string> = {
  sem_justa_causa: 'bg-red-100 text-red-800',
  com_justa_causa: 'bg-orange-100 text-orange-800',
  pedido_demissao: 'bg-blue-100 text-blue-800',
  acordo: 'bg-purple-100 text-purple-800',
  aposentadoria: 'bg-emerald-100 text-emerald-800',
  outros: 'bg-gray-100 text-gray-700',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string): number {
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex items-start gap-4 shadow-sm">
      <div className={`rounded-lg p-2 ${color ?? 'bg-primary/10 text-primary'}`}>{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ProvisaoRescisao() {
  const [rescisoes, setRescisoes] = useState<Rescisao[]>([])
  const [colaboradores, setColaboradores] = useState<Pick<Colaborador, 'id' | 'nome' | 'chapa'>[]>([])
  const [saldoAcumulado, setSaldoAcumulado] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal lançar
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Modal excluir
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Buscar dados ───────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [provRes, rescRes, colabRes] = await Promise.all([
        supabase.from('provisoes').select('total_provisao'),
        supabase
          .from('rescisoes')
          .select('*, colaboradores(nome, chapa)')
          .order('data_rescisao', { ascending: false }),
        supabase
          .from('colaboradores')
          .select('id, nome, chapa')
          .eq('ativo', true)
          .order('nome'),
      ])

      if (provRes.error) throw provRes.error
      if (rescRes.error) throw rescRes.error
      if (colabRes.error) throw colabRes.error

      const totalProv = (provRes.data ?? []).reduce(
        (acc, r) => acc + (Number(r.total_provisao) || 0),
        0,
      )
      setSaldoAcumulado(totalProv)
      setRescisoes((rescRes.data ?? []) as Rescisao[])
      setColaboradores(colabRes.data ?? [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ── Cálculos ───────────────────────────────────────────────────────────────

  const totalPago = rescisoes.reduce((acc, r) => acc + r.total_rescisao, 0)
  const saldoDisponivel = saldoAcumulado - totalPago

  const totalCalculado =
    toNum(form.valor_saldo_fgts) +
    toNum(form.valor_aviso_previo) +
    toNum(form.valor_ferias_proporcionais) +
    toNum(form.valor_13_proporcional) +
    toNum(form.valor_multa_fgts) +
    toNum(form.valor_outros)

  // ── Filtro ─────────────────────────────────────────────────────────────────

  const filtered = rescisoes.filter((r) => {
    const q = search.toLowerCase()
    if (!q) return true
    const nome = r.colaboradores?.nome?.toLowerCase() ?? ''
    const tipo = TIPO_LABELS[r.tipo]?.toLowerCase() ?? ''
    return nome.includes(q) || tipo.includes(q)
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleField(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function openModal() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.colaborador_id) return toast.warning('Selecione o colaborador')
    if (!form.data_rescisao) return toast.warning('Informe a data da rescisão')
    if (!form.tipo) return toast.warning('Selecione o tipo de rescisão')
    if (totalCalculado <= 0) return toast.warning('O total da rescisão deve ser maior que zero')

    setSaving(true)
    try {
      const payload = {
        colaborador_id: form.colaborador_id,
        data_rescisao: form.data_rescisao,
        tipo: form.tipo as TipoRescisao,
        valor_saldo_fgts: toNum(form.valor_saldo_fgts),
        valor_aviso_previo: toNum(form.valor_aviso_previo),
        valor_ferias_proporcionais: toNum(form.valor_ferias_proporcionais),
        valor_13_proporcional: toNum(form.valor_13_proporcional),
        valor_multa_fgts: toNum(form.valor_multa_fgts),
        valor_outros: toNum(form.valor_outros),
        total_rescisao: totalCalculado,
        observacoes: form.observacoes || null,
      }

      const { error } = await supabase.from('rescisoes').insert(payload)
      if (error) throw error

      toast.success('Rescisão lançada com sucesso!')
      setModalOpen(false)
      fetchAll()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('rescisoes').delete().eq('id', deleteId)
      if (error) throw error
      toast.success('Rescisão excluída')
      setDeleteId(null)
      fetchAll()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" />
            Provisão &amp; Rescisão
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saldo acumulado de provisões e controle de rescisões trabalhistas
          </p>
        </div>
        <Button onClick={openModal} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Lançar Rescisão
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Wallet className="w-5 h-5" />}
          label="Saldo Acumulado (Provisões)"
          value={loading ? '...' : formatCurrency(saldoAcumulado)}
          sub="Soma de todas as provisões lançadas"
          color="bg-blue-100 text-blue-700"
        />
        <SummaryCard
          icon={<TrendingDown className="w-5 h-5" />}
          label="Total Pago em Rescisões"
          value={loading ? '...' : formatCurrency(totalPago)}
          sub="Soma de todas as rescisões registradas"
          color="bg-red-100 text-red-700"
        />
        <SummaryCard
          icon={<Calculator className="w-5 h-5" />}
          label="Saldo Disponível"
          value={loading ? '...' : formatCurrency(saldoDisponivel)}
          sub={saldoDisponivel < 0 ? '⚠️ Saldo negativo' : 'Provisão – Rescisões'}
          color={
            !loading && saldoDisponivel < 0
              ? 'bg-orange-100 text-orange-700'
              : 'bg-emerald-100 text-emerald-700'
          }
        />
        <SummaryCard
          icon={<Users className="w-5 h-5" />}
          label="Rescisões Registradas"
          value={loading ? '...' : String(rescisoes.length)}
          sub="Total de colaboradores desligados"
          color="bg-purple-100 text-purple-700"
        />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar colaborador ou tipo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <FileText className="w-10 h-10 opacity-30" />
            <p className="text-sm">
              {search ? 'Nenhuma rescisão encontrada para a busca' : 'Nenhuma rescisão registrada'}
            </p>
            {!search && (
              <Button variant="outline" size="sm" onClick={openModal} className="gap-2">
                <Plus className="w-4 h-4" />
                Lançar primeira rescisão
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Saldo FGTS</TableHead>
                  <TableHead className="text-right">Aviso Prévio</TableHead>
                  <TableHead className="text-right">Férias Prop.</TableHead>
                  <TableHead className="text-right">13º Prop.</TableHead>
                  <TableHead className="text-right">Multa FGTS</TableHead>
                  <TableHead className="text-right">Outros</TableHead>
                  <TableHead className="text-right font-semibold">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.colaboradores?.nome ?? '—'}</div>
                      {r.colaboradores?.chapa && (
                        <div className="text-xs text-muted-foreground">
                          Chapa {r.colaboradores.chapa}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_COLORS[r.tipo]}`}
                      >
                        {TIPO_LABELS[r.tipo]}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(r.data_rescisao)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {r.valor_saldo_fgts > 0 ? formatCurrency(r.valor_saldo_fgts) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.valor_aviso_previo > 0 ? formatCurrency(r.valor_aviso_previo) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.valor_ferias_proporcionais > 0
                        ? formatCurrency(r.valor_ferias_proporcionais)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.valor_13_proporcional > 0 ? formatCurrency(r.valor_13_proporcional) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.valor_multa_fgts > 0 ? formatCurrency(r.valor_multa_fgts) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.valor_outros > 0 ? formatCurrency(r.valor_outros) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">
                      {formatCurrency(r.total_rescisao)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                        onClick={() => setDeleteId(r.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Modal: Lançar Rescisão ─────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              Lançar Rescisão
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {/* Colaborador */}
            <div className="sm:col-span-2 space-y-1">
              <Label>Colaborador *</Label>
              <Select
                value={form.colaborador_id}
                onValueChange={(v) => handleField('colaborador_id', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador…" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                      {c.chapa ? ` — Chapa ${c.chapa}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data */}
            <div className="space-y-1">
              <Label>Data da Rescisão *</Label>
              <Input
                type="date"
                value={form.data_rescisao}
                onChange={(e) => handleField('data_rescisao', e.target.value)}
              />
            </div>

            {/* Tipo */}
            <div className="space-y-1">
              <Label>Tipo de Rescisão *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => handleField('tipo', v as TipoRescisao)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABELS) as TipoRescisao[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TIPO_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Separador de componentes */}
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
                Componentes da Rescisão
              </p>
            </div>

            {/* Saldo FGTS */}
            <div className="space-y-1">
              <Label>Saldo FGTS (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.valor_saldo_fgts}
                onChange={(e) => handleField('valor_saldo_fgts', e.target.value)}
              />
            </div>

            {/* Aviso Prévio */}
            <div className="space-y-1">
              <Label>Aviso Prévio (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.valor_aviso_previo}
                onChange={(e) => handleField('valor_aviso_previo', e.target.value)}
              />
            </div>

            {/* Férias Proporcionais */}
            <div className="space-y-1">
              <Label>Férias Proporcionais (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.valor_ferias_proporcionais}
                onChange={(e) => handleField('valor_ferias_proporcionais', e.target.value)}
              />
            </div>

            {/* 13º Proporcional */}
            <div className="space-y-1">
              <Label>13º Proporcional (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.valor_13_proporcional}
                onChange={(e) => handleField('valor_13_proporcional', e.target.value)}
              />
            </div>

            {/* Multa FGTS */}
            <div className="space-y-1">
              <Label>Multa FGTS — 40% (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.valor_multa_fgts}
                onChange={(e) => handleField('valor_multa_fgts', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Aplicável em demissão sem justa causa</p>
            </div>

            {/* Outros */}
            <div className="space-y-1">
              <Label>Outros (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.valor_outros}
                onChange={(e) => handleField('valor_outros', e.target.value)}
              />
            </div>

            {/* Total calculado */}
            <div className="sm:col-span-2 rounded-lg border bg-muted/40 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total calculado</span>
              <span className="text-xl font-bold text-primary">{formatCurrency(totalCalculado)}</span>
            </div>

            {/* Observações */}
            <div className="sm:col-span-2 space-y-1">
              <Label>Observações</Label>
              <Textarea
                placeholder="Informações adicionais sobre a rescisão…"
                rows={3}
                value={form.observacoes}
                onChange={(e) => handleField('observacoes', e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Lançar Rescisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar exclusão ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rescisão?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O registro de rescisão será removido
              permanentemente e o saldo disponível será atualizado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
