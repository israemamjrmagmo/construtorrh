import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Funcao } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Briefcase, Plus, Search, Pencil, Trash2, X } from 'lucide-react'

// ─── tipos ────────────────────────────────────────────────────────────────────
type FormData = {
  nome: string; descricao: string; cbo: string; salario_base: string; ativo: boolean
}

const EMPTY_FORM: FormData = {
  nome: '', descricao: '', cbo: '', salario_base: '', ativo: true,
}

// ─── toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const show = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3500)
  }, [])
  return { msg, show }
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function Funcoes() {
  const { msg, show } = useToast()

  const [rows, setRows] = useState<Funcao[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('funcoes').select('*').order('nome')
    if (data) setRows(data as Funcao[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── filtro ────────────────────────────────────────────────────────────────
  const filtered = rows.filter(f =>
    !search || f.nome.toLowerCase().includes(search.toLowerCase()),
  )

  // ── modal ─────────────────────────────────────────────────────────────────
  const openNew = () => { setEditId(null); setForm(EMPTY_FORM); setModalOpen(true) }
  const openEdit = (f: Funcao) => {
    setEditId(f.id)
    setForm({
      nome: f.nome,
      descricao: f.descricao ?? '',
      cbo: f.cbo ?? '',
      salario_base: f.salario_base != null ? String(f.salario_base) : '',
      ativo: f.ativo,
    })
    setModalOpen(true)
  }

  const set = (k: keyof FormData, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v }))

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nome.trim()) { show('Nome é obrigatório', 'error'); return }
    setSaving(true)

    const payload: Partial<Funcao> = {
      nome: form.nome.trim(),
      descricao: form.descricao || null,
      cbo: form.cbo || null,
      salario_base: form.salario_base ? parseFloat(form.salario_base) : null,
      ativo: form.ativo,
    }

    const { error } = editId
      ? await supabase.from('funcoes').update(payload).eq('id', editId)
      : await supabase.from('funcoes').insert(payload)

    setSaving(false)
    if (error) { show(error.message, 'error'); return }
    show(editId ? 'Função atualizada!' : 'Função criada!')
    setModalOpen(false)
    fetchData()
  }

  // ── delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('funcoes').delete().eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    if (error) { show(error.message, 'error'); return }
    show('Função excluída!')
    fetchData()
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      {msg && (
        <div className={cn(
          'fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2',
          msg.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
        )}>
          {msg.text}
          <button onClick={() => {}} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      <PageHeader
        title="Funções / Cargos"
        subtitle={`${rows.length} função${rows.length !== 1 ? 'ões' : ''} cadastrada${rows.length !== 1 ? 's' : ''}`}
        action={
          <Button onClick={openNew} className="gap-2">
            <Plus size={16} /> Nova Função
          </Button>
        }
      />

      {/* Busca */}
      <div className="relative max-w-sm mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tabela */}
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Briefcase size={32} />} title="Nenhuma função encontrada" description="Cadastre a primeira função ou ajuste a busca." />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Nome</TableHead>
                <TableHead>CBO</TableHead>
                <TableHead>Salário Base</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{f.nome}</p>
                      {f.descricao && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{f.descricao}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{f.cbo ?? '—'}</TableCell>
                  <TableCell className="text-sm">{formatCurrency(f.salario_base)}</TableCell>
                  <TableCell>
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      f.ativo
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800',
                    )}>
                      {f.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(f.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Função' : 'Nova Função'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Nome *</Label>
              <Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex.: Pedreiro" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} placeholder="Descreva as atribuições…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">CBO</Label>
                <Input value={form.cbo} onChange={e => set('cbo', e.target.value)} placeholder="7152-10" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Salário base (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.salario_base} onChange={e => set('salario_base', e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => set('ativo', !form.ativo)}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  form.ativo ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
              >
                <span className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  form.ativo ? 'translate-x-6' : 'translate-x-1',
                )} />
              </button>
              <Label className="text-sm cursor-pointer" onClick={() => set('ativo', !form.ativo)}>
                {form.ativo ? 'Função ativa' : 'Função inativa'}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Criar função'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir função?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Colaboradores vinculados a esta função perderão o vínculo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
