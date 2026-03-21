import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, Clock, Timer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { RegistroPonto, Colaborador, Obra } from '@/lib/supabase'
import { formatDate, cn } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── tipos ───────────────────────────────────────────────────────────────────

type PontoRow = RegistroPonto & {
  colaboradores: Pick<Colaborador, 'nome' | 'chapa'> | null
  obras: Pick<Obra, 'nome'> | null
}

type FormData = {
  colaborador_id: string
  data: string
  obra_id: string
  hora_entrada: string
  saida_almoco: string
  retorno_almoco: string
  hora_saida: string
  horas_trabalhadas: string
  horas_extras: string
  falta: boolean
  justificativa: string
}

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  data: '',
  obra_id: '',
  hora_entrada: '',
  saida_almoco: '',
  retorno_almoco: '',
  hora_saida: '',
  horas_trabalhadas: '',
  horas_extras: '0',
  falta: false,
  justificativa: '',
}

// ─── utilitários de cálculo de horas ─────────────────────────────────────────

/**
 * Converte "HH:MM" em minutos desde meia-noite.
 * Retorna null se o valor for inválido.
 */
function timeToMinutes(time: string): number | null {
  if (!time || !time.includes(':')) return null
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

/**
 * Formata minutos em "H,XX" (ex.: 8.5 → "8,50") ou "H:MM".
 */
function minutesToHorasStr(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const dec = (m / 60).toFixed(2).slice(1) // ".50"
  return `${h}${dec}`
}

/**
 * Formata minutos em "HH:MM" para exibição na tabela.
 */
function minutesToDisplay(minutes: number | null): string {
  if (minutes === null || minutes < 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Calcula horas trabalhadas (em decimal) com base nos horários informados.
 * Lógica:
 * - Se entrada e saída informados: total bruto = saída - entrada
 * - Subtrai almoço: se saida_almoco E retorno_almoco → diff real
 *                   se apenas saida_almoco → assume 1h padrão
 * Retorna string decimal ou '' se dados insuficientes.
 */
function calcularHorasTrabalhadas(
  hora_entrada: string,
  hora_saida: string,
  saida_almoco: string,
  retorno_almoco: string,
): string {
  const entrada = timeToMinutes(hora_entrada)
  const saida = timeToMinutes(hora_saida)
  if (entrada === null || saida === null) return ''

  let totalMin = saida - entrada
  if (totalMin < 0) totalMin += 24 * 60 // passou da meia-noite

  // desconta almoço
  const saidaAlm = timeToMinutes(saida_almoco)
  const retornoAlm = timeToMinutes(retorno_almoco)

  if (saidaAlm !== null && retornoAlm !== null) {
    let almoco = retornoAlm - saidaAlm
    if (almoco < 0) almoco += 24 * 60
    totalMin -= almoco
  } else if (saidaAlm !== null) {
    totalMin -= 60 // 1h padrão
  }

  if (totalMin < 0) totalMin = 0
  return minutesToHorasStr(totalMin)
}

/**
 * Converte decimal "8,50" ou "8.50" em minutos para exibição e totais.
 */
function decimalToMinutes(val: number | null): number | null {
  if (val === null) return null
  const h = Math.floor(val)
  const m = Math.round((val - h) * 60)
  return h * 60 + m
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function Ponto() {
  const [registros, setRegistros] = useState<PontoRow[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // filtros
  const [searchCol, setSearchCol] = useState('')
  const [filterObra, setFilterObra] = useState<string>('todos')
  const [filterData, setFilterData] = useState<string>('')
  const [filterMes, setFilterMes] = useState<string>('')

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)

  // exclusão
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── carregamento ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: pts }, { data: col }, { data: ob }] = await Promise.all([
      supabase
        .from('registro_ponto')
        .select('*, colaboradores(nome,chapa), obras(nome)')
        .order('data', { ascending: false }),
      supabase.from('colaboradores').select('*').eq('status', 'ativo').order('nome'),
      supabase.from('obras').select('*').order('nome'),
    ])
    if (pts) setRegistros(pts as PontoRow[])
    if (col) setColaboradores(col as Colaborador[])
    if (ob) setObras(ob as Obra[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── filtros + totalizadores ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return registros.filter((r) => {
      const termo = searchCol.toLowerCase()
      const matchCol =
        !termo ||
        (r.colaboradores?.nome ?? '').toLowerCase().includes(termo) ||
        (r.colaboradores?.chapa ?? '').toLowerCase().includes(termo)
      const matchObra = filterObra === 'todos' || r.obra_id === filterObra
      const matchData = !filterData || r.data === filterData
      const matchMes = !filterMes || r.data.startsWith(filterMes)
      return matchCol && matchObra && matchData && matchMes
    })
  }, [registros, searchCol, filterObra, filterData, filterMes])

  const totalHorasMin = useMemo(() => {
    return filtered.reduce((sum, r) => {
      const mins = decimalToMinutes(r.horas_trabalhadas)
      return sum + (mins ?? 0)
    }, 0)
  }, [filtered])

  const totalExtrasMin = useMemo(() => {
    return filtered.reduce((sum, r) => {
      const mins = decimalToMinutes(r.horas_extras)
      return sum + (mins ?? 0)
    }, 0)
  }, [filtered])

  // ── auto-cálculo no modal ───────────────────────────────────────────────────

  function setF<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      // recalcula se entradas relevantes mudaram
      if (
        ['hora_entrada', 'hora_saida', 'saida_almoco', 'retorno_almoco'].includes(key as string)
      ) {
        const ht = calcularHorasTrabalhadas(
          key === 'hora_entrada' ? (value as string) : next.hora_entrada,
          key === 'hora_saida' ? (value as string) : next.hora_saida,
          key === 'saida_almoco' ? (value as string) : next.saida_almoco,
          key === 'retorno_almoco' ? (value as string) : next.retorno_almoco,
        )
        if (ht !== '') next.horas_trabalhadas = ht
      }
      return next
    })
  }

  // ── modal helpers ───────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(r: PontoRow) {
    setEditingId(r.id)
    setForm({
      colaborador_id: r.colaborador_id,
      data: r.data,
      obra_id: r.obra_id ?? '',
      hora_entrada: r.hora_entrada ?? '',
      saida_almoco: r.saida_almoco ?? '',
      retorno_almoco: r.retorno_almoco ?? '',
      hora_saida: r.hora_saida ?? '',
      horas_trabalhadas: r.horas_trabalhadas !== null ? String(r.horas_trabalhadas) : '',
      horas_extras: String(r.horas_extras ?? 0),
      falta: r.falta,
      justificativa: r.justificativa ?? '',
    })
    setModalOpen(true)
  }

  // ── salvar ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.colaborador_id || !form.data) {
      toast.error('Preencha os campos obrigatórios (colaborador e data).')
      return
    }
    setSaving(true)

    const htNum = form.horas_trabalhadas !== '' ? parseFloat(form.horas_trabalhadas.replace(',', '.')) : null

    const payload: Partial<RegistroPonto> = {
      colaborador_id: form.colaborador_id,
      data: form.data,
      obra_id: form.obra_id || null,
      hora_entrada: form.hora_entrada || null,
      saida_almoco: form.saida_almoco || null,
      retorno_almoco: form.retorno_almoco || null,
      hora_saida: form.hora_saida || null,
      horas_trabalhadas: isNaN(htNum as number) ? null : htNum,
      horas_extras: parseFloat(form.horas_extras.replace(',', '.')) || 0,
      falta: form.falta,
      justificativa: form.justificativa || null,
    }

    const { error } = editingId
      ? await supabase.from('registro_ponto').update(payload).eq('id', editingId)
      : await supabase.from('registro_ponto').insert(payload)

    setSaving(false)
    if (error) {
      toast.error('Erro ao salvar registro: ' + error.message)
      return
    }
    toast.success(editingId ? 'Registro atualizado!' : 'Ponto registrado!')
    setModalOpen(false)
    fetchData()
  }

  // ── excluir ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('registro_ponto').delete().eq('id', deleteId)
    if (error) {
      toast.error('Erro ao excluir: ' + error.message)
    } else {
      toast.success('Registro excluído.')
      fetchData()
    }
    setDeleteId(null)
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <PageHeader
        title="Controle de Ponto"
        subtitle={`${filtered.length} registro(s)`}
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Registrar Ponto
          </Button>
        }
      />

      {/* totalizadores */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>
              Total trabalhado: <strong>{minutesToDisplay(totalHorasMin)}</strong>
            </span>
          </div>
          {totalExtrasMin > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
              <Timer className="w-4 h-4 flex-shrink-0" />
              <span>
                Horas extras: <strong>{minutesToDisplay(totalExtrasMin)}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar colaborador…"
            value={searchCol}
            onChange={(e) => setSearchCol(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterObra} onValueChange={setFilterObra}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Obra" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as obras</SelectItem>
            {obras.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filterData}
          onChange={(e) => setFilterData(e.target.value)}
          className="w-44"
          title="Filtrar por data específica"
        />
        <Input
          type="month"
          value={filterMes}
          onChange={(e) => setFilterMes(e.target.value)}
          className="w-44"
          title="Filtrar por mês/ano"
        />
      </div>

      {/* tabela */}
      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Clock className="w-8 h-8" />}
          title="Nenhum registro encontrado"
          description="Ajuste os filtros ou registre o ponto de um colaborador."
        />
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Colaborador</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-center">Entrada</TableHead>
                <TableHead className="text-center">Saída Almoço</TableHead>
                <TableHead className="text-center">Retorno</TableHead>
                <TableHead className="text-center">Saída</TableHead>
                <TableHead className="text-center">H. Trab.</TableHead>
                <TableHead className="text-center">H. Extras</TableHead>
                <TableHead className="text-center">Falta</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const htMin = decimalToMinutes(r.horas_trabalhadas)
                const heMin = decimalToMinutes(r.horas_extras)
                return (
                  <TableRow
                    key={r.id}
                    className={cn('hover:bg-muted/30', r.falta && 'bg-red-50/50')}
                  >
                    <TableCell>
                      <div className="font-medium text-sm">{r.colaboradores?.nome ?? '—'}</div>
                      {r.colaboradores?.chapa && (
                        <div className="text-xs text-muted-foreground">#{r.colaboradores.chapa}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(r.data)}</TableCell>
                    <TableCell className="text-center text-sm font-mono">
                      {r.hora_entrada ?? '—'}
                    </TableCell>
                    <TableCell className="text-center text-sm font-mono">
                      {r.saida_almoco ?? '—'}
                    </TableCell>
                    <TableCell className="text-center text-sm font-mono">
                      {r.retorno_almoco ?? '—'}
                    </TableCell>
                    <TableCell className="text-center text-sm font-mono">
                      {r.hora_saida ?? '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-medium tabular-nums">
                        {minutesToDisplay(htMin)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {(heMin ?? 0) > 0 ? (
                        <span className="text-sm font-medium text-orange-600 tabular-nums">
                          {minutesToDisplay(heMin)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.falta ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          Falta
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.obras?.nome ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(r.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── modal criar/editar ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Registro de Ponto' : 'Registrar Ponto'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            {/* colaborador */}
            <div className="col-span-2 space-y-1.5">
              <Label>Colaborador <span className="text-destructive">*</span></Label>
              <Select
                value={form.colaborador_id}
                onValueChange={(v) => setF('colaborador_id', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador…" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{c.chapa ? ` — #${c.chapa}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* data */}
            <div className="space-y-1.5">
              <Label>Data <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setF('data', e.target.value)}
              />
            </div>

            {/* obra */}
            <div className="space-y-1.5">
              <Label>Obra</Label>
              <Select value={form.obra_id} onValueChange={(v) => setF('obra_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {obras.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* falta switch */}
            <div className="col-span-2 flex items-center gap-3">
              <Switch
                checked={form.falta}
                onCheckedChange={(v) => setF('falta', v)}
              />
              <Label className="cursor-pointer">Falta</Label>
            </div>

            {!form.falta && (
              <>
                {/* hora entrada */}
                <div className="space-y-1.5">
                  <Label>Hora Entrada</Label>
                  <Input
                    type="time"
                    value={form.hora_entrada}
                    onChange={(e) => setF('hora_entrada', e.target.value)}
                  />
                </div>

                {/* saída almoço */}
                <div className="space-y-1.5">
                  <Label>Saída Almoço</Label>
                  <Input
                    type="time"
                    value={form.saida_almoco}
                    onChange={(e) => setF('saida_almoco', e.target.value)}
                  />
                </div>

                {/* retorno almoço */}
                <div className="space-y-1.5">
                  <Label>Retorno Almoço</Label>
                  <Input
                    type="time"
                    value={form.retorno_almoco}
                    onChange={(e) => setF('retorno_almoco', e.target.value)}
                  />
                </div>

                {/* hora saída */}
                <div className="space-y-1.5">
                  <Label>Hora Saída</Label>
                  <Input
                    type="time"
                    value={form.hora_saida}
                    onChange={(e) => setF('hora_saida', e.target.value)}
                  />
                </div>

                {/* horas trabalhadas */}
                <div className="space-y-1.5">
                  <Label>
                    Horas Trabalhadas
                    <span className="ml-1 text-xs text-muted-foreground">(auto calculado)</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.horas_trabalhadas}
                    onChange={(e) => setF('horas_trabalhadas', e.target.value)}
                    placeholder="ex: 8.50"
                  />
                </div>

                {/* horas extras */}
                <div className="space-y-1.5">
                  <Label>Horas Extras</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.horas_extras}
                    onChange={(e) => setF('horas_extras', e.target.value)}
                    placeholder="ex: 1.00"
                  />
                </div>
              </>
            )}

            {/* justificativa */}
            <div className="col-span-2 space-y-1.5">
              <Label>Justificativa</Label>
              <Textarea
                value={form.justificativa}
                onChange={(e) => setF('justificativa', e.target.value)}
                rows={2}
                placeholder="Justificativa de falta, hora extra, etc…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : editingId ? 'Atualizar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── alert dialog exclusão ── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registro de ponto será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
