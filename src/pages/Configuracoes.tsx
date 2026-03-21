import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Settings, Save, Building2, Sliders, Users, Loader2 } from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
interface ConfigMap {
  [chave: string]: string
}

interface Profile {
  id: string
  nome: string | null
  email: string | null
  role: string | null
  ativo: boolean
}

interface ParamConfig {
  chave: string
  label: string
  descricao: string
  tipo: 'number' | 'text'
  sufixo?: string
}

// ─── parâmetros de pagamento ──────────────────────────────────────────────────
const PARAMS: ParamConfig[] = [
  {
    chave: 'jornada_horas',
    label: 'Jornada de Trabalho',
    descricao: 'Horas semanais de trabalho (padrão: 44h)',
    tipo: 'number',
    sufixo: 'h/semana',
  },
  {
    chave: 'he_percentual_60',
    label: 'HE 60%',
    descricao: 'Percentual de acréscimo para horas extras normais',
    tipo: 'number',
    sufixo: '%',
  },
  {
    chave: 'he_percentual_100',
    label: 'HE 100%',
    descricao: 'Percentual de acréscimo para horas extras em domingos e feriados',
    tipo: 'number',
    sufixo: '%',
  },
  {
    chave: 'vt_desconto_pct',
    label: 'Desconto VT',
    descricao: 'Percentual de desconto do vale transporte sobre o salário do colaborador',
    tipo: 'number',
    sufixo: '%',
  },
  {
    chave: 'inss_aliquota',
    label: 'Alíquota INSS',
    descricao: 'Alíquota padrão utilizada para cálculo do INSS (simplificado)',
    tipo: 'number',
    sufixo: '%',
  },
  {
    chave: 'fgts_aliquota',
    label: 'Alíquota FGTS',
    descricao: 'Percentual de FGTS sobre o salário bruto (padrão: 8%)',
    tipo: 'number',
    sufixo: '%',
  },
]

// ─── campos de empresa ────────────────────────────────────────────────────────
const EMPRESA_FIELDS: { chave: string; label: string; placeholder: string }[] = [
  { chave: 'empresa_nome', label: 'Nome da Empresa', placeholder: 'Construtora Exemplo Ltda.' },
  { chave: 'empresa_cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00' },
  { chave: 'empresa_responsavel', label: 'Responsável', placeholder: 'Nome do responsável' },
  { chave: 'empresa_telefone', label: 'Telefone', placeholder: '(11) 3000-0000' },
]

// ─── componente ──────────────────────────────────────────────────────────────
export default function Configuracoes() {
  const [configs, setConfigs] = useState<ConfigMap>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingConfigs, setLoadingConfigs] = useState(true)
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [savingEmpresa, setSavingEmpresa] = useState(false)
  const [savingParams, setSavingParams] = useState(false)
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null)

  // ─── fetch configs ─────────────────────────────────────────────────────────
  const fetchConfigs = useCallback(async () => {
    setLoadingConfigs(true)
    const { data, error } = await supabase.from('configuracoes').select('chave, valor')
    if (error) {
      toast.error('Erro ao carregar configurações')
    } else {
      const map: ConfigMap = {}
      ;(data ?? []).forEach((r: { chave: string; valor: string | null }) => {
        map[r.chave] = r.valor ?? ''
      })
      setConfigs(map)
    }
    setLoadingConfigs(false)
  }, [])

  // ─── fetch profiles ────────────────────────────────────────────────────────
  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, email, role, ativo')
      .order('nome')
    if (error) {
      toast.error('Erro ao carregar usuários')
    } else {
      setProfiles(
        (data ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          nome: p.nome != null ? String(p.nome) : null,
          email: p.email != null ? String(p.email) : null,
          role: p.role != null ? String(p.role) : null,
          ativo: Boolean(p.ativo),
        }))
      )
    }
    setLoadingProfiles(false)
  }, [])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  function setConfig(chave: string, valor: string) {
    setConfigs((prev) => ({ ...prev, [chave]: valor }))
  }

  // ─── upsert config ─────────────────────────────────────────────────────────
  async function upsertConfigs(chaves: string[], setSaving: (v: boolean) => void) {
    setSaving(true)
    const payload = chaves.map((chave) => ({
      chave,
      valor: configs[chave] ?? '',
    }))
    const { error } = await supabase
      .from('configuracoes')
      .upsert(payload, { onConflict: 'chave' })
    setSaving(false)
    if (error) toast.error('Erro ao salvar: ' + error.message)
    else toast.success('Configurações salvas!')
  }

  // ─── salvar empresa ────────────────────────────────────────────────────────
  async function handleSaveEmpresa() {
    await upsertConfigs(EMPRESA_FIELDS.map((f) => f.chave), setSavingEmpresa)
  }

  // ─── salvar parâmetros ─────────────────────────────────────────────────────
  async function handleSaveParams() {
    await upsertConfigs(PARAMS.map((p) => p.chave), setSavingParams)
  }

  // ─── salvar perfil ─────────────────────────────────────────────────────────
  async function handleSaveProfile(profile: Profile) {
    setSavingProfileId(profile.id)
    const { error } = await supabase
      .from('profiles')
      .update({ role: profile.role, ativo: profile.ativo })
      .eq('id', profile.id)
    setSavingProfileId(null)
    if (error) toast.error('Erro ao salvar usuário: ' + error.message)
    else toast.success('Usuário atualizado!')
  }

  function updateProfile(id: string, field: keyof Profile, value: string | boolean) {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    )
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader
        title="Configurações"
        subtitle="Parâmetros e configurações do sistema ConstrutorRH"
        action={<Settings className="w-5 h-5 text-muted-foreground" />}
      />

      {loadingConfigs ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="empresa" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="empresa" className="gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Empresa
            </TabsTrigger>
            <TabsTrigger value="parametros" className="gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Parâmetros de Pagamento
            </TabsTrigger>
            <TabsTrigger
              value="usuarios"
              className="gap-1.5"
              onClick={() => {
                if (profiles.length === 0) fetchProfiles()
              }}
            >
              <Users className="w-3.5 h-3.5" /> Usuários
            </TabsTrigger>
          </TabsList>

          {/* ── Tab Empresa ────────────────────────────────────────────── */}
          <TabsContent value="empresa">
            <div className="bg-card border border-border rounded-xl p-6 max-w-xl">
              <h2 className="font-semibold text-base mb-1">Dados da Empresa</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Informações da empresa exibidas nos relatórios e documentos.
              </p>
              <Separator className="mb-5" />
              <div className="space-y-4">
                {EMPRESA_FIELDS.map((field) => (
                  <div key={field.chave}>
                    <Label htmlFor={field.chave}>{field.label}</Label>
                    <Input
                      id={field.chave}
                      value={configs[field.chave] ?? ''}
                      onChange={(e) => setConfig(field.chave, e.target.value)}
                      placeholder={field.placeholder}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSaveEmpresa} disabled={savingEmpresa}>
                  {savingEmpresa ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Salvando…</>
                  ) : (
                    <><Save className="w-4 h-4 mr-1.5" /> Salvar Empresa</>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab Parâmetros ─────────────────────────────────────────── */}
          <TabsContent value="parametros">
            <div className="bg-card border border-border rounded-xl p-6 max-w-xl">
              <h2 className="font-semibold text-base mb-1">Parâmetros de Pagamento</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Valores utilizados nos cálculos automáticos de folha, FGTS e VT.
              </p>
              <Separator className="mb-5" />
              <div className="space-y-5">
                {PARAMS.map((param) => (
                  <div key={param.chave}>
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor={param.chave}>{param.label}</Label>
                      {param.sufixo && (
                        <span className="text-xs text-muted-foreground">{param.sufixo}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">{param.descricao}</p>
                    <Input
                      id={param.chave}
                      type={param.tipo}
                      step="0.01"
                      value={configs[param.chave] ?? ''}
                      onChange={(e) => setConfig(param.chave, e.target.value)}
                      className="mt-1"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSaveParams} disabled={savingParams}>
                  {savingParams ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Salvando…</>
                  ) : (
                    <><Save className="w-4 h-4 mr-1.5" /> Salvar Parâmetros</>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab Usuários ───────────────────────────────────────────── */}
          <TabsContent value="usuarios">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-base">Gerenciamento de Usuários</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Ajuste os papéis e status de acesso de cada usuário.
                </p>
              </div>

              {loadingProfiles ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Users className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left font-medium px-6 py-3">Nome</th>
                      <th className="text-left font-medium px-4 py-3">E-mail</th>
                      <th className="text-left font-medium px-4 py-3">Papel</th>
                      <th className="text-center font-medium px-4 py-3">Ativo</th>
                      <th className="text-right font-medium px-6 py-3">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((profile) => (
                      <tr key={profile.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-6 py-3 font-medium">{profile.nome ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{profile.email ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Select
                            value={profile.role ?? 'user'}
                            onValueChange={(v) => updateProfile(profile.id, 'role', v)}
                          >
                            <SelectTrigger className="h-8 w-32 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="rh">RH</SelectItem>
                              <SelectItem value="gestor">Gestor</SelectItem>
                              <SelectItem value="user">Usuário</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            checked={profile.ativo}
                            onCheckedChange={(checked) => updateProfile(profile.id, 'ativo', checked)}
                          />
                        </td>
                        <td className="px-6 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveProfile(profile)}
                            disabled={savingProfileId === profile.id}
                          >
                            {savingProfileId === profile.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <><Save className="w-3.5 h-3.5 mr-1" /> Salvar</>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
