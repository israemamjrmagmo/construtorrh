import React, { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Colaborador, Funcao, Obra } from '@/lib/supabase'
import { fetchEmpresaData } from '@/lib/relatorioHeader'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Search, Plus, Pencil, Trash2, FileText, Eye, Printer, X, ChevronRight } from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
interface Modelo {
  id: string
  created_at: string
  updated_at: string
  numero: number | null
  titulo: string
  categoria: string
  tipo_contrato: string[] | null
  descricao: string | null
  conteudo: string
  ativo: boolean
  ordem: number
}

type ColaboradorRow = Colaborador & {
  funcoes?: Pick<Funcao, 'nome' | 'sigla'>
  obras?: Pick<Obra, 'nome' | 'codigo'>
}

// ─── constantes ──────────────────────────────────────────────────────────────
const CATEGORIAS: Record<string, { label: string; cor: string; bg: string; emoji: string }> = {
  admissional: { label: 'Admissional',  cor: '#0369a1', bg: '#e0f2fe', emoji: '📋' },
  contrato:    { label: 'Contrato',     cor: '#15803d', bg: '#dcfce7', emoji: '📜' },
  termo:       { label: 'Termo',        cor: '#7c3aed', bg: '#ede9fe', emoji: '📝' },
  declaracao:  { label: 'Declaração',   cor: '#b45309', bg: '#fef3c7', emoji: '✍️'  },
  politica:    { label: 'Política',     cor: '#be185d', bg: '#fce7f3', emoji: '⚖️'  },
  ficha:       { label: 'Ficha',        cor: '#0f766e', bg: '#ccfbf1', emoji: '📁' },
  outro:       { label: 'Outro',        cor: '#64748b', bg: '#f1f5f9', emoji: '📄' },
}

const ALL_CATS = ['todos', ...Object.keys(CATEGORIAS)]

// ─── mapeamento de variáveis → dados do colaborador ──────────────────────────
function buildVarMap(c: ColaboradorRow | null, emp: {
  nome: string; cnpj: string; endereco: string; cidade: string; razaoSocial: string
}): Record<string, string> {
  if (!c) return {}
  const hoje = new Date()
  const dia   = String(hoje.getDate()).padStart(2, '0')
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  const mes   = meses[hoje.getMonth()]
  const ano   = String(hoje.getFullYear())
  const fmtDate = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : ''
  const salFmt  = c.salario ? `R$ ${c.salario.toLocaleString('pt-BR',{minimumFractionDigits:2})}` : ''
  const salExt  = '' // campo manual
  const fn  = (c.funcoes as any)?.nome ?? ''
  const ob  = (c.obras  as any)?.nome  ?? ''
  const genero: Record<string,string> = { masculino:'brasileiro', feminino:'brasileira', outro:'brasileiro(a)' }
  const civil:  Record<string,string> = { solteiro:'solteiro(a)', casado:'casado(a)', divorciado:'divorciado(a)', viuvo:'viúvo(a)', uniao_estavel:'em união estável' }
  const contr:  Record<string,string> = { clt:'CLT', autonomo:'Autônomo', pj:'PJ', temporario:'Temporário', aprendiz:'Menor Aprendiz', estagiario:'Estagiário' }

  return {
    // ── Dados do colaborador ──────────────────────────────────────
    'Nome Completo do Empregado':          c.nome,
    'NOME COMPLETO':                       c.nome,
    'Nome do(a) Novo(a) Colaborador(a)':  c.nome,
    'NOME':                                c.nome,
    'Número do CPF':                       c.cpf ?? '',
    'Número do RG':                        c.rg  ?? '',
    'Número do PIS/PASEP':                 c.pis_nit ?? '',
    'Número da CTPS':                      c.ctps_numero ?? '',
    'Série da CTPS':                       c.ctps_serie ?? '',
    'Nacionalidade':                       genero[c.genero ?? ''] ?? 'brasileiro(a)',
    'Estado Civil':                        civil[c.estado_civil ?? ''] ?? '',
    'Profissão':                           fn,
    'Profissão/Função':                    fn,
    'NOME DA FUNÇÃO':                      fn,
    'FUNÇÃO':                              fn,
    'Endereço Completo do Empregado, não esquecer de colocar número, quadra, lote e CEP': `${c.endereco ?? ''}, ${c.cidade ?? ''} - ${c.estado ?? ''}, CEP ${c.cep ?? ''}`,
    'Endereço Completo do Empregado':      `${c.endereco ?? ''}, ${c.cidade ?? ''} - ${c.estado ?? ''}`,
    'Data de Início':                      fmtDate(c.data_admissao),
    'LOCAL DA PRESTAÇÃO DOS SERVIÇOS':     ob,
    'Data do Exame Admissional':           fmtDate(c.data_admissao),
    'DATA DO EXAME ADMISSIONAL':           fmtDate(c.data_admissao),
    // ── Salário ───────────────────────────────────────────────────
    'valor numérico':                      salFmt,
    'valor por extenso':                   salExt,
    // ── Empresa ───────────────────────────────────────────────────
    'Nome Completo ou Razão Social do Empregador': emp.nome,
    'Razão Social da Empresa':             emp.razaoSocial || emp.nome,
    'Número do CNPJ':                      emp.cnpj,
    'Endereço Completo do Empregador':     emp.endereco,
    'NOME FANTASIA DA EMPRESA':            emp.nome,
    // ── Data ──────────────────────────────────────────────────────
    'DIA':   dia,
    'MÊS':   mes,
    'ANO':   ano,
    'CIDADE': emp.cidade || 'São Paulo',
    'cidade/estado/raio km': emp.cidade,
    'região metropolitana de CIDADE DA PRESTAÇÃO DE SERVIÇOS': emp.cidade,
  }
}

function aplicarVariaveis(conteudo: string, varMap: Record<string, string>): string {
  let result = conteudo
  // Substitui {{VARIAVEL}} pelo valor mapeado (case-insensitive fuzzy)
  result = result.replace(/\{\{([^}]+)\}\}/g, (_, chave) => {
    // Busca exata primeiro
    if (varMap[chave] !== undefined) return varMap[chave] || `<span style="background:#fef9c3;border-bottom:2px solid #ca8a04;padding:0 3px">{{${chave}}}</span>`
    // Busca parcial (chave contém ou está contida)
    const k = chave.toLowerCase()
    for (const [key, val] of Object.entries(varMap)) {
      if (key.toLowerCase().includes(k) || k.includes(key.toLowerCase())) {
        return val || `<span style="background:#fef9c3;border-bottom:2px solid #ca8a04;padding:0 3px">{{${chave}}}</span>`
      }
    }
    // Não mapeado — destaca em amarelo para preenchimento manual
    return `<span style="background:#fef9c3;border-bottom:2px solid #ca8a04;padding:0 3px;border-radius:3px">{{${chave}}}</span>`
  })
  return result
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^#{3}\s+(.+)$/gm, '<h3 style="font-size:14px;font-weight:700;margin:14px 0 6px">$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2 style="font-size:16px;font-weight:800;margin:18px 0 8px">$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1 style="font-size:20px;font-weight:900;margin:0 0 14px;text-align:center">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,   '<em>$1</em>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>')
    .replace(/^☐\s*/gm, '<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #64748b;border-radius:2px;margin-right:6px;vertical-align:middle"></span>')
    .replace(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/gm, '<tr><td style="padding:5px 10px;border:1px solid #e2e8f0">$1</td><td style="padding:5px 10px;border:1px solid #e2e8f0">$2</td></tr>')
    .replace(/(<tr>.*<\/tr>\s*)+/gs, m => `<table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:12px">${m}</table>`)
    .replace(/\n\n/g, '</p><p style="margin:8px 0">')
    .replace(/^(.)/gm, (line) => line.startsWith('<') ? line : line)
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function Contratos() {
  // listas
  const [modelos, setModelos]           = useState<Modelo[]>([])
  const [colaboradores, setColabs]      = useState<ColaboradorRow[]>([])
  const [loading, setLoading]           = useState(true)

  // filtros / seleção
  const [busca, setBusca]               = useState('')
  const [catFiltro, setCatFiltro]       = useState('todos')
  const [modeloSel, setModeloSel]       = useState<Modelo | null>(null)
  const [colabSel, setColabSel]         = useState<ColaboradorRow | null>(null)
  const [buscaColab, setBuscaColab]     = useState('')

  // empresa
  const [empData, setEmpData]           = useState({ nome: '', cnpj: '', endereco: '', cidade: '', razaoSocial: '' })

  // editor de modelo
  const [modalEditor, setModalEditor]   = useState(false)
  const [editModelo, setEditModelo]     = useState<Partial<Modelo> | null>(null)
  const [saving, setSaving]             = useState(false)

  // preview / confirmação exclusão
  const [showPreview, setShowPreview]   = useState(false)
  const [confirmDel, setConfirmDel]     = useState<Modelo | null>(null)

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [modRes, colRes] = await Promise.all([
      supabase.from('contratos_modelos').select('*').eq('ativo', true).order('ordem'),
      supabase.from('colaboradores')
        .select('id,nome,chapa,cpf,rg,pis_nit,ctps_numero,ctps_serie,genero,estado_civil,funcao_id,obra_id,salario,tipo_contrato,data_admissao,endereco,cidade,estado,cep,telefone,email,funcoes(nome,sigla),obras(nome,codigo)')
        .eq('status', 'ativo').order('nome'),
    ])
    if (modRes.data) setModelos(modRes.data as Modelo[])
    if (colRes.data) setColabs(colRes.data as ColaboradorRow[])
    try {
      const emp = await fetchEmpresaData()
      setEmpData({ nome: emp.nome, cnpj: emp.cnpj, endereco: emp.endereco, cidade: emp.cidade, razaoSocial: emp.razaoSocial })
    } catch { /* silencioso */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── filtros ────────────────────────────────────────────────────────────────
  const modelosFiltrados = modelos.filter(m => {
    const matchCat = catFiltro === 'todos' || m.categoria === catFiltro
    const q = busca.toLowerCase()
    const matchQ = !q || m.titulo.toLowerCase().includes(q) || (m.descricao ?? '').toLowerCase().includes(q)
    return matchCat && matchQ
  })

  const colabsFiltrados = colaboradores.filter(c => {
    const q = buscaColab.toLowerCase()
    return !q || c.nome.toLowerCase().includes(q) || (c.chapa ?? '').toLowerCase().includes(q)
  })

  // ── salvar modelo ──────────────────────────────────────────────────────────
  async function salvarModelo() {
    if (!editModelo?.titulo?.trim()) { toast.error('Título obrigatório'); return }
    if (!editModelo?.conteudo?.trim()) { toast.error('Conteúdo obrigatório'); return }
    setSaving(true)
    const payload = {
      titulo:    editModelo.titulo.trim(),
      categoria: editModelo.categoria ?? 'outro',
      conteudo:  editModelo.conteudo.trim(),
      descricao: editModelo.descricao ?? null,
      ativo:     true,
      updated_at: new Date().toISOString(),
    }
    const { error } = editModelo.id
      ? await supabase.from('contratos_modelos').update(payload).eq('id', editModelo.id)
      : await supabase.from('contratos_modelos').insert({ ...payload, ordem: modelos.length + 1 })
    if (error) toast.error('Erro ao salvar: ' + error.message)
    else { toast.success(editModelo.id ? 'Modelo atualizado!' : 'Modelo criado!'); setModalEditor(false); fetchAll() }
    setSaving(false)
  }

  // ── excluir modelo ─────────────────────────────────────────────────────────
  async function excluirModelo(m: Modelo) {
    const { error } = await supabase.from('contratos_modelos').update({ ativo: false }).eq('id', m.id)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Modelo removido'); setConfirmDel(null); if (modeloSel?.id === m.id) setModeloSel(null); fetchAll() }
  }

  // ── gerar PDF ──────────────────────────────────────────────────────────────
  async function gerarPDF() {
    if (!modeloSel) return
    const varMap = buildVarMap(colabSel, empData)
    const htmlConteudo = aplicarVariaveis(markdownToHtml(modeloSel.conteudo), varMap)
    const cat  = CATEGORIAS[modeloSel.categoria] ?? CATEGORIAS.outro
    const nomeColab = colabSel?.nome ?? 'Documento'
    const dataGer   = new Date().toLocaleDateString('pt-BR')

    // Salva no histórico se tiver colaborador
    if (colabSel) {
      await supabase.from('contratos_gerados').insert({
        modelo_id:      modeloSel.id,
        colaborador_id: colabSel.id,
        titulo_gerado:  `${modeloSel.titulo} — ${colabSel.nome}`,
        conteudo_final: htmlConteudo,
      })
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${modeloSel.titulo}${colabSel ? ' — ' + colabSel.nome : ''}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @page { size:A4; margin:20mm 18mm; }
  body { font-family:'Times New Roman',Georgia,serif; font-size:12px; color:#1a1a1a; background:#fff; line-height:1.7; }
  @media print { .no-print { display:none!important; } }
  .page { max-width:700px; margin:0 auto; padding:20px 0; }
  .doc-header { border-bottom:2px solid #1e3a5f; padding-bottom:14px; margin-bottom:22px; display:flex; justify-content:space-between; align-items:flex-end; }
  .doc-header-left .emp { font-size:15px; font-weight:800; color:#1e3a5f; letter-spacing:-.01em; }
  .doc-header-left .sub { font-size:10px; color:#64748b; margin-top:2px; }
  .doc-header-right { text-align:right; font-size:10px; color:#64748b; }
  .badge { display:inline-block; background:${cat.bg}; color:${cat.cor}; border-radius:20px; padding:2px 10px; font-size:10px; font-weight:700; margin-bottom:6px; font-family:'Segoe UI',Arial,sans-serif; }
  .content h1 { font-size:16px; font-weight:800; text-align:center; margin:0 0 18px; text-transform:uppercase; letter-spacing:.04em; }
  .content h2 { font-size:13px; font-weight:700; margin:18px 0 8px; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid #e2e8f0; padding-bottom:4px; }
  .content h3 { font-size:12px; font-weight:700; margin:14px 0 5px; }
  .content p  { margin:8px 0; text-align:justify; }
  .content table { width:100%; border-collapse:collapse; margin:10px 0; font-size:11px; }
  .content table td, .content table th { border:1px solid #d1d5db; padding:5px 8px; }
  .content table th { background:#f8fafc; font-weight:700; }
  .sign-block { margin-top:40px; display:flex; gap:40px; }
  .sign-line { flex:1; border-top:1px solid #0f172a; padding-top:6px; text-align:center; font-size:11px; }
  .no-print { position:fixed; bottom:16px; right:16px; background:#1d4ed8; color:#fff; border:none; border-radius:9px; padding:10px 22px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.25); z-index:9999; }
  .no-print:hover { background:#1e40af; }
</style>
</head>
<body>
<div class="page">
  <div class="doc-header">
    <div class="doc-header-left">
      <div class="emp">${empData.nome || 'EMPRESA'}</div>
      <div class="sub">${empData.cnpj ? 'CNPJ: ' + empData.cnpj : ''}${empData.cidade ? ' · ' + empData.cidade : ''}</div>
    </div>
    <div class="doc-header-right">
      <div class="badge">${cat.emoji} ${cat.label}</div><br/>
      <span>Emitido em ${dataGer}</span>
      ${colabSel ? `<br/><strong>${colabSel.nome}</strong> · ${colabSel.chapa ?? ''}` : ''}
    </div>
  </div>
  <div class="content">${htmlConteudo}</div>
  <div class="sign-block">
    <div class="sign-line">${empData.nome || 'Empresa'}<br/>Representante Legal</div>
    ${colabSel ? `<div class="sign-line">${colabSel.nome}<br/>${(colabSel.funcoes as any)?.nome ?? 'Colaborador(a)'}</div>` : '<div class="sign-line">Colaborador(a)<br/>Assinatura</div>'}
  </div>
</div>
<button class="no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
<script>window.onload=()=>setTimeout(()=>window.print(),350)<\/script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=920,height=740')
    if (win) { win.document.write(html); win.document.close() }
    else toast.error('Bloqueio de pop-up detectado.')
  }

  // ── preview inline ─────────────────────────────────────────────────────────
  const previewHtml = modeloSel ? aplicarVariaveis(markdownToHtml(modeloSel.conteudo), buildVarMap(colabSel, empData)) : ''

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--background)' }}>

      {/* ── Topo ── */}
      <div style={{ padding: '14px 24px 10px', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            📜 Contratos e Documentos
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
            Selecione o modelo, escolha o colaborador e gere o documento preenchido automaticamente
          </p>
        </div>
        <button
          onClick={() => { setEditModelo({ titulo: '', categoria: 'outro', conteudo: '' }); setModalEditor(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '2px solid #059669', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          <Plus size={15} /> Novo Modelo
        </button>
      </div>

      {/* ── Layout 3 colunas ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── COL 1: Lista de modelos ── */}
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>

          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Busca */}
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar modelo…"
                style={{ width: '100%', height: 32, paddingLeft: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 12, color: 'var(--foreground)', outline: 'none' }} />
            </div>
            {/* Filtro categorias */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {ALL_CATS.map(cat => {
                const info = CATEGORIAS[cat]
                const ativo = catFiltro === cat
                return (
                  <button key={cat} onClick={() => setCatFiltro(cat)}
                    style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${ativo ? (info?.cor ?? '#1e3a5f') : 'transparent'}`, background: ativo ? (info?.bg ?? '#e2e8f0') : 'transparent', color: ativo ? (info?.cor ?? '#1e3a5f') : '#64748b' }}>
                    {cat === 'todos' ? 'Todos' : info?.label}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{modelosFiltrados.length} modelo(s)</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando…</div>
            ) : modelosFiltrados.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum modelo encontrado</div>
            ) : modelosFiltrados.map(m => {
              const cat  = CATEGORIAS[m.categoria] ?? CATEGORIAS.outro
              const sel  = modeloSel?.id === m.id
              return (
                <div key={m.id}
                  onClick={() => { setModeloSel(m); setShowPreview(false) }}
                  style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: sel ? 'hsl(var(--primary)/.08)' : 'transparent', borderLeft: `3px solid ${sel ? 'hsl(var(--primary))' : 'transparent'}`, transition: 'background .1s' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      {m.numero && <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>#{String(m.numero).padStart(2,'0')} </span>}
                      <span style={{ display: 'inline-block', background: cat.bg, color: cat.cor, borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 700, marginBottom: 2 }}>{cat.emoji} {cat.label}</span>
                      <div style={{ fontSize: 12, fontWeight: sel ? 700 : 600, color: sel ? 'hsl(var(--primary))' : 'var(--foreground)', lineHeight: 1.3, marginTop: 1 }}>{m.titulo}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); setEditModelo(m); setModalEditor(true) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }} title="Editar">
                        <Pencil size={11} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDel(m) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }} title="Excluir">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── COL 2: Painel central — colaborador + ações ── */}
        <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!modeloSel ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#94a3b8', padding: 24, textAlign: 'center' }}>
              <FileText size={40} strokeWidth={1.2} />
              <div style={{ fontSize: 13 }}>Selecione um modelo na lista ao lado</div>
            </div>
          ) : (
            <>
              {/* Info do modelo */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
                {(() => { const cat = CATEGORIAS[modeloSel.categoria] ?? CATEGORIAS.outro; return (
                  <span style={{ display: 'inline-block', background: cat.bg, color: cat.cor, borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{cat.emoji} {cat.label}</span>
                )})()}
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: 'var(--foreground)' }}>{modeloSel.titulo}</div>
                {modeloSel.descricao && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{modeloSel.descricao}</div>}
              </div>

              {/* Colaborador */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>👤 Colaborador (opcional)</div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search size={12} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input value={buscaColab} onChange={e => setBuscaColab(e.target.value)} placeholder="Nome ou chapa…"
                    style={{ width: '100%', height: 30, paddingLeft: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 12, outline: 'none' }} />
                </div>
                {colabSel && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '6px 10px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>{colabSel.nome}</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{colabSel.chapa} · {(colabSel.funcoes as any)?.nome ?? '—'}</div>
                    </div>
                    <button onClick={() => setColabSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={13} /></button>
                  </div>
                )}
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                  {colabsFiltrados.slice(0, 50).map(c => (
                    <div key={c.id} onClick={() => { setColabSel(c); setBuscaColab('') }}
                      style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: colabSel?.id === c.id ? 'hsl(var(--primary)/.08)' : 'transparent', fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>{c.nome}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.chapa} · {(c.funcoes as any)?.nome ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Aviso de variáveis não preenchidas */}
              {!colabSel && (
                <div style={{ margin: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '8px 10px', fontSize: 11, color: '#92400e' }}>
                  ⚠️ Sem colaborador selecionado, os campos <span style={{ background: '#fef9c3', borderBottom: '1px solid #ca8a04', padding: '0 2px' }}>{'{{variáveis}}'}</span> ficarão em destaque para preenchimento manual.
                </div>
              )}

              {/* Ações */}
              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                <button onClick={() => setShowPreview(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: '1px solid #0369a1', background: '#eff6ff', color: '#0369a1', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <Eye size={14} /> Pré-visualizar
                </button>
                <button onClick={gerarPDF}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: '2px solid #059669', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(5,150,105,.3)' }}>
                  <Printer size={14} /> Gerar e Imprimir PDF
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── COL 3: Preview do documento ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!modeloSel ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#94a3b8' }}>
              <FileText size={56} strokeWidth={1} />
              <div style={{ fontSize: 14, textAlign: 'center' }}>Selecione um modelo para ver o preview</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                  📄 Preview — {modeloSel.titulo}{colabSel ? ` · ${colabSel.nome}` : ' · (sem colaborador)'}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', padding: '2px 8px', background: '#f1f5f9', borderRadius: 4 }}>
                    Os campos em <span style={{ background: '#fef9c3', borderBottom: '1px solid #ca8a04', padding: '0 2px' }}>amarelo</span> precisam de preenchimento manual
                  </span>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#f8fafc' }}>
                <div style={{ background: '#fff', maxWidth: 680, margin: '0 auto', borderRadius: 8, padding: '32px 36px', boxShadow: '0 1px 8px rgba(0,0,0,.08)', fontFamily: "'Times New Roman',Georgia,serif", fontSize: 12, lineHeight: 1.8, color: '#1a1a1a' }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ MODAL: Editor de modelo ══ */}
      {modalEditor && editModelo !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModalEditor(false) }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.35)' }}>

            {/* Header modal */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{editModelo.id ? '✏️ Editar Modelo' : '➕ Novo Modelo'}</div>
              <button onClick={() => setModalEditor(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#64748b' }}>✕</button>
            </div>

            <div style={{ overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Título *</label>
                  <Input value={editModelo.titulo ?? ''} onChange={e => setEditModelo(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex.: Contrato de Trabalho CLT" />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Categoria *</label>
                  <select value={editModelo.categoria ?? 'outro'} onChange={e => setEditModelo(p => ({ ...p, categoria: e.target.value }))}
                    style={{ width: '100%', height: 36, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13, paddingLeft: 8 }}>
                    {Object.entries(CATEGORIAS).map(([key, v]) => (
                      <option key={key} value={key}>{v.emoji} {v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Descrição (opcional)</label>
                <Input value={editModelo.descricao ?? ''} onChange={e => setEditModelo(p => ({ ...p, descricao: e.target.value }))} placeholder="Breve descrição do documento…" />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Conteúdo * (Markdown com {'{{variáveis}}'})</label>
                  <div style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
                    Ex: {'{{Nome Completo do Empregado}}'}, {'{{Número do CPF}}'}, {'{{FUNÇÃO}}'}
                  </div>
                </div>
                <textarea
                  value={editModelo.conteudo ?? ''}
                  onChange={e => setEditModelo(p => ({ ...p, conteudo: e.target.value }))}
                  rows={18}
                  placeholder={`# TÍTULO DO DOCUMENTO\n\nO(A) EMPREGADO(A) {{Nome Completo do Empregado}}, portador(a) do CPF nº {{Número do CPF}}...\n\n{{CIDADE}}, {{DIA}} de {{MÊS}} de {{ANO}}.`}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical', outline: 'none' }}
                />
              </div>

              {/* Guia de variáveis */}
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>📌 Variáveis disponíveis (serão substituídas automaticamente pelo sistema)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {[
                    'Nome Completo do Empregado','Número do CPF','Número do RG','Número do PIS/PASEP',
                    'Número da CTPS','Série da CTPS','Nacionalidade','Estado Civil','Profissão/Função',
                    'NOME DA FUNÇÃO','Endereço Completo do Empregado','CIDADE','DIA','MÊS','ANO',
                    'Nome Completo ou Razão Social do Empregador','Número do CNPJ',
                    'Endereço Completo do Empregador','valor numérico','Data de Início',
                  ].map(v => (
                    <code key={v} onClick={() => setEditModelo(p => ({ ...p, conteudo: (p?.conteudo ?? '') + `{{${v}}}` }))}
                      style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '1px 6px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace' }}
                      title="Clique para inserir">
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setModalEditor(false)}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={salvarModelo} disabled={saving}
                style={{ padding: '8px 22px', borderRadius: 8, border: '2px solid #059669', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Salvando…' : editModelo.id ? '💾 Salvar Alterações' : '✅ Criar Modelo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Confirmar exclusão ══ */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null) }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, maxWidth: 400, width: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>🗑️ Remover modelo?</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              O modelo <strong>"{confirmDel.titulo}"</strong> será desativado. Documentos já gerados não serão afetados.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => excluirModelo(confirmDel)} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Sim, remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
