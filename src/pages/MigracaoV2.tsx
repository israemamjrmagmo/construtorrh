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
  HardHat, Briefcase, Link2, Clock, FileText, Shield,
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
  { id: 'empresa',     label: 'Criar Empresa',                     icon: Building2,  status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'obras',       label: 'Migrar Obras',                      icon: HardHat,    status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'funcoes',     label: 'Migrar Funções',                    icon: Briefcase,  status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'pessoas',     label: 'Migrar Pessoas (CPF)',              icon: Users,      status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'vinculos',    label: 'Migrar Vínculos Empregatícios',     icon: Link2,      status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'pontos',      label: 'Migrar Registros de Ponto',         icon: Clock,      status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'lancamentos', label: 'Migrar Lançamentos / Fechamentos',  icon: FileText,   status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'financeiro',  label: 'Migrar Prêmios, Adiantamentos, VT', icon: DollarSign, status: 'idle', total: 0, migrated: 0, error: null },
  { id: 'epis_docs',   label: 'Migrar EPIs e Documentos',          icon: Shield,     status: 'idle', total: 0, migrated: 0, error: null },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  const [empresaId,       setEmpresaId]       = useState<string | null>(null)
  const [empresaIdManual, setEmpresaIdManual] = useState('d1282f82-a558-4a1c-b8b6-11a6d88e108b')
  const [nomeEmpresa,     setNomeEmpresa]     = useState('Magmo Solucoes Construtivas')
  const [cnpjEmpresa,     setCnpjEmpresa]     = useState('52711905000173')
  const [logs,         setLogs]         = useState<string[]>([])

  const log = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`, ...prev.slice(0, 299)])
  }

  const upd = (id: string, patch: Partial<MigStep>) =>
    setSteps(s => s.map(x => x.id === id ? { ...x, ...patch } : x))

  // ── STEP 1: Reutilizar empresa pelo ID manual ────────────────────────────
  const migrarEmpresa = useCallback(async (): Promise<string | null> => {
    upd('empresa', { status: 'running' })
    log('Verificando empresa no banco V2…')

    // 1) ID manual informado diretamente no formulário (contorna RLS)
    const idManual = empresaIdManual.trim()
    if (idManual && /^[0-9a-f-]{36}$/i.test(idManual)) {
      log(`✅ Usando empresa_id informado: ${idManual}`)
      upd('empresa', { status: 'done', migrated: 1, total: 1 })
      setEmpresaId(idManual)
      return idManual
    }

    // 2) Buscar pelo CNPJ (requer policy SELECT em empresas)
    if (cnpjEmpresa) {
      const cnpjLimpo = cnpjEmpresa.replace(/\D/g, '')
      const { data: porCnpj } = await supabaseV2
        .from('empresas')
        .select('id, nome, cnpj')
        .eq('cnpj', cnpjLimpo)
        .single()
      if (porCnpj) {
        log(`✅ Empresa encontrada pelo CNPJ — id: ${porCnpj.id}`)
        upd('empresa', { status: 'done', migrated: 1, total: 1 })
        setEmpresaId(porCnpj.id)
        return porCnpj.id
      }
    }

    // 3) Buscar pelo nome
    const { data: porNome } = await supabaseV2
      .from('empresas')
      .select('id, nome')
      .eq('nome', nomeEmpresa)
      .single()
    if (porNome) {
      log(`⚠️ Empresa encontrada pelo nome — reutilizando id: ${porNome.id}`)
      upd('empresa', { status: 'done', migrated: 1, total: 1 })
      setEmpresaId(porNome.id)
      return porNome.id
    }

    upd('empresa', { status: 'error', error: 'Empresa não encontrada. Informe o empresa_id no formulário.' })
    log('❌ Empresa não encontrada. Preencha o campo ID da Empresa com o UUID retornado pelo SQL de setup.')
    return null
  }, [empresaIdManual, nomeEmpresa, cnpjEmpresa])

  // ── STEP 2: Migrar Obras ──────────────────────────────────────────────────
  const migrarObras = useCallback(async (empId: string): Promise<Map<string, string>> => {
    upd('obras', { status: 'running' })
    log('Buscando obras no banco V1…')
    const obraMap = new Map<string, string>()

    const { data, error } = await supabase
      .from('obras')
      .select('id,nome,codigo,endereco,cidade,estado,cliente,responsavel,data_inicio,data_previsao_fim,status,considera_sabado_util,desconta_vt,observacoes')
      .order('created_at', { ascending: true })

    if (error) {
      upd('obras', { status: 'error', error: error.message })
      log(`❌ Erro ao buscar obras: ${error.message}`)
      return obraMap
    }

    upd('obras', { total: data?.length ?? 0 })
    log(`📋 ${data?.length ?? 0} obras encontradas no V1`)

    const BATCH = 50
    let migrated = 0

    for (let i = 0; i < (data?.length ?? 0); i += BATCH) {
      const batch = (data ?? []).slice(i, i + BATCH).map(o => ({
        empresa_id:           empId,
        id_legado:            o.id,
        nome:                 o.nome,
        codigo:               o.codigo,
        endereco:             o.endereco,
        cidade:               o.cidade,
        estado:               o.estado,
        cliente:              o.cliente,
        responsavel:          o.responsavel,
        data_inicio:          o.data_inicio,
        data_previsao_fim:    o.data_previsao_fim,
        status:               o.status ?? 'em_andamento',
        considera_sabado_util: o.considera_sabado_util ?? false,
        desconta_vt:          o.desconta_vt ?? true,
        observacoes:          o.observacoes,
        ativo:                true,
      }))

      const { data: inserted, error: err } = await supabaseV2
        .from('obras_v2')
        .insert(batch)
        .select('id, id_legado')

      if (err) {
        log(`⚠️ Obras lote ${i}: ${err.message}`)
      } else {
        for (const o of inserted ?? []) {
          if (o.id_legado) obraMap.set(o.id_legado, o.id)
        }
        migrated += inserted?.length ?? 0
        upd('obras', { migrated })
      }
    }

    // Buscar todos para garantir mapa completo
    const { data: all } = await supabaseV2
      .from('obras_v2')
      .select('id, id_legado')
      .eq('empresa_id', empId)
    for (const o of all ?? []) if (o.id_legado) obraMap.set(o.id_legado, o.id)

    log(`✅ ${obraMap.size} obras migradas`)
    upd('obras', { status: 'done', migrated: obraMap.size, total: data?.length ?? 0 })
    return obraMap
  }, [])

  // ── STEP 3: Migrar Funções ────────────────────────────────────────────────
  const migrarFuncoes = useCallback(async (empId: string): Promise<Map<string, string>> => {
    upd('funcoes', { status: 'running' })
    log('Buscando funções no banco V1…')
    const funcaoMap = new Map<string, string>()

    const { data, error } = await supabase
      .from('funcoes')
      .select('id,nome,sigla,descricao,cbo,valor_hora_clt,valor_hora_autonomo,ativo')
      .order('created_at', { ascending: true })

    if (error) {
      upd('funcoes', { status: 'error', error: error.message })
      log(`❌ Erro ao buscar funções: ${error.message}`)
      return funcaoMap
    }

    upd('funcoes', { total: data?.length ?? 0 })
    log(`📋 ${data?.length ?? 0} funções encontradas no V1`)

    const BATCH = 50
    let migrated = 0

    for (let i = 0; i < (data?.length ?? 0); i += BATCH) {
      const batch = (data ?? []).slice(i, i + BATCH).map(f => ({
        empresa_id:          empId,
        id_legado:           f.id,
        nome:                f.nome,
        sigla:               f.sigla,
        descricao:           f.descricao,
        cbo:                 f.cbo,
        valor_hora_clt:      f.valor_hora_clt,
        valor_hora_autonomo: f.valor_hora_autonomo,
        ativo:               f.ativo ?? true,
      }))

      const { data: inserted, error: err } = await supabaseV2
        .from('funcoes_v2')
        .insert(batch)
        .select('id, id_legado')

      if (err) {
        log(`⚠️ Funções lote ${i}: ${err.message}`)
      } else {
        for (const f of inserted ?? []) {
          if (f.id_legado) funcaoMap.set(f.id_legado, f.id)
        }
        migrated += inserted?.length ?? 0
        upd('funcoes', { migrated })
      }
    }

    // Buscar todos para garantir mapa completo
    const { data: all } = await supabaseV2
      .from('funcoes_v2')
      .select('id, id_legado')
      .eq('empresa_id', empId)
    for (const f of all ?? []) if (f.id_legado) funcaoMap.set(f.id_legado, f.id)

    log(`✅ ${funcaoMap.size} funções migradas`)
    upd('funcoes', { status: 'done', migrated: funcaoMap.size, total: data?.length ?? 0 })
    return funcaoMap
  }, [])

  // ── STEP 4: Migrar Pessoas (dedup por CPF) ────────────────────────────────
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

    // Deduplicar por CPF
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
        log(`⚠️ Lote pessoas ${i}-${i + BATCH}: ${err.message}`)
      } else {
        for (const p of inserted ?? []) cpfToV2Id.set(p.cpf, p.id)
        migrated += inserted?.length ?? 0
        upd('pessoas', { migrated })
      }
    }

    // Buscar os que já existiam
    const { data: allPessoas } = await supabaseV2.from('pessoas').select('id, cpf')
    for (const p of allPessoas ?? []) cpfToV2Id.set(p.cpf, p.id)

    log(`✅ ${cpfToV2Id.size} pessoas no banco V2`)
    upd('pessoas', { status: 'done', migrated: cpfToV2Id.size, total: pessoas.length })
    return cpfToV2Id
  }, [])

  // ── STEP 5: Migrar Vínculos ───────────────────────────────────────────────
  const migrarVinculos = useCallback(async (
    empId: string,
    cpfToV2Id: Map<string, string>,
    obraMap: Map<string, string>,
    funcaoMap: Map<string, string>,
  ): Promise<Map<string, string>> => {
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
    log(`📋 ${colabs?.length ?? 0} vínculos a migrar`)

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
            pessoa_id:     pessoaId,
            empresa_id:    empId,
            obra_id:       obraMap.get(c.obra_id) ?? null,
            funcao_id:     funcaoMap.get(c.funcao_id) ?? null,
            chapa:         c.chapa,
            tipo_contrato: c.tipo_contrato ?? 'clt',
            salario:       c.salario,
            data_admissao: c.data_admissao ?? new Date().toISOString().slice(0, 10),
            data_demissao: c.data_demissao,
            status:        c.status === 'ativo' ? 'ativo' : 'encerrado',
            observacoes:   c.observacoes,
            ctps_numero:   c.ctps_numero,
            ctps_serie:    c.ctps_serie,
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

  // ── STEP 6: Migrar Registros de Ponto ────────────────────────────────────
  const migrarPontos = useCallback(async (
    empId: string,
    colabToVinculo: Map<string, string>,
    obraMap: Map<string, string>,
  ) => {
    upd('pontos', { status: 'running' })
    log('Buscando registros de ponto no banco V1…')

    const { data, error } = await supabase
      .from('registro_ponto')
      .select('id,colaborador_id,obra_id,data,hora_entrada,saida_almoco,retorno_almoco,hora_saida,horas_trabalhadas,horas_extras,falta,justificativa')
      .order('data', { ascending: true })

    if (error) {
      upd('pontos', { status: 'error', error: error.message })
      log(`❌ Erro ao buscar registros de ponto: ${error.message}`)
      return
    }

    upd('pontos', { total: data?.length ?? 0 })
    log(`📋 ${data?.length ?? 0} registros de ponto encontrados`)

    const BATCH = 100
    let migrated = 0
    const arr = data ?? []

    for (let i = 0; i < arr.length; i += BATCH) {
      const batch = arr.slice(i, i + BATCH)
      const inserts = batch
        .map(r => {
          const vinculoId = colabToVinculo.get(r.colaborador_id)
          return {
            empresa_id:       empId,
            vinculo_id:       vinculoId ?? null,
            colaborador_id:   r.colaborador_id,
            obra_id:          r.obra_id ? (obraMap.get(r.obra_id) ?? null) : null,
            id_legado:        r.id,
            data:             r.data,
            hora_entrada:     r.hora_entrada,
            saida_almoco:     r.saida_almoco,
            retorno_almoco:   r.retorno_almoco,
            hora_saida:       r.hora_saida,
            horas_trabalhadas: r.horas_trabalhadas,
            horas_extras:     r.horas_extras ?? 0,
            falta:            r.falta ?? false,
            justificativa:    r.justificativa,
          }
        })

      const { data: inserted, error: err } = await supabaseV2
        .from('ponto_registros_v2')
        .insert(inserts)
        .select('id')

      if (err) {
        log(`⚠️ Ponto lote ${i}: ${err.message}`)
      } else {
        migrated += inserted?.length ?? 0
        upd('pontos', { migrated })
      }
    }

    log(`✅ ${migrated} registros de ponto migrados`)
    upd('pontos', { status: 'done', migrated, total: arr.length })
  }, [])

  // ── STEP 7: Migrar Lançamentos / Fechamentos ──────────────────────────────
  const migrarLancamentos = useCallback(async (
    empId: string,
    colabToVinculo: Map<string, string>,
    obraMap: Map<string, string>,
  ) => {
    upd('lancamentos', { status: 'running' })
    log('Buscando lançamentos de ponto no banco V1…')

    const { data, error } = await supabase
      .from('ponto_lancamentos')
      .select('id,colaborador_id,obra_id,mes_referencia,status,snap_horas_normais,snap_horas_extras,snap_valor_horas,snap_faltas,snap_valor_total,snap_liquido,snap_inss,snap_ir,snap_valor_dsr,snap_valor_premio,snap_desconto_vt,snap_desconto_adiant,snap_liquido')
      .order('mes_referencia', { ascending: true })

    if (error) {
      upd('lancamentos', { status: 'error', error: error.message })
      log(`❌ Erro ao buscar lançamentos: ${error.message}`)
      return
    }

    upd('lancamentos', { total: data?.length ?? 0 })
    log(`📋 ${data?.length ?? 0} lançamentos encontrados`)

    const BATCH = 100
    let migrated = 0
    const arr = data ?? []

    for (let i = 0; i < arr.length; i += BATCH) {
      const batch = arr.slice(i, i + BATCH)
      const lancInserts = batch.map(f => {
        const vinculoId = colabToVinculo.get(f.colaborador_id)
        return {
          empresa_id:       empId,
          vinculo_id:       vinculoId ?? null,
          colaborador_id:   f.colaborador_id,
          obra_id:          f.obra_id ? (obraMap.get(f.obra_id) ?? null) : null,
          id_legado:        f.id,
          mes_referencia:   f.mes_referencia,
          status:           f.status ?? 'pendente_fechamento',
          horas_normais:    f.snap_horas_normais ?? 0,
          horas_extras:     f.snap_horas_extras ?? 0,
          valor_horas:      f.snap_valor_horas ?? 0,
          faltas:           f.snap_faltas ?? 0,
          dias_trabalhados: 0,
          snap_valor_total: f.snap_valor_total,
          snap_liquido:     f.snap_liquido,
          snap_valor_horas: f.snap_valor_horas,
          snap_inss:        f.snap_inss,
          snap_ir:          f.snap_ir,
          snap_valor_dsr:   f.snap_valor_dsr,
          snap_valor_premio: f.snap_valor_premio,
          snap_desconto_vt: f.snap_desconto_vt,
          snap_faltas:      f.snap_faltas,
          versao:           1,
        }
      })

      const { data: inserted, error: errLanc } = await supabaseV2
        .from('ponto_lancamentos_v2')
        .insert(lancInserts)
        .select('id')

      if (errLanc) {
        log(`⚠️ Lançamentos lote ${i}: ${errLanc.message}`)
      } else {
        migrated += inserted?.length ?? 0
        upd('lancamentos', { migrated })
      }

      // Inserir também em resumo_fechamento para os aprovados/pagos
      const aprovados = batch.filter(f => ['aprovado', 'liberado', 'pago'].includes(f.status ?? ''))
      if (aprovados.length > 0) {
        const resumoInserts = aprovados
          .map(f => {
            const vinculoId = colabToVinculo.get(f.colaborador_id)
            if (!vinculoId) return null
            const [ano, mes] = (f.mes_referencia ?? '2026-01').split('-').map(Number)
            return {
              empresa_id:      empId,
              obra_id:         f.obra_id ? (obraMap.get(f.obra_id) ?? null) : null,
              vinculo_id:      vinculoId,
              colaborador_id:  f.colaborador_id,
              competencia_mes: mes || 1,
              competencia_ano: ano || 2026,
              salario_base:    f.snap_valor_horas ?? 0,
              horas_extras:    f.horas_extras ?? 0,
              faltas:          f.snap_faltas ?? f.faltas ?? 0,
              premios:         f.snap_valor_premio ?? 0,
              desconto_vt:     f.snap_desconto_vt ?? 0,
              adiantamentos:   0,
              inss:            f.snap_inss ?? 0,
              ir:              f.snap_ir ?? 0,
              dsr:             f.snap_valor_dsr ?? 0,
              valor_liquido:   f.snap_liquido ?? f.snap_valor_total ?? f.valor_total ?? 0,
              status:          f.status === 'pago' ? 'pago' : 'aprovado',
              versao:          1,
              snapshot_dados:  f as unknown as Record<string, unknown>,
            }
          })
          .filter(Boolean) as object[]

        if (resumoInserts.length > 0) {
          const { error: errResumo } = await supabaseV2
            .from('resumo_fechamento')
            .upsert(resumoInserts, { onConflict: 'vinculo_id,competencia_mes,competencia_ano,versao', ignoreDuplicates: true })

          if (errResumo) log(`⚠️ Resumo fechamento lote ${i}: ${errResumo.message}`)
        }
      }
    }

    log(`✅ ${migrated} lançamentos migrados`)
    upd('lancamentos', { status: 'done', migrated, total: arr.length })
  }, [])

  // ── STEP 8: Migrar Prêmios, Adiantamentos e VT ───────────────────────────
  const migrarFinanceiro = useCallback(async (
    empId: string,
    colabToVinculo: Map<string, string>,
    obraMap: Map<string, string>,
  ) => {
    upd('financeiro', { status: 'running' })
    let totalMigrated = 0

    // ── 8a: Prêmios ────────────────────────────────────────────────────────
    try {
      log('Buscando prêmios no banco V1…')
      const { data: premios, error: errP } = await supabase
        .from('premios')
        .select('id,colaborador_id,obra_id,tipo,descricao,valor,data,competencia,status,observacoes')
        .order('created_at', { ascending: true })

      if (errP) {
        log(`⚠️ Erro ao buscar prêmios: ${errP.message}`)
      } else {
        upd('financeiro', { total: premios?.length ?? 0 })
        const BATCH = 100
        for (let i = 0; i < (premios?.length ?? 0); i += BATCH) {
          const batch = (premios ?? []).slice(i, i + BATCH).map(p => ({
            empresa_id:    empId,
            vinculo_id:    colabToVinculo.get(p.colaborador_id) ?? null,
            colaborador_id: p.colaborador_id,
            obra_id:       p.obra_id ? (obraMap.get(p.obra_id) ?? null) : null,
            id_legado:     p.id,
            tipo:          p.tipo,
            descricao:     p.descricao,
            valor:         p.valor,
            data:          p.data,
            competencia:   p.competencia,
            status:        p.status ?? 'pendente',
            observacoes:   p.observacoes,
          }))

          const { data: ins, error: errIns } = await supabaseV2
            .from('premios_v2')
            .insert(batch)
            .select('id')

          if (errIns) log(`⚠️ Prêmios lote ${i}: ${errIns.message}`)
          else {
            totalMigrated += ins?.length ?? 0
            upd('financeiro', { migrated: totalMigrated })
          }
        }
        log(`✅ ${premios?.length ?? 0} prêmios migrados`)
      }
    } catch (e) {
      log(`⚠️ Prêmios: ${e instanceof Error ? e.message : String(e)}`)
    }

    // ── 8b: Adiantamentos ──────────────────────────────────────────────────
    try {
      log('Buscando adiantamentos no banco V1…')
      const { data: adiant, error: errA } = await supabase
        .from('adiantamentos')
        .select('id,colaborador_id,obra_id,competencia,tipo,valor,observacoes,status')
        .order('created_at', { ascending: true })

      if (errA) {
        log(`⚠️ Erro ao buscar adiantamentos: ${errA.message}`)
      } else {
        upd('financeiro', { total: totalMigrated + (adiant?.length ?? 0) })
        const BATCH = 100
        for (let i = 0; i < (adiant?.length ?? 0); i += BATCH) {
          const batch = (adiant ?? []).slice(i, i + BATCH).map(a => ({
            empresa_id:    empId,
            vinculo_id:    colabToVinculo.get(a.colaborador_id) ?? null,
            colaborador_id: a.colaborador_id,
            obra_id:       a.obra_id ? (obraMap.get(a.obra_id) ?? null) : null,
            id_legado:     a.id,
            competencia:   a.competencia,
            tipo:          a.tipo,
            valor:         a.valor,
            observacoes:   a.observacoes,
            status:        a.status ?? 'pendente',
          }))

          const { data: ins, error: errIns } = await supabaseV2
            .from('adiantamentos_v2')
            .insert(batch)
            .select('id')

          if (errIns) log(`⚠️ Adiantamentos lote ${i}: ${errIns.message}`)
          else {
            totalMigrated += ins?.length ?? 0
            upd('financeiro', { migrated: totalMigrated })
          }
        }
        log(`✅ ${adiant?.length ?? 0} adiantamentos migrados`)
      }
    } catch (e) {
      log(`⚠️ Adiantamentos: ${e instanceof Error ? e.message : String(e)}`)
    }

    // ── 8c: Vale Transporte ────────────────────────────────────────────────
    try {
      log('Buscando vale transporte no banco V1…')
      const { data: vts, error: errVT } = await supabase
        .from('vale_transporte')
        .select('id,colaborador_id,competencia,tipo,valor,dias_trabalhados,desconto_colaborador,valor_empresa,descontar_6pct,status,observacoes')
        .order('created_at', { ascending: true })

      if (errVT) {
        log(`⚠️ Erro ao buscar vale transporte: ${errVT.message}`)
      } else {
        const BATCH = 100
        for (let i = 0; i < (vts?.length ?? 0); i += BATCH) {
          const batch = (vts ?? []).slice(i, i + BATCH).map(v => ({
            empresa_id:           empId,
            vinculo_id:           colabToVinculo.get(v.colaborador_id) ?? null,
            colaborador_id:       v.colaborador_id,
            id_legado:            v.id,
            competencia:          v.competencia,
            tipo:                 v.tipo,
            valor:                v.valor,
            dias_trabalhados:     v.dias_trabalhados ?? 0,
            desconto_colaborador: v.desconto_colaborador,
            valor_empresa:        v.valor_empresa,
            descontar_6pct:       v.descontar_6pct ?? true,
            status:               v.status ?? 'pendente',
            observacoes:          v.observacoes,
          }))

          const { data: ins, error: errIns } = await supabaseV2
            .from('vale_transporte_v2')
            .insert(batch)
            .select('id')

          if (errIns) log(`⚠️ VT lote ${i}: ${errIns.message}`)
          else {
            totalMigrated += ins?.length ?? 0
            upd('financeiro', { migrated: totalMigrated })
          }
        }
        log(`✅ ${vts?.length ?? 0} registros de VT migrados`)
      }
    } catch (e) {
      log(`⚠️ Vale Transporte: ${e instanceof Error ? e.message : String(e)}`)
    }

    upd('financeiro', { status: 'done', migrated: totalMigrated })
  }, [])

  // ── STEP 9: Migrar EPIs e Documentos ──────────────────────────────────────
  const migrarEpisEDocs = useCallback(async (
    empId: string,
    colabToVinculo: Map<string, string>,
  ) => {
    upd('epis_docs', { status: 'running' })
    let totalMigrated = 0

    // ── 9a: EPIs ───────────────────────────────────────────────────────────
    try {
      log('Buscando EPIs dos colaboradores no banco V1…')
      const { data: epis, error: errE } = await supabase
        .from('colaborador_epi')
        .select('id,colaborador_id,epi_id,tamanho,numero,quantidade,data_entrega,status,documento_url,observacoes,epi_catalogo(nome,categoria,numero_ca)')
        .order('created_at', { ascending: true })

      if (errE) {
        log(`⚠️ Erro ao buscar EPIs: ${errE.message}`)
      } else {
        upd('epis_docs', { total: epis?.length ?? 0 })
        const BATCH = 100
        for (let i = 0; i < (epis?.length ?? 0); i += BATCH) {
          const batch = (epis ?? []).slice(i, i + BATCH).map(e => {
            const cat = Array.isArray(e.epi_catalogo) ? e.epi_catalogo[0] : e.epi_catalogo
            return {
              empresa_id:    empId,
              vinculo_id:    colabToVinculo.get(e.colaborador_id) ?? null,
              colaborador_id: e.colaborador_id,
              id_legado:     e.id,
              epi_nome:      cat?.nome ?? null,
              epi_categoria: cat?.categoria ?? null,
              numero_ca:     cat?.numero_ca ?? null,
              tamanho:       e.tamanho,
              numero:        e.numero,
              quantidade:    e.quantidade ?? 1,
              data_entrega:  e.data_entrega,
              status:        e.status ?? 'ativo',
              documento_url: e.documento_url,
              observacoes:   e.observacoes,
            }
          })

          const { data: ins, error: errIns } = await supabaseV2
            .from('colaborador_epis_v2')
            .insert(batch)
            .select('id')

          if (errIns) log(`⚠️ EPIs lote ${i}: ${errIns.message}`)
          else {
            totalMigrated += ins?.length ?? 0
            upd('epis_docs', { migrated: totalMigrated })
          }
        }
        log(`✅ ${epis?.length ?? 0} EPIs migrados`)
      }
    } catch (e) {
      log(`⚠️ EPIs: ${e instanceof Error ? e.message : String(e)}`)
    }

    // ── 9b: Documentos ─────────────────────────────────────────────────────
    try {
      log('Buscando documentos dos colaboradores no banco V1…')

      // Tentar tabela colaborador_documentos primeiro, senão documentos_avulsos
      let docsData: Array<{ id: string; colaborador_id: string; tipo: string | null; descricao: string | null; data: string | null; documento_url: string; documento_nome: string | null }> | null = null

      const { data: d1, error: err1 } = await supabase
        .from('colaborador_documentos')
        .select('id,colaborador_id,tipo,descricao,data,documento_url,documento_nome')
        .order('created_at', { ascending: true })

      if (!err1) {
        docsData = d1
      } else {
        log(`⚠️ Tabela colaborador_documentos não encontrada — tentando documentos_avulsos…`)
        const { data: d2, error: err2 } = await supabase
          .from('documentos_avulsos')
          .select('id,colaborador_id,tipo,descricao,data,documento_url,documento_nome')
          .not('colaborador_id', 'is', null)
          .order('created_at', { ascending: true })

        if (!err2) docsData = d2
        else log(`⚠️ Erro ao buscar documentos: ${err2.message}`)
      }

      if (docsData && docsData.length > 0) {
        upd('epis_docs', { total: (docsData?.length ?? 0) + totalMigrated })
        const BATCH = 100
        for (let i = 0; i < docsData.length; i += BATCH) {
          const batch = docsData.slice(i, i + BATCH).map(d => ({
            empresa_id:    empId,
            vinculo_id:    colabToVinculo.get(d.colaborador_id) ?? null,
            colaborador_id: d.colaborador_id,
            id_legado:     d.id,
            tipo:          d.tipo,
            descricao:     d.descricao,
            data:          d.data,
            documento_url: d.documento_url,
            documento_nome: d.documento_nome,
          }))

          const { data: ins, error: errIns } = await supabaseV2
            .from('documentos_colaborador_v2')
            .insert(batch)
            .select('id')

          if (errIns) log(`⚠️ Docs lote ${i}: ${errIns.message}`)
          else {
            totalMigrated += ins?.length ?? 0
            upd('epis_docs', { migrated: totalMigrated })
          }
        }
        log(`✅ ${docsData.length} documentos migrados`)
      } else {
        log('ℹ️ Nenhum documento de colaborador encontrado')
      }
    } catch (e) {
      log(`⚠️ Documentos: ${e instanceof Error ? e.message : String(e)}`)
    }

    upd('epis_docs', { status: 'done', migrated: totalMigrated })
  }, [])

  // ── Executar migração completa ─────────────────────────────────────────────
  const executarMigracao = useCallback(async () => {
    if (!nomeEmpresa.trim()) { toast.error('Informe o nome da empresa'); return }
    setRunning(true)
    setDone(false)
    setLogs([])
    setSteps(STEPS_INIT)
    log('🚀 Iniciando migração V1 → V2 (9 etapas)…')

    try {
      const empId = await migrarEmpresa()
      if (!empId) { setRunning(false); return }
      setEmpresaId(empId)

      const obraMap   = await migrarObras(empId)
      const funcaoMap = await migrarFuncoes(empId)
      const cpfToV2Id = await migrarPessoas()

      if (cpfToV2Id.size === 0) {
        log('⚠️ Nenhuma pessoa migrada — continuando mesmo assim…')
      }

      const colabToVinculo = await migrarVinculos(empId, cpfToV2Id, obraMap, funcaoMap)

      await migrarPontos(empId, colabToVinculo, obraMap)
      await migrarLancamentos(empId, colabToVinculo, obraMap)
      await migrarFinanceiro(empId, colabToVinculo, obraMap)
      await migrarEpisEDocs(empId, colabToVinculo)

      log('🎉 Migração completa com sucesso!')
      toast.success('Migração V1 → V2 concluída com sucesso!')
      setDone(true)
    } catch (e: unknown) {
      log(`❌ Erro inesperado: ${e instanceof Error ? e.message : String(e)}`)
      toast.error('Erro durante a migração')
    } finally {
      setRunning(false)
    }
  }, [migrarEmpresa, migrarObras, migrarFuncoes, migrarPessoas, migrarVinculos, migrarPontos, migrarLancamentos, migrarFinanceiro, migrarEpisEDocs, nomeEmpresa])

  const allDone  = steps.every(s => s.status === 'done')
  const hasError = steps.some(s => s.status === 'error')

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Migração V2 — SaaS Multiempresa"
        subtitle="Importa dados do banco atual (V1) para o novo banco estruturado (V2) — 9 etapas completas"
        icon={<Database className="w-6 h-6" />}
      />

      {/* Aviso */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-800">Banco V1 não será alterado</p>
          <p className="text-amber-700 mt-1">
            Esta operação apenas <strong>lê</strong> os dados do banco atual e os <strong>insere</strong> no banco V2.
            Nenhum dado será excluído ou modificado no banco de produção.
            Inclui: empresas, obras, funções, pessoas, vínculos, registros de ponto, lançamentos, prêmios, adiantamentos, VT, EPIs e documentos.
          </p>
        </div>
      </div>

      {/* Config da empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Dados da Empresa
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nome da Empresa *</Label>
            <Input
              value={nomeEmpresa}
              onChange={e => setNomeEmpresa(e.target.value)}
              placeholder="Ex: Magmo Solucoes Construtivas"
              disabled={running}
              className="mt-1"
            />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input
              value={cnpjEmpresa}
              onChange={e => setCnpjEmpresa(e.target.value)}
              placeholder="52711905000173"
              disabled={running}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="flex items-center gap-1">
              ID da Empresa no V2
              <span className="text-xs font-normal text-amber-600 ml-1">(obrigatório — cole o UUID retornado pelo SQL de setup)</span>
            </Label>
            <Input
              value={empresaIdManual}
              onChange={e => setEmpresaIdManual(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              disabled={running}
              className="mt-1 font-mono text-xs"
            />
            <p className="text-xs text-gray-400 mt-1">
              Obtido em: Supabase V2 → SQL Editor → resultado do migration_v2_completo.sql
            </p>
          </div>
          {empresaId && (
            <div className="md:col-span-2 bg-green-50 rounded p-2">
              <p className="text-xs text-green-700 font-mono">✅ Usando empresa_id: {empresaId}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Etapas da Migração</CardTitle>
        </CardHeader>
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
                    <div className="mt-1">
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, (s.migrated / s.total) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{s.migrated} / {s.total} registros</p>
                    </div>
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
                      <><Play       className="w-4 h-4 mr-2" /> Iniciar Migração Completa</>}
        </Button>
      </div>

      {/* Resultado */}
      {done && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
              <div className="w-full">
                <p className="font-bold text-green-800 text-lg">Migração concluída com sucesso! 🎉</p>
                <p className="text-green-700 text-sm mt-1">Todos os dados foram importados para o banco V2.</p>
                <div className="mt-3 grid grid-cols-3 md:grid-cols-5 gap-2">
                  {steps.map(s => (
                    <div key={s.id} className="bg-white rounded-lg p-3 text-center border border-green-200">
                      <p className="text-xl font-bold text-green-700">{s.migrated}</p>
                      <p className="text-xs text-gray-500 leading-tight">{s.label.replace('Migrar ', '').replace('Criar ', '')}</p>
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
          <CardHeader>
            <CardTitle className="text-sm font-mono flex items-center gap-2">
              <ChevronRight className="w-3 h-3" /> Log de Execução ({logs.length} eventos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-xs space-y-1">
              {logs.map((l, i) => (
                <p key={i} className={
                  l.includes('❌') ? 'text-red-400' :
                  l.includes('✅') || l.includes('🎉') ? 'text-green-400' :
                  l.includes('⚠️') ? 'text-yellow-400' :
                  l.includes('📋') ? 'text-blue-400' :
                  l.includes('🚀') ? 'text-purple-400' :
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
