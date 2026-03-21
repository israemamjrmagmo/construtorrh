import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Obra } from '@/lib/supabase'
import { formatDate, cn } from '@/lib/utils'
import { PageHeader, BadgeStatus, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Building2, Plus, Search, Pencil, Trash2, MapPin, User2,
  Calendar, Users, X, ChevronRight,
} from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

// ─── tipos ────────────────────────────────────────────────────────────────────
type ObraWithCount = Obra & { colaboradores_count?: number }

type FormData = {
  nome: string; codigo: string; endereco: string; cidade: string
  estado: string; cliente: string; responsavel: string
  data_inicio: string; data_previsao_fim: string
  status: string; observacoes: string
}

const EMPTY_FORM: FormData = {
  nome: '', codigo: '', endereco: '', cidade: '', estado: '',
  cliente: '', responsavel: '', data_inicio: '', data_previsao_fim: '',
  status: 'em_andamento', observacoes: '',
}

const STATUS_BORDER: Record<string, string> = {
  em_andamento: 'border-l-blue-500',
  concluida:    'border-l-emerald-500',
  pausada:      'border-l-yellow-500',
  cancelada:    'border-l-red-500',
}

const STATUS_BORDER_COLOR: Record<string, string> = {
  planejamento: '#94a3b8',
  em_andamento: '#3b82f6',
  concluida: '#22c55e',
  pausada: '#f59e0b',
  cancelada: '#ef4444',
}

const STATUS_LABEL: Record<string, string> = {
  em_andamento: 'Em andamento',
  concluida:    'Concluída',
  pausada:      'Pausada',
  cancelada:    'Cancelada',
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
export default function Obras() {
  const { msg, show } = useToast()

  const [obras, setObras] = useState<ObraWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('todos')

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: obrasData } = await supabase
      .from('obras')
      .select('*')
      .order('nome')

    if (!obrasData) { setLoading(false); return }

    // contar colaboradores por obra
    const { data: counts } = await supabase
      .from('colaboradores')
      .select('obra_id')
      .in('obra_id', obrasData.map(o => o.id))
      .eq('status', 'ativo')

    const countMap: Record<string, number> = {}
    if (counts) {
      counts.forEach(c => {
        if (c.obra_id) countMap[c.obra_id] = (countMap[c.obra_id] ?? 0) + 1
      })
    }

    setObras(obrasData.map(o => ({ ...o, colaboradores_count: countMap[o.id] ?? 0 })) as ObraWithCount[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── filtros ───────────────────────────────────────────────────────────────
  const filtered = obras.filter(o => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      o.nome.toLowerCase().includes(q) ||
      (o.codigo ?? '').toLowerCase().includes(q) ||
      (o.cliente ?? '').toLowerCase().includes(q)
    const matchStatus = filterStatus === 'todos' || o.status === filterStatus
    return matchSearch && matchStatus
  })

  // ── modal ─────────────────────────────────────────────────────────────────
  const openNew = () => { setEditId(null); setForm(EMPTY_FORM); setModalOpen(true) }
  const openEdit = (o: Obra) => {
    setEditId(o.id)
    setForm({
      nome: o.nome, codigo: o.codigo ?? '', endereco: o.endereco ?? '',
      cidade: o.cidade ?? '', estado: o.estado ?? '', cliente: o.cliente ?? '',
      responsavel: o.responsavel ?? '', data_inicio: o.data_inicio ?? '',
      data_previsao_fim: o.data_previsao_fim ?? '', status: o.status,
      observacoes: o.observacoes ?? '',
    })
    setModalOpen(true)
  }

  const set = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }))

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nome.trim()) { show('Nome é obrigatório', 'error'); return }
    setSaving(true)

    const payload: Partial<Obra> = {
      nome: form.nome.trim(),
      codigo: form.codigo || null,
      endereco: form.endereco || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      cliente: form.cliente || null,
      responsavel: form.responsavel || null,
      data_inicio: form.data_inicio || null,
      data_previsao_fim: form.data_previsao_fim || null,
      status: form.status as Obra['status'],
      observacoes: form.observacoes || null,
    }

    const { error } = editId
      ? await supabase.from('obras').update(payload).eq('id', editId)
      : await supabase.from('obras').insert(payload)

    setSaving(false)
    if (error) { show(error.message, 'error'); return }
    show(editId ? 'Obra atualizada!' : 'Obra criada!')
    setModalOpen(false)
    fetchData()
  }

  // ── delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('obras').delete().eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    if (error) { show(error.message, 'error'); return }
    show('Obra excluída!')
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
        title="Obras"
        subtitle={`${obras.length} obra${obras.length !== 1 ? 's' : ''} cadastrada${obras.length !== 1 ? 's' : ''}`}
        action={
          <Button onClick={openNew} className="gap-2">
            <Plus size={16} /> Nova Obra
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, código ou cliente…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="em_andamento">Em andamento</SelectItem>
            <SelectItem value="concluida">Concluída</SelectItem>
            <SelectItem value="pausada">Pausada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela de obras */}
      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Building2 size={32} />} title="Nenhuma obra encontrada" description="Cadastre a primeira obra ou ajuste os filtros." />
      ) : (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: 'var(--muted)' }}>
                <TableHead style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Obra</TableHead>
                <TableHead style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cliente / Responsável</TableHead>
                <TableHead style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Localização</TableHead>
                <TableHead style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Período</TableHead>
                <TableHead style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Colaboradores</TableHead>
                <TableHead style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Status</TableHead>
                <TableHead style={{ width: 80 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(o => (
                <TableRow key={o.id} style={{ cursor: 'default' }} className="hover:bg-muted/40">
                  {/* Obra */}
                  <TableCell style={{ paddingTop: 12, paddingBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 4, height: 36, borderRadius: 2, flexShrink: 0,
                        background: STATUS_BORDER_COLOR[o.status] ?? '#e2e8f0',
                      }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{o.nome}</div>
                        {o.codigo && (
                          <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted-foreground)', marginTop: 2 }}>#{o.codigo}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {/* Cliente / Responsável */}
                  <TableCell>
                    {o.cliente && <div style={{ fontSize: 13 }}>{o.cliente}</div>}
                    {o.responsavel && <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{o.responsavel}</div>}
                    {!o.cliente && !o.responsavel && <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>—</span>}
                  </TableCell>
                  {/* Localização */}
                  <TableCell>
                    {(o.cidade || o.estado) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                        <MapPin size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                        <span>{[o.cidade, o.estado].filter(Boolean).join(' — ')}</span>
                      </div>
                    ) : <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>—</span>}
                  </TableCell>
                  {/* Período */}
                  <TableCell style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {o.data_inicio ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{formatDate(o.data_inicio)}</span>
                        {o.data_previsao_fim && (
                          <>
                            <ChevronRight size={10} style={{ color: 'var(--muted-foreground)' }} />
                            <span style={{ color: 'var(--muted-foreground)' }}>{formatDate(o.data_previsao_fim)}</span>
                          </>
                        )}
                      </div>
                    ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                  </TableCell>
                  {/* Colaboradores */}
                  <TableCell style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Users size={13} style={{ color: 'var(--muted-foreground)' }} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{o.colaboradores_count ?? 0}</span>
                    </div>
                  </TableCell>
                  {/* Status */}
                  <TableCell style={{ textAlign: 'center' }}>
                    <BadgeStatus status={o.status} />
                  </TableCell>
                  {/* Ações */}
                  <TableCell>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => openEdit(o)}>
                        <Pencil size={13} />
                      </Button>
                      <Button variant="ghost" size="icon" style={{ width: 30, height: 30, color: 'var(--destructive)' }} onClick={() => setDeleteId(o.id)}>
                        <Trash2 size={13} />
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Obra' : 'Nova Obra'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <FG label="Nome da obra *" span={2}>
              <Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex.: Residencial Alfa" />
            </FG>
            <FG label="Código">
              <Input value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="OBR-001" />
            </FG>
            <FG label="Cliente">
              <Input value={form.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Nome do cliente" />
            </FG>
            <FG label="Responsável" span={2}>
              <Input value={form.responsavel} onChange={e => set('responsavel', e.target.value)} placeholder="Nome do responsável" />
            </FG>
            <FG label="Endereço" span={2}>
              <Input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número" />
            </FG>
            <FG label="Cidade">
              <Input value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
            </FG>
            <FG label="Estado">
              <Input value={form.estado} onChange={e => set('estado', e.target.value)} placeholder="MG" maxLength={2} />
            </FG>
            <FG label="Data de início">
              <Input type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
            </FG>
            <FG label="Previsão de fim">
              <Input type="date" value={form.data_previsao_fim} onChange={e => set('data_previsao_fim', e.target.value)} />
            </FG>
            <FG label="Status">
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FG>
            <FG label="Observações" span={2}>
              <Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} placeholder="Observações…" />
            </FG>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Criar obra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir obra?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Verifique se não há colaboradores vinculados a esta obra.
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

// ─── helper ───────────────────────────────────────────────────────────────────
function FG({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={cn('flex flex-col gap-1', span === 2 && 'col-span-2')}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
