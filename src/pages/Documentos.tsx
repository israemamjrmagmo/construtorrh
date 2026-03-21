import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, FolderOpen, AlertCircle, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Documento, Colaborador } from '@/lib/supabase'
import { formatDate, cn } from '@/lib/utils'
import { PageHeader, BadgeStatus, EmptyState, LoadingSkeleton } from '@/components/Shared'
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

type DocumentoRow = Documento & {
  colaboradores: Pick<Colaborador, 'nome' | 'chapa'> | null
}

type FormData = {
  colaborador_id: string
  tipo: string
  titulo: string
  numero: string
  data_emissao: string
  data_vencimento: string
  orgao_emissor: string
  status: Documento['status']
  observacoes: string
}

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  tipo: '',
  titulo: '',
  numero: '',
  data_emissao: '',
  data_vencimento: '',
  orgao_emissor: '',
  status: 'ativo',
  observacoes: '',
}

const TIPOS_DOCUMENTO = [
  'RG',
  'CPF',
  'CNH',
  'CTPS',
  'PIS/PASEP',
  'Título de Eleitor',
  'Reservista',
  'NR-35',
  'NR-33',
  'NR-18',
  'NR-10',
  'NR-6',
  'ASO',
  'Diploma/Certificado',
  'Outros',
]

// ─── utilitários de vencimento ────────────────────────────────────────────────

function getDiasParaVencer(dataVencimento: string | null): number | null {
  if (!dataVencimento) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(dataVencimento + 'T00:00:00')
  return Math.floor((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

function VencimentoCell({ data_vencimento }: { data_vencimento: string | null }) {
  if (!data_vencimento) return <span className="text-muted-foreground text-xs">—</span>
  const dias = getDiasParaVencer(data_vencimento)
  const label = formatDate(data_vencimento)

  if (dias === null) return <span className="text-sm">{label}</span>

  if (dias < 0) {
    return (
      <span className="flex items-center gap-1 text-sm font-medium text-red-600">
        <AlertCircle className="w-3.5 h-3.5" />
        {label}
      </span>
    )
  }
  if (dias <= 30) {
    return (
      <span className="flex items-center gap-1 text-sm font-medium text-yellow-600">
        <AlertTriangle className="w-3.5 h-3.5" />
        {label}
        <span className="text-xs">({dias}d)</span>
      </span>
    )
  }
  return <span className="text-sm">{label}</span>
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function Documentos() {
  const [documentos, setDocumentos] = useState<DocumentoRow[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // filtros
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState<string>('todos')
  const [filterStatus, setFilterStatus] = useState<string>('todos')

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)

  // exclusão
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── carregamento ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: docs }, { data: col }] = await Promise.all([
      supabase
        .from('documentos')
        .select('*, colaboradores(nome,chapa)')
        .order('created_at', { ascending: false }),
      supabase.from('colaboradores').select('*').order('nome'),
    ])
    if (docs) setDocumentos(docs as DocumentoRow[])
    if (col) setColaboradores(col as Colaborador[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── alertas de vencimento ───────────────────────────────────────────────────

  const alertas = useMemo(() => {
    const vencidos = documentos.filter((d) => {
      const dias = getDiasParaVencer(d.data_vencimento)
      return dias !== null && dias < 0
    })
    const proximos = documentos.filter((d) => {
      const dias = getDiasParaVencer(d.data_vencimento)
      return dias !== null && dias >= 0 && dias <= 30
    })
    return { vencidos, proximos }
  }, [documentos])

  // ── filtros ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return documentos.filter((d) => {
      const termo = search.toLowerCase()
      const matchSearch =
        !termo ||
        (d.colaboradores?.nome ?? '').toLowerCase().includes(termo) ||
        d.titulo.toLowerCase().includes(termo)
      const matchTipo = filterTipo === 'todos' || d.tipo === filterTipo
      const matchStatus = filterStatus === 'todos' || d.status === filterStatus
      return matchSearch && matchTipo && matchStatus
    })
  }, [documentos, search, filterTipo, filterStatus])

  // ── modal helpers ───────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(d: DocumentoRow) {
    setEditingId(d.id)
    setForm({
      colaborador_id: d.colaborador_id,
      tipo: d.tipo,
      titulo: d.titulo,
      numero: d.numero ?? '',
      data_emissao: d.data_emissao ?? '',
      data_vencimento: d.data_vencimento ?? '',
      orgao_emissor: d.orgao_emissor ?? '',
      status: d.status,
      observacoes: d.observacoes ?? '',
    })
    setModalOpen(true)
  }

  function setF<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── salvar ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.colaborador_id || !form.tipo || !form.titulo) {
      toast.error('Preencha os campos obrigatórios (colaborador, tipo e título).')
      return
    }
    setSaving(true)

    const payload: Partial<Documento> = {
      colaborador_id: form.colaborador_id,
      tipo: form.tipo,
      titulo: form.titulo,
      numero: form.numero || null,
      data_emissao: form.data_emissao || null,
      data_vencimento: form.data_vencimento || null,
      orgao_emissor: form.orgao_emissor || null,
      status: form.status,
      observacoes: form.observacoes || null,
    }

    const { error } = editingId
      ? await supabase.from('documentos').update(payload).eq('id', editingId)
      : await supabase.from('documentos').insert(payload)

    setSaving(false)
    if (error) {
      toast.error('Erro ao salvar documento: ' + error.message)
      return
    }
    toast.success(editingId ? 'Documento atualizado!' : 'Documento registrado!')
    setModalOpen(false)
    fetchData()
  }

  // ── excluir ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('documentos').delete().eq('id', deleteId)
    if (error) {
      toast.error('Erro ao excluir: ' + error.message)
    } else {
      toast.success('Documento excluído.')
      fetchData()
    }
    setDeleteId(null)
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <PageHeader
        title="Documentos"
        subtitle={`${filtered.length} documento(s)`}
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo Documento
          </Button>
        }
      />

      {/* alertas de vencimento */}
      {(alertas.vencidos.length > 0 || alertas.proximos.length > 0) && (
        <div className="flex flex-wrap gap-3 mb-4">
          {alertas.vencidos.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{alertas.vencidos.length}</strong> documento(s) <strong>vencido(s)</strong>
              </span>
            </div>
          )}
          {alertas.proximos.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{alertas.proximos.length}</strong> documento(s) vencem em até <strong>30 dias</strong>
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
            placeholder="Buscar colaborador ou título…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Tipo de documento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPOS_DOCUMENTO.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
            <SelectItem value="renovar">A Renovar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* tabela */}
      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="w-8 h-8" />}
          title="Nenhum documento encontrado"
          description="Ajuste os filtros ou cadastre um novo documento."
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Colaborador</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const dias = getDiasParaVencer(d.data_vencimento)
                const rowClass = cn(
                  'hover:bg-muted/30',
                  dias !== null && dias < 0 && 'bg-red-50/50',
                  dias !== null && dias >= 0 && dias <= 30 && 'bg-yellow-50/50',
                )
                return (
                  <TableRow key={d.id} className={rowClass}>
                    <TableCell>
                      <div className="font-medium text-sm">{d.colaboradores?.nome ?? '—'}</div>
                      {d.colaboradores?.chapa && (
                        <div className="text-xs text-muted-foreground">#{d.colaboradores.chapa}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{d.tipo}</TableCell>
                    <TableCell className="text-sm font-medium">{d.titulo}</TableCell>
                    <TableCell className="text-sm font-mono">{d.numero ?? '—'}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(d.data_emissao)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <VencimentoCell data_vencimento={d.data_vencimento} />
                    </TableCell>
                    <TableCell><BadgeStatus status={d.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(d.id)}
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Documento' : 'Cadastrar Documento'}</DialogTitle>
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

            {/* tipo */}
            <div className="space-y-1.5">
              <Label>Tipo <span className="text-destructive">*</span></Label>
              <Select value={form.tipo} onValueChange={(v) => setF('tipo', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DOCUMENTO.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setF('status', v as Documento['status'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="renovar">A Renovar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* título */}
            <div className="col-span-2 space-y-1.5">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input
                value={form.titulo}
                onChange={(e) => setF('titulo', e.target.value)}
                placeholder="Título do documento…"
              />
            </div>

            {/* número */}
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input
                value={form.numero}
                onChange={(e) => setF('numero', e.target.value)}
                placeholder="Número do documento…"
              />
            </div>

            {/* órgão emissor */}
            <div className="space-y-1.5">
              <Label>Órgão Emissor</Label>
              <Input
                value={form.orgao_emissor}
                onChange={(e) => setF('orgao_emissor', e.target.value)}
                placeholder="ex: DETRAN, MTE…"
              />
            </div>

            {/* data emissão */}
            <div className="space-y-1.5">
              <Label>Data de Emissão</Label>
              <Input
                type="date"
                value={form.data_emissao}
                onChange={(e) => setF('data_emissao', e.target.value)}
              />
            </div>

            {/* data vencimento */}
            <div className="space-y-1.5">
              <Label>Data de Vencimento</Label>
              <Input
                type="date"
                value={form.data_vencimento}
                onChange={(e) => setF('data_vencimento', e.target.value)}
              />
            </div>

            {/* observações */}
            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setF('observacoes', e.target.value)}
                rows={2}
                placeholder="Observações adicionais…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : editingId ? 'Atualizar' : 'Cadastrar'}
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
              Esta ação não pode ser desfeita. O documento será excluído permanentemente.
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
