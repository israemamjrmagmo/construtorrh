import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { EpiCatalogo, EpiRegistro, Colaborador } from '@/lib/supabase'
import { formatDate, cn } from '@/lib/utils'
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShieldCheck, Plus, Search, Pencil, Trash2, X, ClipboardList } from 'lucide-react'

// ─── tipos ────────────────────────────────────────────────────────────────────
type EpiRegistroRow = EpiRegistro & {
  colaboradores?: Pick<Colaborador, 'id' | 'nome' | 'chapa'>
  epi_catalogo?: Pick<EpiCatalogo, 'id' | 'nome' | 'numero_ca'>
}

// ── forms ──────────────────────────────────────────────────────────────────────
type CatalogoForm = {
  nome: string; descricao: string; numero_ca: string
  fabricante: string; validade_meses: string; requer_tamanho: boolean; ativo: boolean
}
const EMPTY_CAT: CatalogoForm = {
  nome: '', descricao: '', numero_ca: '', fabricante: '',
  validade_meses: '', requer_tamanho: false, ativo: true,
}

type RegistroForm = {
  colaborador_id: string; epi_id: string; tamanho: string; quantidade: string
  data_entrega: string; data_validade: string; devolvido: boolean; observacoes: string
}
const EMPTY_REG: RegistroForm = {
  colaborador_id: '', epi_id: '', tamanho: '', quantidade: '1',
  data_entrega: new Date().toISOString().split('T')[0], data_validade: '',
  devolvido: false, observacoes: '',
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
export default function Epis() {
  const { msg, show } = useToast()

  // ── catálogo state ─────────────────────────────────────────────────────────
  const [catalogo, setCatalogo] = useState<EpiCatalogo[]>([])
  const [catLoading, setCatLoading] = useState(true)
  const [catSearch, setCatSearch] = useState('')

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catEditId, setCatEditId] = useState<string | null>(null)
  const [catForm, setCatForm] = useState<CatalogoForm>(EMPTY_CAT)
  const [catSaving, setCatSaving] = useState(false)
  const [catDeleteId, setCatDeleteId] = useState<string | null>(null)
  const [catDeleting, setCatDeleting] = useState(false)

  // ── registros state ────────────────────────────────────────────────────────
  const [registros, setRegistros] = useState<EpiRegistroRow[]>([])
  const [regLoading, setRegLoading] = useState(true)
  const [regSearch, setRegSearch] = useState('')

  const [regModalOpen, setRegModalOpen] = useState(false)
  const [regEditId, setRegEditId] = useState<string | null>(null)
  const [regForm, setRegForm] = useState<RegistroForm>(EMPTY_REG)
  const [regSaving, setRegSaving] = useState(false)
  const [regDeleteId, setRegDeleteId] = useState<string | null>(null)
  const [regDeleting, setRegDeleting] = useState(false)

  // ── colaboradores para select ──────────────────────────────────────────────
  const [colaboradores, setColaboradores] = useState<Pick<Colaborador, 'id' | 'nome' | 'chapa'>[]>([])

  // ── fetch catálogo ─────────────────────────────────────────────────────────
  const fetchCatalogo = useCallback(async () => {
    setCatLoading(true)
    const { data } = await supabase.from('epi_catalogo').select('*').order('nome')
    if (data) setCatalogo(data as EpiCatalogo[])
    setCatLoading(false)
  }, [])

  // ── fetch registros ────────────────────────────────────────────────────────
  const fetchRegistros = useCallback(async () => {
    setRegLoading(true)
    const { data } = await supabase
      .from('epi_registros')
      .select('*, colaboradores(id, nome, chapa), epi_catalogo(id, nome, numero_ca)')
      .order('data_entrega', { ascending: false })
    if (data) setRegistros(data as EpiRegistroRow[])
    setRegLoading(false)
  }, [])

  // ── fetch colaboradores ────────────────────────────────────────────────────
  const fetchColaboradores = useCallback(async () => {
    const { data } = await supabase
      .from('colaboradores')
      .select('id, nome, chapa')
      .eq('status', 'ativo')
      .order('nome')
    if (data) setColaboradores(data as Pick<Colaborador, 'id' | 'nome' | 'chapa'>[])
  }, [])

  useEffect(() => {
    fetchCatalogo()
    fetchRegistros()
    fetchColaboradores()
  }, [fetchCatalogo, fetchRegistros, fetchColaboradores])

  // ── filtros ───────────────────────────────────────────────────────────────
  const filteredCat = catalogo.filter(c => {
    const q = catSearch.toLowerCase()
    return !q || c.nome.toLowerCase().includes(q) || (c.numero_ca ?? '').toLowerCase().includes(q)
  })

  const filteredReg = registros.filter(r => {
    const q = regSearch.toLowerCase()
    return (
      !q ||
      (r.colaboradores?.nome ?? '').toLowerCase().includes(q) ||
      (r.colaboradores?.chapa ?? '').toLowerCase().includes(q)
    )
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  CATÁLOGO HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  const openCatNew = () => { setCatEditId(null); setCatForm(EMPTY_CAT); setCatModalOpen(true) }
  const openCatEdit = (c: EpiCatalogo) => {
    setCatEditId(c.id)
    setCatForm({
      nome: c.nome, descricao: c.descricao ?? '', numero_ca: c.numero_ca ?? '',
      fabricante: c.fabricante ?? '',
      validade_meses: c.validade_meses != null ? String(c.validade_meses) : '',
      requer_tamanho: c.requer_tamanho, ativo: c.ativo,
    })
    setCatModalOpen(true)
  }

  const setCat = (k: keyof CatalogoForm, v: string | boolean) =>
    setCatForm(p => ({ ...p, [k]: v }))

  const handleCatSave = async () => {
    if (!catForm.nome.trim()) { show('Nome é obrigatório', 'error'); return }
    setCatSaving(true)

    const payload: Partial<EpiCatalogo> = {
      nome: catForm.nome.trim(),
      descricao: catForm.descricao || null,
      numero_ca: catForm.numero_ca || null,
      fabricante: catForm.fabricante || null,
      validade_meses: catForm.validade_meses ? parseInt(catForm.validade_meses) : null,
      requer_tamanho: catForm.requer_tamanho,
      ativo: catForm.ativo,
    }

    const { error } = catEditId
      ? await supabase.from('epi_catalogo').update(payload).eq('id', catEditId)
      : await supabase.from('epi_catalogo').insert(payload)

    setCatSaving(false)
    if (error) { show(error.message, 'error'); return }
    show(catEditId ? 'EPI atualizado!' : 'EPI cadastrado!')
    setCatModalOpen(false)
    fetchCatalogo()
  }

  const handleCatDelete = async () => {
    if (!catDeleteId) return
    setCatDeleting(true)
    const { error } = await supabase.from('epi_catalogo').delete().eq('id', catDeleteId)
    setCatDeleting(false)
    setCatDeleteId(null)
    if (error) { show(error.message, 'error'); return }
    show('EPI excluído do catálogo!')
    fetchCatalogo()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  REGISTROS HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  const openRegNew = () => { setRegEditId(null); setRegForm(EMPTY_REG); setRegModalOpen(true) }
  const openRegEdit = (r: EpiRegistroRow) => {
    setRegEditId(r.id)
    setRegForm({
      colaborador_id: r.colaborador_id,
      epi_id: r.epi_id ?? '',
      tamanho: r.tamanho ?? '',
      quantidade: String(r.quantidade),
      data_entrega: r.data_entrega,
      data_validade: r.data_validade ?? '',
      devolvido: r.devolvido,
      observacoes: r.observacoes ?? '',
    })
    setRegModalOpen(true)
  }

  const setReg = (k: keyof RegistroForm, v: string | boolean) =>
    setRegForm(p => ({ ...p, [k]: v }))

  const handleRegSave = async () => {
    if (!regForm.colaborador_id) { show('Colaborador é obrigatório', 'error'); return }
    if (!regForm.data_entrega) { show('Data de entrega é obrigatória', 'error'); return }
    setRegSaving(true)

    const selectedEpi = catalogo.find(c => c.id === regForm.epi_id)

    const payload: Partial<EpiRegistro> = {
      colaborador_id: regForm.colaborador_id,
      epi_id: regForm.epi_id || null,
      epi_nome: selectedEpi?.nome ?? null,
      numero_ca: selectedEpi?.numero_ca ?? null,
      tamanho: regForm.tamanho || null,
      quantidade: parseInt(regForm.quantidade) || 1,
      data_entrega: regForm.data_entrega,
      data_validade: regForm.data_validade || null,
      devolvido: regForm.devolvido,
      observacoes: regForm.observacoes || null,
    }

    const { error } = regEditId
      ? await supabase.from('epi_registros').update(payload).eq('id', regEditId)
      : await supabase.from('epi_registros').insert(payload)

    setRegSaving(false)
    if (error) { show(error.message, 'error'); return }
    show(regEditId ? 'Registro atualizado!' : 'Registro criado!')
    setRegModalOpen(false)
    fetchRegistros()
  }

  const handleRegDelete = async () => {
    if (!regDeleteId) return
    setRegDeleting(true)
    const { error } = await supabase.from('epi_registros').delete().eq('id', regDeleteId)
    setRegDeleting(false)
    setRegDeleteId(null)
    if (error) { show(error.message, 'error'); return }
    show('Registro excluído!')
    fetchRegistros()
  }

  // ─── selected EPI p/ mostrar info requer_tamanho ──────────────────────────
  const selectedEpiObj = catalogo.find(c => c.id === regForm.epi_id)

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

      <PageHeader title="EPIs" subtitle="Catálogo e registros de entrega de equipamentos de proteção individual" />

      <Tabs defaultValue="catalogo">
        <TabsList className="mb-5">
          <TabsTrigger value="catalogo" className="gap-2">
            <ShieldCheck size={15} /> Catálogo de EPIs
          </TabsTrigger>
          <TabsTrigger value="registros" className="gap-2">
            <ClipboardList size={15} /> Registros de Entrega
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/*  TAB CATÁLOGO                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="catalogo">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome ou Nº CA…"
                value={catSearch}
                onChange={e => setCatSearch(e.target.value)}
              />
            </div>
            <Button onClick={openCatNew} className="gap-2 shrink-0">
              <Plus size={16} /> Novo EPI
            </Button>
          </div>

          {catLoading ? (
            <LoadingSkeleton rows={5} />
          ) : filteredCat.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={32} />} title="Nenhum EPI cadastrado" description="Adicione EPIs ao catálogo para controlar as entregas." />
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nome</TableHead>
                    <TableHead>Nº CA</TableHead>
                    <TableHead>Fabricante</TableHead>
                    <TableHead>Validade (meses)</TableHead>
                    <TableHead>Tam.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCat.map(c => (
                    <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div>
                          <p className="font-medium">{c.nome}</p>
                          {c.descricao && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.descricao}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{c.numero_ca ?? '—'}</TableCell>
                      <TableCell className="text-sm">{c.fabricante ?? '—'}</TableCell>
                      <TableCell className="text-sm">{c.validade_meses ?? '—'}</TableCell>
                      <TableCell>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          c.requer_tamanho ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600',
                        )}>
                          {c.requer_tamanho ? 'Sim' : 'Não'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          c.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800',
                        )}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCatEdit(c)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setCatDeleteId(c.id)}>
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
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/*  TAB REGISTROS                                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="registros">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Filtrar por colaborador ou chapa…"
                value={regSearch}
                onChange={e => setRegSearch(e.target.value)}
              />
            </div>
            <Button onClick={openRegNew} className="gap-2 shrink-0">
              <Plus size={16} /> Novo Registro
            </Button>
          </div>

          {regLoading ? (
            <LoadingSkeleton rows={5} />
          ) : filteredReg.length === 0 ? (
            <EmptyState icon={<ClipboardList size={32} />} title="Nenhum registro encontrado" description="Registre a entrega de EPIs aos colaboradores." />
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Colaborador</TableHead>
                    <TableHead>EPI</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Data Entrega</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Devolvido</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReg.map(r => (
                    <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{r.colaboradores?.nome ?? '—'}</p>
                          {r.colaboradores?.chapa && (
                            <p className="text-xs text-muted-foreground font-mono">#{r.colaboradores.chapa}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{r.epi_catalogo?.nome ?? r.epi_nome ?? '—'}</p>
                          {(r.epi_catalogo?.numero_ca ?? r.numero_ca) && (
                            <p className="text-xs text-muted-foreground font-mono">
                              CA {r.epi_catalogo?.numero_ca ?? r.numero_ca}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.tamanho ?? '—'}</TableCell>
                      <TableCell className="text-sm text-center">{r.quantidade}</TableCell>
                      <TableCell className="text-sm">{formatDate(r.data_entrega)}</TableCell>
                      <TableCell className="text-sm">
                        {r.data_validade ? (
                          <span className={cn(
                            new Date(r.data_validade) < new Date()
                              ? 'text-red-600 font-medium'
                              : 'text-foreground',
                          )}>
                            {formatDate(r.data_validade)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          r.devolvido
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-yellow-100 text-yellow-800',
                        )}>
                          {r.devolvido ? 'Sim' : 'Não'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRegEdit(r)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setRegDeleteId(r.id)}>
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
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*  MODAL CATÁLOGO                                                      */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{catEditId ? 'Editar EPI' : 'Novo EPI'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <FG label="Nome *">
              <Input value={catForm.nome} onChange={e => setCat('nome', e.target.value)} placeholder="Ex.: Capacete de proteção" />
            </FG>
            <FG label="Descrição">
              <Textarea value={catForm.descricao} onChange={e => setCat('descricao', e.target.value)} rows={2} placeholder="Descrição do EPI…" />
            </FG>
            <div className="grid grid-cols-2 gap-3">
              <FG label="Número CA">
                <Input value={catForm.numero_ca} onChange={e => setCat('numero_ca', e.target.value)} placeholder="12345" />
              </FG>
              <FG label="Validade (meses)">
                <Input type="number" min="0" value={catForm.validade_meses} onChange={e => setCat('validade_meses', e.target.value)} placeholder="12" />
              </FG>
              <FG label="Fabricante" span={2}>
                <Input value={catForm.fabricante} onChange={e => setCat('fabricante', e.target.value)} placeholder="Nome do fabricante" />
              </FG>
            </div>
            <div className="flex items-center gap-6 pt-1">
              <SwitchRow
                label="Requer tamanho"
                value={catForm.requer_tamanho}
                onChange={v => setCat('requer_tamanho', v)}
              />
              <SwitchRow
                label="Ativo"
                value={catForm.ativo}
                onChange={v => setCat('ativo', v)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCatModalOpen(false)} disabled={catSaving}>Cancelar</Button>
            <Button onClick={handleCatSave} disabled={catSaving}>
              {catSaving ? 'Salvando…' : catEditId ? 'Salvar alterações' : 'Cadastrar EPI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*  MODAL REGISTRO                                                      */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={regModalOpen} onOpenChange={setRegModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{regEditId ? 'Editar Registro' : 'Novo Registro de Entrega'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <FG label="Colaborador *">
              <Select value={regForm.colaborador_id} onValueChange={v => setReg('colaborador_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {colaboradores.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{c.chapa ? ` (${c.chapa})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FG>
            <FG label="EPI">
              <Select value={regForm.epi_id} onValueChange={v => setReg('epi_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o EPI" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Sem vínculo —</SelectItem>
                  {catalogo.filter(c => c.ativo).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{c.numero_ca ? ` — CA ${c.numero_ca}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FG>
            <div className="grid grid-cols-2 gap-3">
              {selectedEpiObj?.requer_tamanho && (
                <FG label="Tamanho">
                  <Select value={regForm.tamanho} onValueChange={v => setReg('tamanho', v)}>
                    <SelectTrigger><SelectValue placeholder="Tam." /></SelectTrigger>
                    <SelectContent>
                      {['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FG>
              )}
              <FG label="Quantidade">
                <Input type="number" min="1" value={regForm.quantidade} onChange={e => setReg('quantidade', e.target.value)} />
              </FG>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FG label="Data de entrega *">
                <Input type="date" value={regForm.data_entrega} onChange={e => setReg('data_entrega', e.target.value)} />
              </FG>
              <FG label="Data de validade">
                <Input type="date" value={regForm.data_validade} onChange={e => setReg('data_validade', e.target.value)} />
              </FG>
            </div>
            <FG label="Observações">
              <Textarea value={regForm.observacoes} onChange={e => setReg('observacoes', e.target.value)} rows={2} placeholder="Observações…" />
            </FG>
            <SwitchRow
              label="Devolvido"
              value={regForm.devolvido}
              onChange={v => setReg('devolvido', v)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRegModalOpen(false)} disabled={regSaving}>Cancelar</Button>
            <Button onClick={handleRegSave} disabled={regSaving}>
              {regSaving ? 'Salvando…' : regEditId ? 'Salvar alterações' : 'Registrar entrega'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog catálogo */}
      <AlertDialog open={!!catDeleteId} onOpenChange={open => !open && setCatDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir EPI do catálogo?</AlertDialogTitle>
            <AlertDialogDescription>
              O EPI será removido do catálogo. Registros de entrega existentes não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={catDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCatDelete} disabled={catDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {catDeleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog registros */}
      <AlertDialog open={!!regDeleteId} onOpenChange={open => !open && setRegDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registro de entrega do EPI será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegDelete} disabled={regDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {regDeleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function FG({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={cn('flex flex-col gap-1', span === 2 && 'col-span-2')}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          value ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          value ? 'translate-x-6' : 'translate-x-1',
        )} />
      </button>
      <Label className="text-sm cursor-pointer" onClick={() => onChange(!value)}>{label}</Label>
    </div>
  )
}
