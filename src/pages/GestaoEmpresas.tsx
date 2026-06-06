import React, { useEffect, useState, useCallback } from 'react'
import { supabaseV2 } from '@/lib/supabase-v2'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/Shared'
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Building2, Plus, Pencil, Power, PowerOff, Search,
  Users, Package, CheckCircle2, XCircle, Crown,
  Loader2, RefreshCw, Shield,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Empresa = {
  id:             string
  created_at:     string
  nome:           string
  cnpj:           string | null
  email:          string | null
  telefone:       string | null
  endereco:       string | null
  cidade:         string | null
  estado:         string | null
  plano:          'basico' | 'profissional' | 'enterprise'
  ativo:          boolean
  _vinculos?:     number
  _usuarios?:     number
}

type FormData = {
  nome:      string
  cnpj:      string
  email:     string
  telefone:  string
  endereco:  string
  cidade:    string
  estado:    string
  plano:     'basico' | 'profissional' | 'enterprise'
}

const EMPTY: FormData = {
  nome: '', cnpj: '', email: '', telefone: '',
  endereco: '', cidade: '', estado: '', plano: 'profissional',
}

const PLANO_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  basico:       { label: 'Básico',        color: '#64748b', bg: '#f1f5f9', icon: Package  },
  profissional: { label: 'Profissional',  color: '#0369a1', bg: '#e0f2fe', icon: Shield   },
  enterprise:   { label: 'Enterprise',    color: '#7c3aed', bg: '#f5f3ff', icon: Crown    },
}

function fmtCNPJ(v: string | null) {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  return d.length === 14
    ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : v
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function GestaoEmpresas() {
  const [empresas,   setEmpresas]   = useState<Empresa[]>([])
  const [loading,    setLoading]    = useState(true)
  const [busca,      setBusca]      = useState('')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editando,   setEditando]   = useState<Empresa | null>(null)
  const [form,       setForm]       = useState<FormData>(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [toggleId,   setToggleId]   = useState<string | null>(null)
  const [toggleAtivo,setToggleAtivo]= useState(false)

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabaseV2
      .from('empresas')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) { toast.error('Erro ao carregar empresas: ' + error.message); setLoading(false); return }

    // Buscar contagens de vínculos e usuários por empresa
    const empresasComContagens = await Promise.all((data ?? []).map(async (emp: Empresa) => {
      const [vincRes, usrRes] = await Promise.all([
        supabaseV2.from('vinculos_empregaticos').select('id', { count: 'exact', head: true }).eq('empresa_id', emp.id).eq('status', 'ativo'),
        supabaseV2.from('empresa_usuarios').select('id', { count: 'exact', head: true }).eq('empresa_id', emp.id).eq('ativo', true),
      ])
      return { ...emp, _vinculos: vincRes.count ?? 0, _usuarios: usrRes.count ?? 0 }
    }))

    setEmpresas(empresasComContagens)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Filtro ────────────────────────────────────────────────────────────────
  const filtradas = empresas.filter(e =>
    !busca || e.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (e.cnpj ?? '').includes(busca) || (e.cidade ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  // ── Abrir modal ───────────────────────────────────────────────────────────
  function abrirNova() {
    setEditando(null)
    setForm(EMPTY)
    setModalOpen(true)
  }

  function abrirEditar(e: Empresa) {
    setEditando(e)
    setForm({
      nome: e.nome, cnpj: e.cnpj ?? '', email: e.email ?? '',
      telefone: e.telefone ?? '', endereco: e.endereco ?? '',
      cidade: e.cidade ?? '', estado: e.estado ?? '', plano: e.plano,
    })
    setModalOpen(true)
  }

  // ── Salvar ────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.nome.trim()) { toast.error('Nome da empresa obrigatório'); return }
    setSaving(true)

    const payload = {
      nome:     form.nome.trim(),
      cnpj:     form.cnpj.replace(/\D/g, '') || null,
      email:    form.email || null,
      telefone: form.telefone || null,
      endereco: form.endereco || null,
      cidade:   form.cidade || null,
      estado:   form.estado || null,
      plano:    form.plano,
    }

    const { error } = editando
      ? await supabaseV2.from('empresas').update(payload).eq('id', editando.id)
      : await supabaseV2.from('empresas').insert({ ...payload, ativo: true })

    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? '✅ Empresa atualizada!' : '🏢 Empresa cadastrada!')
    setModalOpen(false)
    fetchData()
  }

  // ── Ativar / Desativar ────────────────────────────────────────────────────
  async function confirmarToggle() {
    if (!toggleId) return
    const { error } = await supabaseV2
      .from('empresas')
      .update({ ativo: !toggleAtivo })
      .eq('id', toggleId)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(!toggleAtivo ? '✅ Empresa ativada!' : '⛔ Empresa desativada!')
    setToggleId(null)
    fetchData()
  }

  // ── Totais ────────────────────────────────────────────────────────────────
  const totais = {
    total:   empresas.length,
    ativas:  empresas.filter(e => e.ativo).length,
    colabs:  empresas.reduce((s, e) => s + (e._vinculos ?? 0), 0),
  }

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Gestão de Empresas"
        subtitle="Gerencie as empresas cadastradas na plataforma SaaS ConstrutorRH"
        icon={<Building2 className="w-6 h-6" />}
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center p-4">
          <p className="text-3xl font-bold text-blue-600">{totais.total}</p>
          <p className="text-xs text-gray-500 mt-1">Total de Empresas</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-3xl font-bold text-green-600">{totais.ativas}</p>
          <p className="text-xs text-gray-500 mt-1">Empresas Ativas</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-3xl font-bold text-indigo-600">{totais.colabs}</p>
          <p className="text-xs text-gray-500 mt-1">Colaboradores Ativos</p>
        </Card>
      </div>

      {/* Barra de ações */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou cidade…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button onClick={abrirNova}>
          <Plus className="w-4 h-4 mr-2" /> Nova Empresa
        </Button>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            </div>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma empresa encontrada</p>
              <p className="text-sm mt-1">Clique em "Nova Empresa" para cadastrar a primeira.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Cidade / UF</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-center">Colaboradores</TableHead>
                  <TableHead className="text-center">Usuários</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map(emp => {
                  const plano = PLANO_CONFIG[emp.plano] ?? PLANO_CONFIG.basico
                  const PlanoIcon = plano.icon
                  return (
                    <TableRow key={emp.id} className={!emp.ativo ? 'opacity-50' : ''}>
                      {/* Nome */}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{emp.nome}</span>
                          {emp.email && <span className="text-xs text-gray-400">{emp.email}</span>}
                        </div>
                      </TableCell>

                      {/* CNPJ */}
                      <TableCell className="font-mono text-sm text-gray-600">
                        {fmtCNPJ(emp.cnpj)}
                      </TableCell>

                      {/* Cidade/UF */}
                      <TableCell className="text-sm text-gray-600">
                        {emp.cidade && emp.estado ? `${emp.cidade} / ${emp.estado}` :
                         emp.cidade ?? emp.estado ?? '—'}
                      </TableCell>

                      {/* Plano */}
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border"
                          style={{ color: plano.color, background: plano.bg, borderColor: plano.color + '40' }}
                        >
                          <PlanoIcon className="w-3 h-3" />
                          {plano.label}
                        </span>
                      </TableCell>

                      {/* Colaboradores ativos */}
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
                          <Users className="w-3.5 h-3.5" />
                          {emp._vinculos ?? 0}
                        </span>
                      </TableCell>

                      {/* Usuários */}
                      <TableCell className="text-center">
                        <span className="text-sm font-medium text-gray-700">
                          {emp._usuarios ?? 0}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-center">
                        {emp.ativo
                          ? <Badge className="bg-green-100 text-green-800 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Ativa</Badge>
                          : <Badge className="bg-gray-100 text-gray-600 border-gray-300"><XCircle className="w-3 h-3 mr-1" />Inativa</Badge>
                        }
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm" variant="outline"
                            onClick={() => abrirEditar(emp)}
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className={emp.ativo
                              ? 'text-red-600 border-red-300 hover:bg-red-50'
                              : 'text-green-600 border-green-300 hover:bg-green-50'}
                            onClick={() => { setToggleId(emp.id); setToggleAtivo(emp.ativo) }}
                            title={emp.ativo ? 'Desativar' : 'Ativar'}
                          >
                            {emp.ativo
                              ? <PowerOff className="w-3.5 h-3.5" />
                              : <Power    className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Modal Criar / Editar ─────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {editando ? 'Editar Empresa' : 'Nova Empresa'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Nome da Empresa *</Label>
              <Input value={form.nome} onChange={set('nome')} placeholder="Ex: Magmo Construções Ltda" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CNPJ</Label>
                <Input value={form.cnpj} onChange={set('cnpj')} placeholder="XX.XXX.XXX/XXXX-XX" className="mt-1" />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={set('telefone')} placeholder="(XX) XXXXX-XXXX" className="mt-1" />
              </div>
            </div>

            <div>
              <Label>E-mail</Label>
              <Input value={form.email} onChange={set('email')} placeholder="contato@empresa.com.br" type="email" className="mt-1" />
            </div>

            <div>
              <Label>Endereço</Label>
              <Input value={form.endereco} onChange={set('endereco')} placeholder="Rua, número, bairro" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={set('cidade')} placeholder="São Paulo" className="mt-1" />
              </div>
              <div>
                <Label>UF</Label>
                <Input value={form.estado} onChange={set('estado')} placeholder="SP" maxLength={2} className="mt-1" />
              </div>
            </div>

            <div>
              <Label>Plano</Label>
              <Select value={form.plano} onValueChange={v => setForm(f => ({ ...f, plano: v as FormData['plano'] }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basico">
                    <span className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-gray-500" /> Básico
                    </span>
                  </SelectItem>
                  <SelectItem value="profissional">
                    <span className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-blue-600" /> Profissional
                    </span>
                  </SelectItem>
                  <SelectItem value="enterprise">
                    <span className="flex items-center gap-2">
                      <Crown className="w-3.5 h-3.5 text-purple-600" /> Enterprise
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editando ? 'Salvar Alterações' : 'Cadastrar Empresa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmar toggle ativo/inativo ───────────────────────────────────── */}
      <AlertDialog open={!!toggleId} onOpenChange={() => setToggleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleAtivo ? '⛔ Desativar empresa?' : '✅ Ativar empresa?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleAtivo
                ? 'A empresa ficará inativa. Os usuários não conseguirão acessar o sistema.'
                : 'A empresa será reativada e os usuários poderão acessar normalmente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarToggle}
              className={toggleAtivo ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
            >
              {toggleAtivo ? 'Desativar' : 'Ativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
