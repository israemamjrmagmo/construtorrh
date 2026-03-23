import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ValeTransporte, Colaborador } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton, StatCard } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
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
import { toast } from 'sonner'
import { Bus, Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { traduzirErro } from '@/lib/erros'

// ─── tipos ───────────────────────────────────────────────────────────────────
type ColaboradorComSalario = Pick<Colaborador, 'id' | 'nome' | 'chapa' | 'salario'>

type VTRow = ValeTransporte & {
  colaboradores?: ColaboradorComSalario
}

type FormData = {
  colaborador_id: string
  competencia: string
  tipo: string
  valor: string
  dias_trabalhados: string
  desconto_colaborador: string
  valor_empresa: string
  observacoes: string
}

const TIPO_OPTIONS: { value: string; label: string }[] = [
  { value: 'cartao', label: 'Cartão' },
  { value: 'bilhete_unico', label: 'Bilhete Único' },
  { value: 'dinheiro', label: 'Dinheiro' },
]

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  competencia: new Date().toISOString().slice(0, 7),
  tipo: 'cartao',
  valor: '',
  dias_trabalhados: '22',
  desconto_colaborador: '',
  valor_empresa: '',
  observacoes: '',
}

const VT_DESCONTO_PCT = 0.06 // 6% padrão

// ─── componente ──────────────────────────────────────────────────────────────
export default function ValeTransportePage() {
  const [rows, setRows] = useState<VTRow[]>([])
  const [colaboradores, setColaboradores] = useState<ColaboradorComSalario[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const [filtroCompetencia, setFiltroCompetencia] = useState(new Date().toISOString().slice(0, 7))
  const [filtroColaborador, setFiltroColaborador] = useState('')

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<VTRow | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [vtRes, colRes] = await Promise.all([
      supabase
        .from('vale_transporte')
        .select('*, colaboradores(id,nome,chapa,salario)')
        .order('competencia', { ascending: false }),
      supabase
        .from('colaboradores')
        .select('id,nome,chapa,salario')
        .eq('status', 'ativo')
        .order('nome'),
    ])
    if (vtRes.error) toast.error('Erro ao carregar vale transporte')
    else setRows((vtRes.data as VTRow[]) ?? [])
    if (colRes.data) setColaboradores(colRes.data as ColaboradorComSalario[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── filtrar ───────────────────────────────────────────────────────────────
  const filtered = rows.filter((r) => {
    const matchComp = filtroCompetencia ? r.competencia === filtroCompetencia : true
    const matchCol = filtroColaborador
      ? r.colaboradores?.nome.toLowerCase().includes(filtroColaborador.toLowerCase())
      : true
    return matchComp && matchCol
  })

  const totalEmpresa = filtered.reduce((s, r) => s + (r.valor_empresa ?? 0), 0)

  // ─── modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(row: VTRow) {
    setEditando(row)
    setForm({
      colaborador_id: row.colaborador_id,
      competencia: row.competencia,
      tipo: row.tipo ?? 'cartao',
      valor: String(row.valor ?? ''),
      dias_trabalhados: String(row.dias_trabalhados ?? 22),
      desconto_colaborador: String(row.desconto_colaborador ?? ''),
      valor_empresa: String(row.valor_empresa ?? ''),
      observacoes: row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  function setField(key: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }

      // Se mudou colaborador, atualiza desconto 6% do salário
      if (key === 'colaborador_id') {
        const col = colaboradores.find((c) => c.id === value)
        const salario = col?.salario ?? 0
        const desconto = salario * VT_DESCONTO_PCT
        const valor = parseFloat(next.valor) || 0
        return {
          ...next,
          desconto_colaborador: desconto.toFixed(2),
          valor_empresa: Math.max(0, valor - desconto).toFixed(2),
        }
      }

      // recalcula valor_empresa ao mudar valor ou desconto
      if (key === 'valor' || key === 'desconto_colaborador') {
        const valor = parseFloat(key === 'valor' ? value : next.valor) || 0
        const desconto = parseFloat(key === 'desconto_colaborador' ? value : next.desconto_colaborador) || 0
        return { ...next, valor_empresa: Math.max(0, valor - desconto).toFixed(2) }
      }

      return next
    })
  }

  // ─── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.competencia) return toast.error('Competência obrigatória')
    setSaving(true)
    const payload = {
      colaborador_id: form.colaborador_id,
      competencia: form.competencia,
      tipo: (form.tipo as ValeTransporte['tipo']) || null,
      valor: parseFloat(form.valor) || null,
      dias_trabalhados: parseInt(form.dias_trabalhados) || 0,
      desconto_colaborador: parseFloat(form.desconto_colaborador) || null,
      valor_empresa: parseFloat(form.valor_empresa) || null,
      observacoes: form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('vale_transporte').update(payload).eq('id', editando.id)
      : await supabase.from('vale_transporte').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? 'Vale transporte atualizado!' : 'Vale transporte criado!')
    setModalOpen(false)
    fetchData()
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('vale_transporte').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Registro excluído!'); fetchData() }
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader
        title="Vale Transporte"
        subtitle="Controle de vale transporte dos colaboradores"
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo VT
          </Button>
        }
      />

      {/* Total a pagar pela empresa */}
      <div className="mb-4 w-64">
        <StatCard
          title="Total Empresa no Período"
          value={formatCurrency(totalEmpresa)}
          icon={<Bus className="w-5 h-5 text-white" />}
          color="bg-blue-500"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Competência</Label>
          <Input
            type="month"
            value={filtroCompetencia}
            onChange={(e) => setFiltroCompetencia(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar colaborador..."
            value={filtroColaborador}
            onChange={(e) => setFiltroColaborador(e.target.value)}
            className="h-8 pl-7 w-48 text-sm"
          />
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Bus className="w-8 h-8" />} title="Nenhum registro encontrado" />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Colaborador</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Dias</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">Empresa</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{row.colaboradores?.nome ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{row.colaboradores?.chapa}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{row.competencia}</TableCell>
                  <TableCell className="text-sm">
                    {TIPO_OPTIONS.find((t) => t.value === row.tipo)?.label ?? row.tipo ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm">{row.dias_trabalhados}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.valor)}</TableCell>
                  <TableCell className="text-right text-sm text-red-600">
                    {formatCurrency(row.desconto_colaborador)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold text-blue-600">
                    {formatCurrency(row.valor_empresa)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteId(row.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted font-semibold text-sm">
                <TableCell colSpan={6}>Total empresa no período</TableCell>
                <TableCell className="text-right">{formatCurrency(totalEmpresa)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Vale Transporte' : 'Novo Vale Transporte'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {/* Colaborador */}
            <div className="col-span-2">
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={(v) => setField('colaborador_id', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.chapa} — {c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Competência */}
            <div>
              <Label>Competência *</Label>
              <Input
                type="month"
                value={form.competencia}
                onChange={(e) => setField('competencia', e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Tipo */}
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setField('tipo', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Valor */}
            <div>
              <Label>Valor Total *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setField('valor', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>

            {/* Dias trabalhados */}
            <div>
              <Label>Dias Trabalhados</Label>
              <Input
                type="number"
                value={form.dias_trabalhados}
                onChange={(e) => setField('dias_trabalhados', e.target.value)}
                className="mt-1"
                placeholder="22"
              />
            </div>

            {/* Desconto colaborador (6% do salário) */}
            <div>
              <Label>Desconto Colaborador (6%)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.desconto_colaborador}
                onChange={(e) => setField('desconto_colaborador', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>

            {/* Valor empresa (calculado) */}
            <div>
              <Label>Valor Empresa (calculado)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valor_empresa}
                onChange={(e) => setField('valor_empresa', e.target.value)}
                className="mt-1 bg-muted"
                placeholder="0,00"
              />
            </div>

            {/* Observações */}
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setField('observacoes', e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
