import React, { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { supabaseV2 } from '@/lib/supabase-v2'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/Shared'
import { Badge } from '@/components/ui/badge'
import {
  Database, Play, CheckCircle2, XCircle, Loader2,
  Building2, Users, Package, DollarSign, AlertTriangle,
  ChevronRight, RefreshCw, ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StepStatus = 'idle' | 'running' | 'done' | 'error'

interface MigStep {
  id:       string
  label:    string
  icon:     React.ElementType
  status:   StepStatus
  total:    number
  migrated: number
  error:    string | null
}

const STEPS_INIT: MigStep[] = [
  { id: 'empresa',      label: 'Criar Empresa',           icon: Building2,  status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'pessoas',      label: 'Migrar Pessoas (CPF)',     icon: Users,      status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'vinculos',     label: 'Migrar Vínculos',          icon: Package,    status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'resumos',      label: 'Gerar Resumos Retroativos',icon: DollarSign, status: 'idle', total: 0, migrated: 0, error: null },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MESES_NOM = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'idle')    return <Badge variant="outline" className="text-gray-500">Aguardando</Badge>
  if (status === 'running') return <Badge className="bg-blue-100 text-blue-800 border-blue-300 animate-pulse">⚙️ Executando…</Badge>
  if (status === 'done')    return <Badge className="bg-green-100 text-green-800 border-green-300">✅ Concluído</Badge>
  return                           <Badge className="bg-red-100 text-red-800 border-red-300">❌ Erro</Badge>
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function MigracaoV2() {
  const [steps,        setSteps]        = useState<MigStep[]>(STEPS_INIT)
  const [running,      setRunning]      = useState(false)
  const [done,         setDone]         = useState(false)
  const [empresaId,    setEmpresaId]    = useState<string | null>(null)
  const [nomeEmpresa,  setNomeEmpresa]  = useState('Magmo Construções')
  const [cnpjEmpresa,  setCnpjEmpresa]  = useState('')
  const [logs,         setLogs]         = useState<string[]>([])

  const log = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`, ...prev.slice(0, 199)])
  }

  const upd = (id: string, patch: Partial<MigStep>) =>
    setSteps(s => s.map(x => x.id === id ? { ...x, ...patch } : x))

  // ── STEP 1: Criar empresa ─────────────────────────────────────────────────
  const migrarEmpresa = useCallback(async (): Promise<string | null> => {
    upd('empresa', { status: 'running' })
    log('Criando empresa no banco V2…')
    const { data, error } = await supabaseV2
      .from('empresas')
      .insert({ nome: nomeEmpresa, cnpj: cnpjEmpresa || null, plano: 'profissional', ativo: true })
      .select('id')
      .single()
    if (error) {
      // Empresa pode já existir — tentar buscar pelo nome
      const { data: existing } = await supabaseV2.from('empresas').select('id').eq('nome', nomeEmpresa).single()
      if (existing) {
        log(`⚠️ Empresa já existe — reutilizando id: ${existing.id}`)
        upd('empresa', { status: 'done', migrated: 1, total: 1 })
        return existing.id
      }
      upd('empresa', { status: 'error', error: error.message })
      log(`❌ Erro ao criar empresa: ${error.message}`)
      return null
    }
    log(`✅ Empresa criada: ${data.id}`)
    upd('empresa', { status: 'done', migrated: 1, total: 1 })
    return data.id
  }, [nomeEmpresa, cnpjEmpresa])

  // ── STEP 2: Migrar Pessoas (dedup por CPF) ─────────────────────────────────
  const migrarPessoas = useCallback(async (): Promise<Map<string, string>> => {
    upd('pessoas', { status: 'running' })
    log('Buscando colaboradores no banco V1…')
    const cpfToV2Id = new Map<string, string>()

    const { data: colabs, error } = await supabase
      .from('colaboradores')
      .select('id,cpf,nome,data_nascimento,telefone,email,endereco,cidade,estado,cep,rg,pis_nit,genero,estado_civil,foto_url,nome_pai,nome_mae,banco,agencia,conta,tipo_conta,pix_chave,pix_tipo,vt_dados')
      .not('cpf', 'is', null)
      .order('created_at', { ascending: true })

    if (error) {
      upd('pessoas', { status: 'error', error: error.message })
      log(`❌ Erro ao buscar colaboradores: ${error.message}`)
      return cpfToV2Id
    }

    // Deduplicar por CPF — mantém o primeiro (created_at ASC)
    const seen = new Map<string, typeof colabs[0]>()
    for (const c of colabs ?? []) {
      const cpf = c.cpf?.replace(/\D/g, '') ?? ''
      if (cpf && !seen.has(cpf)) seen.set(cpf, c)
    }

    const pessoas = Array.from(seen.values())
    upd('pessoas', { total: pessoas.length })
    log(`📋 ${pessoas.length} pessoas únicas (por CPF) encontradas`)

    let migrated = 0
    const BATCH = 50
    for (let i = 0; i < pessoas.length; i += BATCH) {
      const batch = pessoas.slice(i, i + BATCH).map(c => ({
        cpf:             c.cpf!.replace(/\D/g, ''),
        nome:            c.nome,
        data_nascimento: c.data_nascimento,
        telefone:        c.telefone,
        email:           c.email,
        endereco:        c.endereco,
        cidade:          c.cidade,
        estado:          c.estado,
        cep:             c.cep,
        rg:              c.rg,
        pis_nit:         c.pis_nit,
        genero:          c.genero,
        estado_civil:    c.estado_civil,
        foto_url:        c.foto_url,
        nome_pai:        c.nome_pai,
        nome_mae:        c.nome_mae,
        banco:           c.banco,
        agencia:         c.agencia,
        conta:           c.conta,
        tipo_conta:      c.tipo_conta,
        pix_chave:       c.pix_chave,
        pix_tipo:        c.pix_tipo,
        vt_dados:        c.vt_dados,
      }))

      const { data: inserted, error: err } = await supabaseV2
        .from('pessoas')
        .upsert(batch, { onConflict: 'cpf', ignoreDuplicates: false })
        .select('id, cpf')

      if (err) {
        log(`⚠️ Lote ${i}-${i + BATCH}: ${err.message}`)
      } else {
        for (const p of inserted ?? []) cpfToV2Id.set(p.cpf, p.id)
        migrated += inserted?.length ?? 0
        upd('pessoas', { migrated })
      }
    }

    // Buscar os que já existiam (upsert pode não retornar todos)
    const { data: allPessoas } = await supabaseV2.from('pessoas').select('id, cpf')
    for (const p of allPessoas ?? []) cpfToV2Id.set(p.cpf, p.id)

    log(`✅ ${cpfToV2Id.size} pessoas no banco V2`)
    upd('pessoas', { status: 'done', migrated: cpfToV2Id.size, total: pessoas.length })
    return cpfToV2Id
  }, [])

  // ── STEP 3: Migrar Vínculos ───────────────────────────────────────────────
  const migrarVinculos = useCallback(async (empId: string, cpfToV2Id: Map<string, string>): Promise<Map<string, string>> => {
    upd('vinculos', { status: 'running' })
    log('Buscando vínculos no banco V1…')
    const colabToVinculo = new Map<string, string>()

    const { data: colabs, error } = await supabase
      .from('colaboradores')
      .select('id,cpf,obra_id,funcao_id,chapa,tipo_contrato,salario,data_admissao,data_demissao,status,observacoes,ctps_numero,ctps_serie')
      .order('created_at', { ascending: true })

    if (error) {
      upd('vinculos', { status: 'error', error: error.message })
      log(`❌ Erro ao buscar colaboradores: ${error.message}`)
      return colabToVinculo
    }

    upd('vinculos', { total: colabs?.length ?? 0 })
    log(`📋 ${colabs?.length} vínculos a migrar`)

    let migrated = 0
    const BATCH = 50
    const arr = colabs ?? []

    for (let i = 0; i < arr.length; i += BATCH) {
      const batch = arr.slice(i, i + BATCH)
      const inserts = batch
        .map(c => {
          const cpf = c.cpf?.replace(/\D/g, '') ?? ''
          const pessoaId = cpfToV2Id.get(cpf)
          if (!pessoaId) return null
          return {
            pessoa_id:      pessoaId,
            empresa_id:     empId,
            obra_id:        c.obra_id,
            funcao_id:      c.funcao_id,
            chapa:          c.chapa,
            tipo_contrato:  c.tipo_contrato ?? 'clt',
            salario:        c.salario,
            data_admissao:  c.data_admissao ?? new Date().toISOString().slice(0, 10),
            data_demissao:  c.data_demissao,
            status:         c.status === 'ativo' ? 'ativo' : 'encerrado',
            observacoes:    c.observacoes,
            ctps_numero:    c.ctps_numero,
            ctps_serie:     c.ctps_serie,
          }
        })
        .filter(Boolean) as object[]

      if (inserts.length === 0) continue

      const { data: inserted, error: err } = await supabaseV2
        .from('vinculos_empregaticos')
        .insert(inserts)
        .select('id, pessoa_id')

      if (err) {
        log(`⚠️ Lote vínculos ${i}-${i + BATCH}: ${err.message}`)
      } else {
        // Mapear colab_v1_id → vinculo_v2_id usando pessoa_id
        for (let j = 0; j < batch.length; j++) {
          const c = batch[j]
          const cpf = c.cpf?.replace(/\D/g, '') ?? ''
          const pessoaId = cpfToV2Id.get(cpf)
          const vins = inserted?.filter(v => v.pessoa_id === pessoaId)
          if (vins?.length) colabToVinculo.set(c.id, vins[vins.length - 1].id)
        }
        migrated += inserted?.length ?? 0
        upd('vinculos', { migrated })
      }
    }

    log(`✅ ${migrated} vínculos migrados`)
    upd('vinculos', { status: 'done', migrated, total: arr.length })
    return colabToVinculo
  }, [])

  // ── STEP 4: Gerar Resumos Retroativos ─────────────────────────────────────
  const gerarResumos = useCallback(async (empId: string, colabToVinculo: Map<string, string>) => {
    upd('resumos', { status: 'running' })
    log('Buscando fechamentos aprovados/pagos no banco V1…')

    const { data: fechamentos, error } = await supabase
      .from('ponto_lancamentos')
      .select('id,colaborador_id,obra_id,mes_referencia,status,snap_valor_total,snap_liquido,snap_valor_horas,snap_valor_dsr,snap_valor_premio,snap_inss,snap_ir,snap_desconto_vt,snap_desconto_adiant,snap_faltas,faltas,horas_extras,valor_total')
      .in('status', ['aprovado', 'liberado', 'pago'])
      .order('mes_referencia', { ascending: true })

    if (error) {
      upd('resumos', { status: 'error', error: error.message })
      log(`❌ Erro ao buscar fechamentos: ${error.message}`)
      return
    }

    upd('resumos', { total: fechamentos?.length ?? 0 })
    log(`📋 ${fechamentos?.length} fechamentos a converter em resumos`)

    let migrated = 0
    const BATCH = 50
    const arr = fechamentos ?? []

    for (let i = 0; i < arr.length; i += BATCH) {
      const batch = arr.slice(i, i + BATCH)
      const inserts = batch.map(f => {
        const vinculoId = colabToVinculo.get(f.colaborador_id)
        if (!vinculoId) return null
        const [ano, mes] = (f.mes_referencia ?? '2026-01').split('-').map(Number)
        return {
          empresa_id:       empId,
          obra_id:          f.obra_id,
          vinculo_id:       vinculoId,
          colaborador_id:   f.colaborador_id,
          competencia_mes:  mes || 1,
          competencia_ano:  ano || 2026,
          salario_base:     f.snap_valor_horas ?? 0,
          horas_extras:     f.horas_extras ?? 0,
          faltas:           f.snap_faltas ?? f.faltas ?? 0,
          premios:          f.snap_valor_premio ?? 0,
          desconto_vt:      f.snap_desconto_vt ?? 0,
          adiantamentos:    f.snap_desconto_adiant ?? 0,
          inss:             f.snap_inss ?? 0,
          ir:               f.snap_ir ?? 0,
          dsr:              f.snap_valor_dsr ?? 0,
          valor_liquido:    f.snap_liquido ?? f.snap_valor_total ?? f.valor_total ?? 0,
          status:           f.status === 'pago' ? 'pago' : 'aprovado',
          versao:           1,
          snapshot_dados:   f as unknown as Record<string, unknown>,
        }
      }).filter(Boolean) as object[]

      if (inserts.length === 0) continue

      const { data: inserted, error: err } = await supabaseV2
        .from('resumo_fechamento')
        .upsert(inserts, { onConflict: 'vinculo_id,competencia_mes,competencia_ano,versao', ignoreDuplicates: true })
        .select('id')

      if (err) {
        log(`⚠️ Lote resumos ${i}-${i + BATCH}: ${err.message}`)
      } else {
        migrated += inserted?.length ?? 0
        upd('resumos', { migrated })
      }
    }

    log(`✅ ${migrated} resumos gerados no banco V2`)
    upd('resumos', { status: 'done', migrated, total: arr.length })
  }, [])

  // ── Executar migração completa ─────────────────────────────────────────────
  const executarMigracao = useCallback(async () => {
    if (!nomeEmpresa.trim()) { toast.error('Informe o nome da empresa'); return }
    setRunning(true)
    setDone(false)
    setLogs([])
    setSteps(STEPS_INIT)
    log('🚀 Iniciando migração V1 → V2…')

    try {
      const empId = await migrarEmpresa()
      if (!empId) { setRunning(false); return }
      setEmpresaId(empId)

      const cpfToV2Id = await migrarPessoas()
      if (cpfToV2Id.size === 0) { setRunning(false); return }

      const colabToVinculo = await migrarVinculos(empId, cpfToV2Id)

      await gerarResumos(empId, colabToVinculo)

      log('🎉 Migração concluída com sucesso!')
      toast.success('Migração V1 → V2 concluída!')
      setDone(true)
    } catch (e: unknown) {
      log(`❌ Erro inesperado: ${e instanceof Error ? e.message : String(e)}`)
      toast.error('Erro durante a migração')
    } finally {
      setRunning(false)
    }
  }, [migrarEmpresa, migrarPessoas, migrarVinculos, gerarResumos, nomeEmpresa])

  const allDone   = steps.every(s => s.status === 'done')
  const hasError  = steps.some(s => s.status === 'error')

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Migração V2 — SaaS Multiempresa"
        subtitle="Importa dados do banco atual (V1) para o novo banco estruturado (V2)"
        icon={<Database className="w-6 h-6" />}
      />

      {/* Aviso */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-800">Banco V1 não será alterado</p>
          <p className="text-amber-700 mt-1">Esta operação apenas <strong>lê</strong> os dados do banco atual e os <strong>insere</strong> no banco V2. Nenhum dado será excluído ou modificado no banco de produção.</p>
        </div>
      </div>

      {/* Config da empresa */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" /> Dados da Empresa</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nome da Empresa *</Label>
            <Input
              value={nomeEmpresa}
              onChange={e => setNomeEmpresa(e.target.value)}
              placeholder="Ex: Magmo Construções"
              disabled={running}
              className="mt-1"
            />
          </div>
          <div>
            <Label>CNPJ (opcional)</Label>
            <Input
              value={cnpjEmpresa}
              onChange={e => setCnpjEmpresa(e.target.value)}
              placeholder="XX.XXX.XXX/XXXX-XX"
              disabled={running}
              className="mt-1"
            />
          </div>
          {empresaId && (
            <div className="md:col-span-2">
              <p className="text-xs text-gray-500 font-mono">ID V2: {empresaId}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Steps */}
      <Card>
        <CardHeader><CardTitle className="text-base">Etapas da Migração</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {steps.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-white border flex items-center justify-center shrink-0">
                  {s.status === 'running' ? <Loader2 className="w-4 h-4 text-blue-600 animate-spin" /> :
                   s.status === 'done'    ? <CheckCircle2 className="w-4 h-4 text-green-600" /> :
                   s.status === 'error'   ? <XCircle className="w-4 h-4 text-red-600" /> :
                   <Icon className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{i + 1}. {s.label}</p>
                  {s.status !== 'idle' && s.total > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">{s.migrated} / {s.total} registros</p>
                  )}
                  {s.error && <p className="text-xs text-red-600 mt-0.5">{s.error}</p>}
                </div>
                <StatusBadge status={s.status} />
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Botão */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={executarMigracao}
          disabled={running}
          className={allDone ? 'bg-green-600 hover:bg-green-700' : hasError ? 'bg-red-600 hover:bg-red-700' : ''}
        >
          {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Migrando…</> :
           allDone  ? <><ShieldCheck className="w-4 h-4 mr-2" /> Migração Concluída</> :
           hasError ? <><RefreshCw  className="w-4 h-4 mr-2" /> Tentar Novamente</> :
                      <><Play       className="w-4 h-4 mr-2" /> Iniciar Migração</>}
        </Button>
      </div>

      {/* Resultado */}
      {done && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-green-800 text-lg">Migração concluída com sucesso! 🎉</p>
                <p className="text-green-700 text-sm mt-1">Todos os dados foram importados para o banco V2.</p>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {steps.map(s => (
                    <div key={s.id} className="bg-white rounded-lg p-3 text-center border border-green-200">
                      <p className="text-xl font-bold text-green-700">{s.migrated}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono flex items-center gap-2"><ChevronRight className="w-3 h-3" /> Log de Execução</CardTitle></CardHeader>
          <CardContent>
            <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
              {logs.map((l, i) => (
                <p key={i} className={
                  l.includes('❌') ? 'text-red-400' :
                  l.includes('✅') || l.includes('🎉') ? 'text-green-400' :
                  l.includes('⚠️') ? 'text-yellow-400' :
                  'text-gray-300'
                }>{l}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
