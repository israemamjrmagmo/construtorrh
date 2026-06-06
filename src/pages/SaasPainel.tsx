/**
 * SaasPainel.tsx — Painel Administrativo SaaS
 * Acesso exclusivo: admin master (magmodrive@gmail.com)
 * Gerencia todas as empresas, usuários master e planos da plataforma
 */
import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseV2 } from '@/lib/supabase-v2'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  Building2, Plus, Pencil, Power, PowerOff, Search, Users, Shield,
  Crown, Package, Loader2, RefreshCw, UserPlus, Trash2, CheckCircle2,
  XCircle, LayoutDashboard, Settings, ChevronRight, Globe, Mail,
  Phone, MapPin, Calendar, BarChart3, Star, Key, LogOut,
, Database} from 'lucide-react'
import { toast } from 'sonner'

async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}



// ─── Tipos ────────────────────────────────────────────────────────────────────
type Empresa = {
  id: string; created_at: string; nome: string; cnpj: string | null
  email: string | null; telefone: string | null; endereco: string | null
  cidade: string | null; estado: string | null
  plano: 'basico' | 'profissional' | 'enterprise'; ativo: boolean
  _vinculos: number; _usuarios: number; _master: string | null
}

type EmpresaUsuario = {
  id: string; user_id: string; nome: string | null; email: string | null
  role: string; ativo: boolean; created_at: string
}

type FormEmpresa = {
  nome: string; cnpj: string; email: string; telefone: string
  endereco: string; cidade: string; estado: string
  plano: 'basico' | 'profissional' | 'enterprise'; observacoes: string
}

type FormUsuario = { nome: string; email: string; role: string }

const EMPTY_EMP: FormEmpresa = {
  nome: '', cnpj: '', email: '', telefone: '',
  endereco: '', cidade: '', estado: '', plano: 'profissional', observacoes: '',
}
const EMPTY_USR: FormUsuario = { nome: '', email: '', role: 'rh' }

// ─── Constantes visuais ───────────────────────────────────────────────────────
const PLANO: Record<string, { label: string; cor: string; bg: string; icon: React.ElementType }> = {
  basico:       { label: 'Básico',       cor: '#64748b', bg: '#f1f5f9', icon: Package  },
  profissional: { label: 'Profissional', cor: '#0369a1', bg: '#e0f2fe', icon: Shield   },
  enterprise:   { label: 'Enterprise',   cor: '#7c3aed', bg: '#f5f3ff', icon: Crown    },
}

const ROLE: Record<string, { label: string; cor: string }> = {
  master_empresa: { label: '👑 Master',       cor: '#7c3aed' },
  gestor:         { label: '🏗️ Gestor',        cor: '#0369a1' },
  rh:             { label: '📋 RH',            cor: '#16a34a' },
  almoxarifado:   { label: '📦 Almoxarifado',  cor: '#d97706' },
  financeiro:     { label: '💰 Financeiro',    cor: '#059669' },
  colaborador:    { label: '👷 Colaborador',   cor: '#64748b' },
}

const fmtCNPJ = (v: string | null) => {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : v
}
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

// ═══════════════════════════════════════════════════════════════════════════════
// ── Componente de Migração inline ────────────────────────────────────────────
import { supabaseV1 } from '@/lib/supabase-v1'

function MigracaoEmpresa({ empresaId, empresaNome }: { empresaId: string; empresaNome: string }) {
  const [log, setLog]     = React.useState<string[]>([])
  const [running, setRunning] = React.useState(false)
  const [done, setDone]   = React.useState(false)

  const addLog = (msg: string) => setLog(prev => [...prev, msg])

  const iniciar = async () => {
    if (!empresaId) return toast.error('Selecione uma empresa primeiro')
    setRunning(true); setDone(false); setLog([])
    addLog(`🚀 Iniciando migração para ${empresaNome} (${empresaId})`)

    try {
      // 1. Funcoes
      addLog('📋 Migrando funções...')
      const { data: fns } = await supabaseV1.from('funcoes').select('*')
      if (fns?.length) {
        const batch = fns.map((f: any) => ({ empresa_id: empresaId, id_legado: f.id, nome: f.nome, sigla: f.sigla, descricao: f.descricao, cbo: f.cbo, valor_hora_clt: f.valor_hora_clt, valor_hora_autonomo: f.valor_hora_autonomo, ativo: f.ativo ?? true }))
        const { error } = await supabaseV2.from('funcoes_v2').upsert(batch, { onConflict: 'empresa_id,id_legado', ignoreDuplicates: false })
        addLog(error ? `❌ Funções: ${error.message}` : `✅ ${fns.length} funções migradas`)
      }

      // 2. Obras
      addLog('🏗️ Migrando obras...')
      const { data: obs } = await supabaseV1.from('obras').select('*')
      if (obs?.length) {
        const batch = obs.map((o: any) => ({ empresa_id: empresaId, id_legado: o.id, nome: o.nome, codigo: o.codigo, endereco: o.endereco, cidade: o.cidade, estado: o.estado, cliente: o.cliente, responsavel: o.responsavel, data_inicio: o.data_inicio, data_previsao_fim: o.data_previsao_fim, status: o.status ?? 'em_andamento', considera_sabado_util: o.considera_sabado_util ?? false, desconta_vt: o.desconta_vt ?? true, ativo: true }))
        const { error } = await supabaseV2.from('obras_v2').upsert(batch, { onConflict: 'empresa_id,id_legado', ignoreDuplicates: false })
        addLog(error ? `❌ Obras: ${error.message}` : `✅ ${obs.length} obras migradas`)
      }

      // 3. Colaboradores (pessoas + vinculos)
      addLog('👷 Migrando colaboradores...')
      const { data: cols } = await supabaseV1.from('colaboradores').select('*')
      if (cols?.length) {
        // Buscar mapa funcoes e obras do V2
        const { data: fnsV2 } = await supabaseV2.from('funcoes_v2').select('id, id_legado').eq('empresa_id', empresaId)
        const { data: obsV2 } = await supabaseV2.from('obras_v2').select('id, id_legado').eq('empresa_id', empresaId)
        const fMap: Record<string,string> = {}; (fnsV2??[]).forEach((f:any) => { if(f.id_legado) fMap[f.id_legado] = f.id })
        const oMap: Record<string,string> = {}; (obsV2??[]).forEach((o:any) => { if(o.id_legado) oMap[o.id_legado] = o.id })

        let ok = 0, err = 0
        for (const c of cols) {
          const { data: p, error: pe } = await supabaseV2.from('pessoas').upsert({ nome: c.nome, cpf: c.cpf, pis_nit: c.pis_nit, data_nascimento: c.data_nascimento, genero: c.genero, estado_civil: c.estado_civil, telefone: c.telefone, email: c.email, endereco: c.endereco, cidade: c.cidade, estado: c.estado, cep: c.cep }, { onConflict: 'cpf', ignoreDuplicates: false }).select('id').single()
          if (pe || !p) { err++; continue }
          const { error: ve } = await supabaseV2.from('vinculos_empregaticos').upsert({ empresa_id: empresaId, pessoa_id: p.id, id_legado: c.id, funcao_id: fMap[c.funcao_id] ?? null, obra_id: oMap[c.obra_id] ?? null, status: c.status ?? 'ativo', tipo_contrato: c.tipo_contrato, chapa: c.chapa, salario: c.salario, data_admissao: c.data_admissao, data_demissao: c.data_demissao, vale_transporte: c.vale_transporte ?? false, banco: c.banco, agencia: c.agencia, conta: c.conta, tipo_conta: c.tipo_conta, pix_chave: c.pix_chave, pix_tipo: c.pix_tipo }, { onConflict: 'empresa_id,id_legado', ignoreDuplicates: false })
          if (ve) err++; else ok++
        }
        addLog(`✅ ${ok} colaboradores migrados${err ? `, ❌ ${err} erros` : ''}`)
      }

      // 4. Ponto Lançamentos
      addLog('📊 Migrando lançamentos de ponto...')
      const { data: lancs } = await supabaseV1.from('ponto_lancamentos').select('*')
      if (lancs?.length) {
        const { data: vincsV2 } = await supabaseV2.from('vinculos_empregaticos').select('id, id_legado').eq('empresa_id', empresaId)
        const { data: obsV2b } = await supabaseV2.from('obras_v2').select('id, id_legado').eq('empresa_id', empresaId)
        const vMap: Record<string,string> = {}; (vincsV2??[]).forEach((v:any) => { if(v.id_legado) vMap[v.id_legado] = v.id })
        const oMap2: Record<string,string> = {}; (obsV2b??[]).forEach((o:any) => { if(o.id_legado) oMap2[o.id_legado] = o.id })
        const BATCH = 50; let ok = 0
        for (let i = 0; i < lancs.length; i += BATCH) {
          const batch = lancs.slice(i, i+BATCH)
            .filter((l:any) => vMap[l.colaborador_id])
            .map((l:any) => ({ empresa_id: empresaId, id_legado: l.id, colaborador_id: vMap[l.colaborador_id], obra_id: oMap2[l.obra_id] ?? null, mes_referencia: l.mes_referencia, data_inicio: l.data_inicio, data_fim: l.data_fim, status: l.status, tipo_pagamento: l.tipo_pagamento, snap_liquido: l.snap_liquido, snap_valor_total: l.snap_valor_total, snap_horas_normais: l.snap_horas_normais, snap_horas_extras: l.snap_horas_extras, snap_valor_horas: l.snap_valor_horas, snap_valor_dsr: l.snap_valor_dsr, snap_valor_producao: l.snap_valor_producao, snap_valor_premio: l.snap_valor_premio, snap_inss: l.snap_inss, snap_ir: l.snap_ir, snap_desconto_vt: l.snap_desconto_vt, snap_desconto_adiant: l.snap_desconto_adiant, snap_liquido: l.snap_liquido }))
          if (batch.length) { const { error } = await supabaseV2.from('ponto_lancamentos_v2').upsert(batch, { onConflict: 'empresa_id,id_legado', ignoreDuplicates: false }); if(!error) ok += batch.length }
        }
        addLog(`✅ ${ok} lançamentos migrados`)
      }

      // 5. Ponto Registros
      addLog('⏱️ Migrando registros de ponto...')
      const { data: regs } = await supabaseV1.from('ponto_registros').select('*')
      if (regs?.length) {
        const { data: vincsV2b } = await supabaseV2.from('vinculos_empregaticos').select('id, id_legado').eq('empresa_id', empresaId)
        const { data: lancsV2 } = await supabaseV2.from('ponto_lancamentos_v2').select('id, id_legado').eq('empresa_id', empresaId)
        const vMap2: Record<string,string> = {}; (vincsV2b??[]).forEach((v:any) => { if(v.id_legado) vMap2[v.id_legado] = v.id })
        const lMap: Record<string,string> = {}; (lancsV2??[]).forEach((l:any) => { if(l.id_legado) lMap[l.id_legado] = l.id })
        const BATCH = 100; let ok = 0
        for (let i = 0; i < regs.length; i += BATCH) {
          const batch = regs.slice(i, i+BATCH)
            .filter((r:any) => vMap2[r.colaborador_id] && lMap[r.lancamento_id])
            .map((r:any) => ({ empresa_id: empresaId, id_legado: r.id, colaborador_id: vMap2[r.colaborador_id], lancamento_id: lMap[r.lancamento_id], data: r.data, presente: r.presente, falta: r.falta, hora_entrada: r.hora_entrada, hora_saida: r.hora_saida, horas_trabalhadas: r.horas_trabalhadas, horas_extras: r.horas_extras, status: r.status ?? 'pendente' }))
          if (batch.length) { const { error } = await supabaseV2.from('ponto_registros_v2').upsert(batch, { onConflict: 'empresa_id,id_legado', ignoreDuplicates: false }); if(!error) ok += batch.length }
        }
        addLog(`✅ ${ok} registros de ponto migrados`)
      }

      addLog('🎉 Migração concluída!')
      setDone(true)
    } catch (e: any) {
      addLog(`❌ Erro fatal: ${e.message}`)
    }
    setRunning(false)
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>🔄 Migração V1 → V2</p>
        <p style={{ fontSize: 12, color: '#3b82f6' }}>Empresa: <strong>{empresaNome}</strong></p>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Importa funções, obras, colaboradores, lançamentos e registros de ponto do banco V1 para esta empresa no V2.</p>
      </div>
      <Button onClick={iniciar} disabled={running || !empresaId} className="w-full mb-4" size="sm">
        {running ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Migrando...</> : done ? '✅ Concluído — Migrar Novamente' : '🚀 Iniciar Migração'}
      </Button>
      {log.length > 0 && (
        <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, maxHeight: 300, overflowY: 'auto' }}>
          {log.map((l, i) => <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: l.startsWith('❌') ? '#f87171' : l.startsWith('✅') ? '#4ade80' : l.startsWith('🎉') ? '#fbbf24' : '#94a3b8', marginBottom: 2 }}>{l}</div>)}
        </div>
      )}
    </div>
  )
}


export default function SaasPainel() {
  // ── Navegação ──────────────────────────────────────────────────────────────
  const navigate = useNavigate()

  const handleSaasLogout = () => {
    localStorage.removeItem('saas_admin_token')
    navigate('/saas-login')
  }

  // ── Estado global ──────────────────────────────────────────────────────────
  const [empresas,       setEmpresas]       = useState<Empresa[]>([])
  const [loading,        setLoading]        = useState(true)
  const [busca,          setBusca]          = useState('')
  const [empresaSel,     setEmpresaSel]     = useState<Empresa | null>(null)

  // Modais empresa
  const [modalEmp,       setModalEmp]       = useState(false)
  const [editEmp,        setEditEmp]        = useState<Empresa | null>(null)
  const [formEmp,        setFormEmp]        = useState<FormEmpresa>(EMPTY_EMP)
  const [savingEmp,      setSavingEmp]      = useState(false)
  const [toggleEmp,      setToggleEmp]      = useState<Empresa | null>(null)

  // Usuários da empresa selecionada
  const [usuarios,       setUsuarios]       = useState<EmpresaUsuario[]>([])
  const [loadingUsr,     setLoadingUsr]     = useState(false)
  const [modalUsr,       setModalUsr]       = useState(false)
  const [formUsr,        setFormUsr]        = useState<FormUsuario>(EMPTY_USR)
  const [savingUsr,      setSavingUsr]      = useState(false)
  const [deleteUsr,      setDeleteUsr]      = useState<EmpresaUsuario | null>(null)

  // ── KPIs globais ──────────────────────────────────────────────────────────
  const kpi = {
    total:   empresas.length,
    ativas:  empresas.filter(e => e.ativo).length,
    colabs:  empresas.reduce((s, e) => s + e._vinculos, 0),
    usuarios:empresas.reduce((s, e) => s + e._usuarios, 0),
  }

  // ── Carregar empresas ─────────────────────────────────────────────────────
  const fetchEmpresas = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabaseV2.from('empresas').select('*').order('created_at', { ascending: false })
    if (error) { toast.error('Erro: ' + error.message); setLoading(false); return [] }

    const enriched = await Promise.all((data ?? []).map(async (e: Empresa) => {
      const [vRes, uRes, mRes] = await Promise.all([
        supabaseV2.from('vinculos_empregaticos').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id).eq('status', 'ativo'),
        supabaseV2.from('empresa_usuarios').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id).eq('ativo', true),
        supabaseV2.from('empresa_usuarios').select('email, nome').eq('empresa_id', e.id).eq('role', 'master_empresa').eq('ativo', true).limit(1),
      ])
      const master = mRes.data?.[0]
      return {
        ...e,
        _vinculos: vRes.count ?? 0,
        _usuarios: uRes.count ?? 0,
        _master: master ? (master.email ?? master.nome ?? '—') : null,
      }
    }))
    setEmpresas(enriched)
    setLoading(false)
    return enriched
  }, [])

  useEffect(() => { fetchEmpresas() }, [fetchEmpresas])

  // ── Carregar usuários da empresa selecionada ──────────────────────────────
  const fetchUsuarios = useCallback(async (empId: string) => {
    setLoadingUsr(true)
    const { data } = await supabaseV2
      .from('empresa_usuarios').select('*').eq('empresa_id', empId).order('created_at')
    setUsuarios((data ?? []) as EmpresaUsuario[])
    setLoadingUsr(false)
  }, [])

  useEffect(() => {
    if (empresaSel) fetchUsuarios(empresaSel.id)
  }, [empresaSel, fetchUsuarios])

  // ── Salvar empresa ────────────────────────────────────────────────────────
  async function salvarEmpresa() {
    if (!formEmp.nome.trim()) { toast.error('Nome obrigatório'); return }
    setSavingEmp(true)
    const payload = {
      nome: formEmp.nome.trim(), cnpj: formEmp.cnpj.replace(/\D/g, '') || null,
      email: formEmp.email || null, telefone: formEmp.telefone || null,
      endereco: formEmp.endereco || null, cidade: formEmp.cidade || null,
      estado: formEmp.estado?.toUpperCase() || null, plano: formEmp.plano,
      configuracoes: formEmp.observacoes ? { observacoes: formEmp.observacoes } : null,
    }
    const { error } = editEmp
      ? await supabaseV2.from('empresas').update(payload).eq('id', editEmp.id)
      : await supabaseV2.from('empresas').insert({ ...payload, ativo: true })
    setSavingEmp(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editEmp ? '✅ Empresa atualizada!' : '🏢 Empresa cadastrada!')
    const reselectId = editEmp?.id ?? null
    setModalEmp(false)
    const enriched = await fetchEmpresas()
    if (reselectId && enriched) {
      const updated = enriched.find((e: Empresa) => e.id === reselectId)
      if (updated) setEmpresaSel(updated)
    }
  }

  // ── Toggle ativo empresa ──────────────────────────────────────────────────
  async function confirmarToggle() {
    if (!toggleEmp) return
    await supabaseV2.from('empresas').update({ ativo: !toggleEmp.ativo }).eq('id', toggleEmp.id)
    toast.success(toggleEmp.ativo ? '⛔ Empresa desativada' : '✅ Empresa ativada')
    setToggleEmp(null)
    fetchEmpresas()
  }

  // ── Salvar usuário ────────────────────────────────────────────────────────
  async function salvarUsuario() {
    if (!empresaSel) return
    if (!formUsr.email.trim()) { toast.error('E-mail obrigatório'); return }
    if (!formUsr.nome.trim())  { toast.error('Nome obrigatório'); return }

    // Se for master_empresa, verificar se já existe outro master
    if (formUsr.role === 'master_empresa') {
      const jaExiste = usuarios.find(u => u.role === 'master_empresa' && u.ativo)
      if (jaExiste) {
        toast.error(`Já existe um usuário Master nesta empresa: ${jaExiste.email ?? jaExiste.nome}. Remova-o antes de definir um novo.`)
        return
      }
    }

    setSavingUsr(true)
    const emailFinal = formUsr.email.trim().toLowerCase()
    const cnpjDigits = (empresaSel.cnpj ?? '').replace(/\D/g, '')
    const senhaDefault = cnpjDigits.substring(0, 6) || '123456'

    // 1. Criar no Supabase Auth (permite login direto pelo /#/login)
    const { data: authData, error: authError } = await supabaseV2.auth.signUp({
      email:    emailFinal,
      password: senhaDefault,
    })
    if (authError && !authError.message.includes('already registered')) {
      toast.error('Erro ao criar acesso: ' + authError.message)
      setSavingUsr(false)
      return
    }
    const authUserId = authData?.user?.id ?? crypto.randomUUID()

    // 2. Inserir metadados em empresa_usuarios
    const payload = {
      empresa_id:      empresaSel.id,
      nome:            formUsr.nome.trim(),
      email:           emailFinal,
      role:            formUsr.role,
      ativo:           true,
      user_id:         authUserId,
      primeiro_acesso: true,
    }
    const { error } = await supabaseV2.from('empresa_usuarios').insert(payload)
    setSavingUsr(false)
    if (error) { toast.error('Erro ao salvar metadados: ' + error.message); return }
    toast.success(`✅ Usuário criado! Senha padrão: ${senhaDefault}`)
    setModalUsr(false)
    setFormUsr(EMPTY_USR)
    fetchUsuarios(empresaSel.id)
    fetchEmpresas()
  }

  // ── Remover usuário ───────────────────────────────────────────────────────
  async function confirmarDeleteUsr() {
    if (!deleteUsr || !empresaSel) return
    await supabaseV2.from('empresa_usuarios').delete().eq('id', deleteUsr.id)
    toast.success('Usuário removido')
    setDeleteUsr(null)
    fetchUsuarios(empresaSel.id)
    fetchEmpresas()
  }

  // ── Toggle ativo usuário ──────────────────────────────────────────────────
  async function toggleUsuario(usr: EmpresaUsuario) {
    await supabaseV2.from('empresa_usuarios').update({ ativo: !usr.ativo }).eq('id', usr.id)
    fetchUsuarios(empresaSel!.id)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const filtradas = empresas.filter(e =>
    !busca || e.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (e.cnpj ?? '').includes(busca) || (e.cidade ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  const setEmp = (k: keyof FormEmpresa) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormEmp(f => ({ ...f, [k]: ev.target.value }))

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Topbar SaaS ──────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '0 24px',
        height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={16} color="white" />
          </div>
          <div>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>ConstrutorRH</span>
            <span style={{ color: '#6366f1', fontWeight: 600, fontSize: 12, marginLeft: 8 }}>Painel SaaS</span>
          </div>
        </div>
        <button
          onClick={handleSaasLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, padding: '6px 14px', color: '#94a3b8',
            cursor: 'pointer', fontSize: 13, fontWeight: 500,
          }}
        >
          <LogOut size={14} />
          Sair
        </button>
      </div>

      {/* ── Conteúdo original ────────────────────────────── */}
      <div style={{ padding: 24 }}>
        <div className="flex h-[calc(100vh-56px)] overflow-hidden">

          {/* ══ COLUNA ESQUERDA — Lista de empresas ══════════════════════════════ */}
          <div className="w-80 border-r bg-gray-50 flex flex-col shrink-0">
            {/* Header */}
            <div className="p-4 border-b bg-white">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-600" /> Empresas
                  <span className="ml-1 text-xs font-normal text-gray-400">({kpi.total})</span>
                </h2>
                <Button size="sm" onClick={() => { setEditEmp(null); setFormEmp(EMPTY_EMP); setModalEmp(true) }}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Nova
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar empresa…" className="pl-8 h-8 text-sm" />
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : filtradas.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhuma empresa
                </div>
              ) : filtradas.map(emp => {
                const pl = PLANO[emp.plano] ?? PLANO.basico
                const PlanoIco = pl.icon
                const selected = empresaSel?.id === emp.id
                return (
                  <button
                    key={emp.id}
                    onClick={() => setEmpresaSel(emp)}
                    className={`w-full text-left p-3 border-b transition-colors hover:bg-indigo-50 ${selected ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{emp.nome}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{fmtCNPJ(emp.cnpj)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {emp.ativo
                          ? <span className="w-2 h-2 rounded-full bg-green-500 mt-1" title="Ativa" />
                          : <span className="w-2 h-2 rounded-full bg-gray-400 mt-1" title="Inativa" />}
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ color: pl.cor, background: pl.bg }}>
                          {pl.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-gray-500 flex items-center gap-0.5">
                        <Users className="w-3 h-3" /> {emp._vinculos}
                      </span>
                      {emp._master && (
                        <span className="text-xs text-indigo-600 flex items-center gap-0.5 truncate">
                          <Crown className="w-3 h-3 shrink-0" />
                          <span className="truncate">{emp._master}</span>
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* KPIs rodapé */}
            <div className="border-t bg-white p-3 grid grid-cols-2 gap-2">
              <div className="text-center">
                <p className="text-lg font-bold text-green-600">{kpi.ativas}</p>
                <p className="text-[10px] text-gray-400">Ativas</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-blue-600">{kpi.colabs}</p>
                <p className="text-[10px] text-gray-400">Colaboradores</p>
              </div>
            </div>
          </div>

          {/* ══ COLUNA DIREITA — Detalhe da empresa ══════════════════════════════ */}
          <div className="flex-1 overflow-y-auto bg-white">
            {!empresaSel ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <LayoutDashboard className="w-16 h-16 mb-4 opacity-20" />
                <p className="font-semibold text-lg">Selecione uma empresa</p>
                <p className="text-sm mt-1">Clique em uma empresa na lista para gerenciá-la</p>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Cabeçalho empresa */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-indigo-600" />
                      </div>
                      <div>
                        <h1 className="text-xl font-bold text-gray-900">{empresaSel.nome}</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                          {(() => { const pl = PLANO[empresaSel.plano] ?? PLANO.basico; const I = pl.icon; return (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                              style={{ color: pl.cor, background: pl.bg }}>
                              <I className="w-3 h-3" /> {pl.label}
                            </span>
                          )})()}
                          {empresaSel.ativo
                            ? <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">● Ativa</Badge>
                            : <Badge className="bg-gray-100 text-gray-600 border-gray-300 text-xs">● Inativa</Badge>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditEmp(empresaSel)
                      setFormEmp({
                        nome: empresaSel.nome, cnpj: empresaSel.cnpj ?? '',
                        email: empresaSel.email ?? '', telefone: empresaSel.telefone ?? '',
                        endereco: empresaSel.endereco ?? '', cidade: empresaSel.cidade ?? '',
                        estado: empresaSel.estado ?? '', plano: empresaSel.plano, observacoes: '',
                      })
                      setModalEmp(true)
                    }}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline"
                      className={empresaSel.ativo ? 'text-red-600 border-red-300' : 'text-green-600 border-green-300'}
                      onClick={() => setToggleEmp(empresaSel)}>
                      {empresaSel.ativo ? <><PowerOff className="w-3.5 h-3.5 mr-1" /> Desativar</> : <><Power className="w-3.5 h-3.5 mr-1" /> Ativar</>}
                    </Button>
                    <Button size="sm" variant="outline" onClick={fetchEmpresas}>
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <Tabs defaultValue="usuarios">
                  <TabsList>
                    <TabsTrigger value="usuarios"><Users className="w-3.5 h-3.5 mr-1" /> Usuários</TabsTrigger>
                    <TabsTrigger value="info"><Settings className="w-3.5 h-3.5 mr-1" /> Informações</TabsTrigger>
                    <TabsTrigger value="stats"><BarChart3 className="w-3.5 h-3.5 mr-1" /> Estatísticas</TabsTrigger>
                    <TabsTrigger value="migracao"><Database className="w-3.5 h-3.5 mr-1" /> Migração V2</TabsTrigger>
                  </TabsList>

                  {/* ── ABA USUÁRIOS ─────────────────────────────────────────── */}
                  <TabsContent value="usuarios" className="mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-800">Usuários da Empresa</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Define quem acessa o sistema e com qual permissão.
                          O <strong>Master da Empresa</strong> tem controle total sobre os dados dela.
                        </p>
                      </div>
                      <Button size="sm" onClick={() => { setFormUsr(EMPTY_USR); setModalUsr(true) }}>
                        <UserPlus className="w-3.5 h-3.5 mr-1" /> Adicionar Usuário
                      </Button>
                    </div>

                    {/* Aviso se não tem master */}
                    {!usuarios.find(u => u.role === 'master_empresa' && u.ativo) && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                        <Crown className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-semibold text-amber-800">Esta empresa não tem usuário Master</p>
                          <p className="text-amber-700 text-xs mt-0.5">
                            Adicione um usuário com role <strong>Master da Empresa</strong> para que ela possa ser gerenciada de forma independente.
                          </p>
                        </div>
                      </div>
                    )}

                    {loadingUsr ? (
                      <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
                    ) : usuarios.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Nenhum usuário cadastrado</p>
                        <Button size="sm" variant="outline" className="mt-3" onClick={() => { setFormUsr(EMPTY_USR); setModalUsr(true) }}>
                          <UserPlus className="w-3.5 h-3.5 mr-1" /> Adicionar primeiro usuário
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {usuarios.map(usr => {
                          const r = ROLE[usr.role] ?? { label: usr.role, cor: '#64748b' }
                          return (
                            <div key={usr.id}
                              className={`flex items-center justify-between p-3 rounded-xl border ${!usr.ativo ? 'opacity-50 bg-gray-50' : 'bg-white'}`}>
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700">
                                  {(usr.nome ?? usr.email ?? '?')[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-sm text-gray-900">{usr.nome ?? '—'}</p>
                                  <p className="text-xs text-gray-400">{usr.email ?? '—'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold px-2 py-1 rounded-full border"
                                  style={{ color: r.cor, borderColor: r.cor + '40', background: r.cor + '10' }}>
                                  {r.label}
                                </span>
                                {usr.ativo
                                  ? <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">Ativo</Badge>
                                  : <Badge className="bg-gray-100 text-gray-600 border-gray-300 text-xs">Inativo</Badge>}
                                <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                                  onClick={() => toggleUsuario(usr)} title={usr.ativo ? 'Desativar' : 'Ativar'}>
                                  {usr.ativo ? <PowerOff className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                                </Button>
                                <Button size="sm" variant="outline"
                                  className="h-7 w-7 p-0 text-red-500 border-red-200 hover:bg-red-50"
                                  onClick={() => setDeleteUsr(usr)} title="Remover">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Legenda de roles */}
                    <div className="mt-6 p-4 bg-gray-50 rounded-xl border">
                      <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Perfis de Acesso</p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(ROLE).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-2 text-xs">
                            <span className="font-semibold" style={{ color: val.cor }}>{val.label}</span>
                            <span className="text-gray-400">—</span>
                            <span className="text-gray-500">
                              {key === 'master_empresa' ? 'Controle total da empresa' :
                               key === 'gestor'         ? 'Aprovar lançamentos e obras' :
                               key === 'rh'             ? 'Cadastros e lançamentos' :
                               key === 'almoxarifado'   ? 'EPIs e estoque' :
                               key === 'financeiro'     ? 'Pagamentos e conferências' :
                                                         'Portal do colaborador'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* ── ABA INFORMAÇÕES ──────────────────────────────────────── */}
                  <TabsContent value="info" className="mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'CNPJ',       icon: Key,     value: fmtCNPJ(empresaSel.cnpj) },
                        { label: 'E-mail',     icon: Mail,    value: empresaSel.email ?? '—' },
                        { label: 'Telefone',   icon: Phone,   value: empresaSel.telefone ?? '—' },
                        { label: 'Cidade/UF',  icon: MapPin,  value: empresaSel.cidade && empresaSel.estado ? `${empresaSel.cidade} / ${empresaSel.estado}` : empresaSel.cidade ?? empresaSel.estado ?? '—' },
                        { label: 'Endereço',   icon: MapPin,  value: empresaSel.endereco ?? '—' },
                        { label: 'Cadastrada', icon: Calendar,value: fmtDate(empresaSel.created_at) },
                      ].map(item => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50">
                            <div className="w-8 h-8 rounded-lg bg-white border flex items-center justify-center shrink-0">
                              <Icon className="w-4 h-4 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase">{item.label}</p>
                              <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-4 p-3 rounded-lg border bg-gray-50 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border flex items-center justify-center">
                        <Star className="w-4 h-4 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase">ID Interno (V2)</p>
                        <p className="text-xs font-mono text-gray-600 mt-0.5">{empresaSel.id}</p>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ── ABA ESTATÍSTICAS ─────────────────────────────────────── */}
                  <TabsContent value="stats" className="mt-4">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      {[
                        { label: 'Colaboradores Ativos', value: empresaSel._vinculos, cor: '#0369a1', bg: '#e0f2fe' },
                        { label: 'Usuários do Sistema',  value: empresaSel._usuarios, cor: '#16a34a', bg: '#dcfce7' },
                        { label: 'Plano Atual',          value: PLANO[empresaSel.plano]?.label ?? '—', cor: '#7c3aed', bg: '#f5f3ff' },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl p-4 text-center border"
                          style={{ background: s.bg, borderColor: s.cor + '30' }}>
                          <p className="text-2xl font-bold" style={{ color: s.cor }}>{s.value}</p>
                          <p className="text-xs text-gray-600 mt-1">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-sm text-indigo-700">
                      <p className="font-semibold mb-1">📊 Dados do banco V2</p>
                      <p className="text-xs">Os dados completos de fechamentos, relatórios e histórico financeiro estarão disponíveis após a migração de dados via <strong>Migração V2</strong>.</p>
                    </div>
                  </TabsContent>

                  {/* ── ABA MIGRAÇÃO V2 ─────────────────────────────────────── */}
                  <TabsContent value="migracao" className="mt-4">
                    <MigracaoEmpresa empresaId={empresaSel?.id ?? ''} empresaNome={empresaSel?.nome ?? ''} />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>

          {/* ══ MODAL: Criar / Editar Empresa ════════════════════════════════════ */}
          <Dialog open={modalEmp} onOpenChange={setModalEmp}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  {editEmp ? 'Editar Empresa' : 'Nova Empresa'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>Nome da Empresa *</Label>
                  <Input value={formEmp.nome} onChange={setEmp('nome')} placeholder="Magmo Construções Ltda" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>CNPJ</Label><Input value={formEmp.cnpj} onChange={setEmp('cnpj')} placeholder="XX.XXX.XXX/XXXX-XX" className="mt-1" /></div>
                  <div><Label>Telefone</Label><Input value={formEmp.telefone} onChange={setEmp('telefone')} placeholder="(XX) XXXXX-XXXX" className="mt-1" /></div>
                </div>
                <div><Label>E-mail</Label><Input value={formEmp.email} onChange={setEmp('email')} type="email" placeholder="contato@empresa.com.br" className="mt-1" /></div>
                <div><Label>Endereço</Label><Input value={formEmp.endereco} onChange={setEmp('endereco')} placeholder="Rua, nº, bairro" className="mt-1" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><Label>Cidade</Label><Input value={formEmp.cidade} onChange={setEmp('cidade')} placeholder="São Paulo" className="mt-1" /></div>
                  <div><Label>UF</Label><Input value={formEmp.estado} onChange={setEmp('estado')} maxLength={2} placeholder="SP" className="mt-1 uppercase" /></div>
                </div>
                <div>
                  <Label>Plano</Label>
                  <Select value={formEmp.plano} onValueChange={v => setFormEmp(f => ({ ...f, plano: v as FormEmpresa['plano'] }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLANO).map(([k, v]) => {
                        const I = v.icon
                        return <SelectItem key={k} value={k}><span className="flex items-center gap-2"><I className="w-3.5 h-3.5" style={{ color: v.cor }} />{v.label}</span></SelectItem>
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Observações</Label><Textarea value={formEmp.observacoes} onChange={setEmp('observacoes')} rows={2} placeholder="Informações adicionais…" className="mt-1 resize-none" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModalEmp(false)} disabled={savingEmp}>Cancelar</Button>
                <Button onClick={salvarEmpresa} disabled={savingEmp}>
                  {savingEmp && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editEmp ? 'Salvar Alterações' : 'Cadastrar Empresa'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ══ MODAL: Adicionar Usuário ══════════════════════════════════════════ */}
          <Dialog open={modalUsr} onOpenChange={setModalUsr}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" /> Adicionar Usuário
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
                  <p className="font-semibold">Como funciona?</p>
                  <p className="mt-1">Informe o nome, e-mail e perfil do usuário. Ele receberá acesso ao sistema com as permissões do perfil escolhido. O e-mail deve ser o mesmo usado no login.</p>
                </div>
                <div>
                  <Label>Nome Completo *</Label>
                  <Input value={formUsr.nome} onChange={e => setFormUsr(f => ({ ...f, nome: e.target.value }))}
                    placeholder="João da Silva" className="mt-1" />
                </div>
                <div>
                  <Label>E-mail *</Label>
                  <Input value={formUsr.email} onChange={e => setFormUsr(f => ({ ...f, email: e.target.value }))}
                    type="email" placeholder="joao@empresa.com.br" className="mt-1" />
                </div>
                <div>
                  <Label>Perfil de Acesso *</Label>
                  <Select value={formUsr.role} onValueChange={v => setFormUsr(f => ({ ...f, role: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          <span style={{ color: v.cor, fontWeight: 600 }}>{v.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formUsr.role === 'master_empresa' && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                      <Crown className="w-3 h-3" /> O Master da Empresa tem controle total sobre os dados dela. Só pode haver um por empresa.
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModalUsr(false)} disabled={savingUsr}>Cancelar</Button>
                <Button onClick={salvarUsuario} disabled={savingUsr}>
                  {savingUsr && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Adicionar Usuário
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ══ Confirmar Toggle Empresa ══════════════════════════════════════════ */}
          <AlertDialog open={!!toggleEmp} onOpenChange={() => setToggleEmp(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{toggleEmp?.ativo ? '⛔ Desativar empresa?' : '✅ Ativar empresa?'}</AlertDialogTitle>
                <AlertDialogDescription>
                  {toggleEmp?.ativo
                    ? `Os usuários de "${toggleEmp?.nome}" não conseguirão acessar o sistema.`
                    : `"${toggleEmp?.nome}" será reativada e os usuários poderão acessar normalmente.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmarToggle}
                  className={toggleEmp?.ativo ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}>
                  {toggleEmp?.ativo ? 'Desativar' : 'Ativar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ══ Confirmar Remover Usuário ═════════════════════════════════════════ */}
          <AlertDialog open={!!deleteUsr} onOpenChange={() => setDeleteUsr(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>🗑️ Remover usuário?</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{deleteUsr?.nome ?? deleteUsr?.email}</strong> perderá acesso ao sistema desta empresa. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmarDeleteUsr} className="bg-red-600 hover:bg-red-700">
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

        </div>
      </div>
    </div>
  )
}
