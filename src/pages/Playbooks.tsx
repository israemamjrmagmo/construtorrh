import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, BookOpen, ChevronDown, ChevronRight, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useProfile } from '@/hooks/useProfile'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PlaybookItem {
  id: string
  obra_id: string
  descricao: string
  unidade: string          // m², m³, un, pç, verba…
  preco_unitario: number
  categoria: string | null
  ativo: boolean
}

interface ObraComItens {
  id: string
  nome: string
  codigo: string | null
  itens: PlaybookItem[]
  aberta: boolean
}

const UNIDADES = ['m²','m³','m','un','pç','kg','t','h','verba','outro']
const CATEGORIAS = ['Alvenaria','Argamassa','Concretagem','Revestimento','Pintura','Instalações','Estrutura','Cobertura','Esquadrias','Outros']

const ITEM_EMPTY = (): Omit<PlaybookItem,'id'|'obra_id'> => ({
  descricao: '', unidade: 'm²', preco_unitario: 0, categoria: null, ativo: true
})

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Playbooks() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()

  const [obras, setObras] = useState<ObraComItens[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  // Modal
  const [modal, setModal] = useState(false)
  const [editItem, setEditItem] = useState<PlaybookItem | null>(null)
  const [obraIdModal, setObraIdModal] = useState<string>('')
  const [form, setForm] = useState(ITEM_EMPTY())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PlaybookItem | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: obrasRaw }, { data: itensRaw }] = await Promise.all([
      supabase.from('obras').select('id, nome, codigo').order('nome'),
      supabase.from('playbook_itens').select('*').order('categoria').order('descricao'),
    ])

    const mapaItens: Record<string, PlaybookItem[]> = {}
    ;(itensRaw ?? []).forEach((i: any) => {
      if (!mapaItens[i.obra_id]) mapaItens[i.obra_id] = []
      mapaItens[i.obra_id].push(i as PlaybookItem)
    })

    setObras((obrasRaw ?? []).map((o: any) => ({
      id: o.id, nome: o.nome, codigo: o.codigo ?? null,
      itens: mapaItens[o.id] ?? [],
      aberta: (mapaItens[o.id] ?? []).length > 0,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openNew(obraId: string) {
    setEditItem(null)
    setObraIdModal(obraId)
    setForm(ITEM_EMPTY())
    setModal(true)
  }

  function openEdit(item: PlaybookItem) {
    setEditItem(item)
    setObraIdModal(item.obra_id)
    setForm({ descricao: item.descricao, unidade: item.unidade, preco_unitario: item.preco_unitario, categoria: item.categoria, ativo: item.ativo })
    setModal(true)
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.descricao.trim()) { toast.error('Informe a descrição do serviço'); return }
    if (!form.preco_unitario || form.preco_unitario <= 0) { toast.error('Informe o preço unitário'); return }
    setSaving(true)

    const payload = { obra_id: obraIdModal, ...form }

    const { error } = editItem
      ? await supabase.from('playbook_itens').update(payload).eq('id', editItem.id)
      : await supabase.from('playbook_itens').insert(payload)

    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editItem ? 'Item atualizado!' : 'Item adicionado!')
    setModal(false)
    fetchData()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('playbook_itens').delete().eq('id', deleteTarget.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Item removido')
    setDeleteTarget(null)
    fetchData()
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  function toggleObra(id: string) {
    setObras(prev => prev.map(o => o.id === id ? { ...o, aberta: !o.aberta } : o))
  }

  const obrasFiltradas = obras.filter(o =>
    !busca || o.nome.toLowerCase().includes(busca.toLowerCase()) ||
    o.itens.some(i => i.descricao.toLowerCase().includes(busca.toLowerCase()) || (i.categoria ?? '').toLowerCase().includes(busca.toLowerCase()))
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>📋 Playbooks de Produção</h1>
          <p style={{ fontSize:13, color:'var(--muted-foreground)', marginTop:4 }}>
            Tabela de preços por produção por obra — base para apuração de pagamento variável
          </p>
        </div>
        <Input placeholder="🔍 Buscar obra ou serviço…" value={busca} onChange={e => setBusca(e.target.value)} style={{ width:260, fontSize:13 }} />
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--muted-foreground)' }}>Carregando…</div>
      ) : obrasFiltradas.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--muted-foreground)' }}>Nenhuma obra encontrada</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {obrasFiltradas.map(obra => (
            <div key={obra.id} style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>

              {/* Cabeçalho da obra */}
              <div
                onClick={() => toggleObra(obra.id)}
                style={{ display:'flex', alignItems:'center', padding:'12px 16px', cursor:'pointer', background:'var(--muted)', gap:10, userSelect:'none' }}
              >
                {obra.aberta ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                <BookOpen size={16} style={{ color:'var(--primary)' }}/>
                <div style={{ flex:1 }}>
                  <span style={{ fontWeight:700, fontSize:15 }}>{obra.nome}</span>
                  {obra.codigo && <span style={{ marginLeft:8, fontSize:11, fontFamily:'monospace', color:'var(--muted-foreground)' }}>#{obra.codigo}</span>}
                </div>
                <span style={{ fontSize:12, color:'var(--muted-foreground)' }}>
                  {obra.itens.length} {obra.itens.length === 1 ? 'serviço' : 'serviços'}
                </span>
                {canCreate && (
                  <Button size="sm" variant="outline" style={{ fontSize:11, height:28, gap:4 }}
                    onClick={e => { e.stopPropagation(); openNew(obra.id) }}>
                    <Plus size={12}/> Novo serviço
                  </Button>
                )}
              </div>

              {/* Itens */}
              {obra.aberta && (
                <div>
                  {obra.itens.length === 0 ? (
                    <div style={{ padding:'20px 24px', textAlign:'center', fontSize:13, color:'var(--muted-foreground)' }}>
                      Nenhum serviço cadastrado — clique em "Novo serviço" para adicionar
                    </div>
                  ) : (
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead>
                        <tr style={{ borderBottom:'2px solid var(--border)', background:'var(--background)' }}>
                          <th style={TH}>Serviço / Descrição</th>
                          <th style={TH}>Categoria</th>
                          <th style={{ ...TH, width:80, textAlign:'center' }}>Unidade</th>
                          <th style={{ ...TH, width:120, textAlign:'right' }}>Preço Unit.</th>
                          <th style={{ ...TH, width:70, textAlign:'center' }}>Status</th>
                          {(canEdit || canDelete) && <th style={{ ...TH, width:80 }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {obra.itens.map((item, idx) => (
                          <tr key={item.id} style={{ borderBottom:'1px solid var(--border)', background: idx%2===0?'transparent':'var(--muted)', opacity: item.ativo ? 1 : 0.5 }}>
                            <td style={{ padding:'10px 16px', fontWeight:600 }}>{item.descricao}</td>
                            <td style={{ padding:'10px 16px', color:'var(--muted-foreground)' }}>{item.categoria ?? '—'}</td>
                            <td style={{ padding:'10px 8px', textAlign:'center' }}>
                              <span style={{ background:'var(--muted)', borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{item.unidade}</span>
                            </td>
                            <td style={{ padding:'10px 16px', textAlign:'right', fontWeight:700, fontSize:15, color:'#16a34a' }}>
                              R$ {item.preco_unitario.toFixed(2)}
                              <span style={{ fontSize:10, fontWeight:400, color:'var(--muted-foreground)', marginLeft:2 }}>/{item.unidade}</span>
                            </td>
                            <td style={{ padding:'10px 8px', textAlign:'center' }}>
                              <span style={{ fontSize:10, borderRadius:4, padding:'2px 6px', fontWeight:600,
                                background: item.ativo ? '#dcfce7' : '#fee2e2',
                                color:      item.ativo ? '#15803d' : '#b91c1c' }}>
                                {item.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            {(canEdit || canDelete) && (
                              <td style={{ padding:'6px 8px', textAlign:'right' }}>
                                <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                                  {canEdit   && <Button variant="ghost" size="icon" style={{ width:28, height:28 }} onClick={() => openEdit(item)}><Pencil size={12}/></Button>}
                                  {canDelete && <Button variant="ghost" size="icon" style={{ width:28, height:28, color:'var(--destructive)' }} onClick={() => setDeleteTarget(item)}><Trash2 size={12}/></Button>}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modal de item ─────────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--background)', borderRadius:12, width:480, padding:28, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontWeight:800, fontSize:16, margin:0 }}>
                {editItem ? 'Editar Serviço' : 'Novo Serviço'}
              </h3>
              <button onClick={() => setModal(false)} style={{ border:'none', background:'none', cursor:'pointer' }}><X size={18}/></button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={LBL}>Obra</label>
                <div style={{ fontSize:13, fontWeight:600, padding:'8px 12px', background:'var(--muted)', borderRadius:6 }}>
                  {obras.find(o=>o.id===obraIdModal)?.nome ?? '—'}
                </div>
              </div>

              <div>
                <label style={LBL}>Descrição do Serviço *</label>
                <Input value={form.descricao} onChange={e=>setForm(f=>({...f, descricao:e.target.value}))} placeholder="Ex: Alvenaria de bloco cerâmico" />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={LBL}>Categoria</label>
                  <select value={form.categoria ?? ''} onChange={e=>setForm(f=>({...f, categoria:e.target.value||null}))} style={SEL}>
                    <option value="">Selecionar…</option>
                    {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LBL}>Unidade *</label>
                  <select value={form.unidade} onChange={e=>setForm(f=>({...f, unidade:e.target.value}))} style={SEL}>
                    {UNIDADES.map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={LBL}>Preço por {form.unidade} (R$) *</label>
                <Input type="number" min="0" step="0.01"
                  value={form.preco_unitario || ''}
                  onChange={e=>setForm(f=>({...f, preco_unitario:parseFloat(e.target.value)||0}))}
                  placeholder="0,00" />
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="checkbox" id="ativo" checked={form.ativo} onChange={e=>setForm(f=>({...f, ativo:e.target.checked}))} />
                <label htmlFor="ativo" style={{ fontSize:13, cursor:'pointer' }}>Serviço ativo (disponível para lançamento)</label>
              </div>
            </div>

            <div style={{ display:'flex', gap:10, marginTop:24, justifyContent:'flex-end' }}>
              <Button variant="outline" onClick={()=>setModal(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving?'Salvando…':'💾 Salvar'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--background)', borderRadius:12, width:400, padding:28 }}>
            <h3 style={{ fontWeight:700, marginBottom:10 }}>Remover serviço?</h3>
            <p style={{ fontSize:13, color:'var(--muted-foreground)', marginBottom:20 }}>
              "<strong>{deleteTarget.descricao}</strong>" será removido do playbook. Lançamentos de produção existentes não serão afetados.
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <Button variant="outline" onClick={()=>setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete}>Remover</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TH: React.CSSProperties = { padding:'8px 16px', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.04em', textAlign:'left', whiteSpace:'nowrap', color:'var(--muted-foreground)' }
const LBL: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, marginBottom:4, color:'var(--muted-foreground)' }
const SEL: React.CSSProperties = { width:'100%', padding:'8px 10px', fontSize:13, border:'1px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)' }
