import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { ClipboardList, AlertTriangle, UserPlus, ChevronRight, Building2 } from 'lucide-react'

interface ObraInfo { id: string; nome: string; codigo?: string }

export default function PortalHome() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const [obras,   setObras]   = useState<ObraInfo[]>([])
  const [contadores, setContadores] = useState<Record<string, { ponto: number; ocorr: number }>>({})
  const [loading, setLoading] = useState(true)
  const hoje = new Date().toISOString().slice(0, 10)

  const fetchData = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    setLoading(true)
    const ids = session.obras_ids
    if (!ids || ids.length === 0) { setLoading(false); return }

    const [{ data: obsData }, { data: pontosHoje }, { data: ocorrHoje }] = await Promise.all([
      supabase.from('obras').select('id,nome,codigo').in('id', ids).order('nome'),
      supabase.from('portal_ponto_diario').select('obra_id').in('obra_id', ids).eq('data', hoje),
      supabase.from('portal_ocorrencias').select('obra_id').in('obra_id', ids).eq('data', hoje),
    ])

    if (obsData) setObras(obsData)

    const cnt: Record<string, { ponto: number; ocorr: number }> = {}
    ids.forEach(id => { cnt[id] = { ponto: 0, ocorr: 0 } })
    pontosHoje?.forEach((r: any) => { if (cnt[r.obra_id]) cnt[r.obra_id].ponto++ })
    ocorrHoje?.forEach( (r: any) => { if (cnt[r.obra_id]) cnt[r.obra_id].ocorr++ })
    setContadores(cnt)
    setLoading(false)
  }, [session, hoje, nav])

  useEffect(() => { fetchData() }, [fetchData])

  if (!session) return null

  const dataHojeFmt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <PortalLayout>
      <div style={{ padding: '20px 16px 8px' }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2, textTransform: 'capitalize' }}>{dataHojeFmt}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1e3a5f', marginBottom: 4 }}>
          Olá, {(session.nome ?? session.login).split(' ')[0]}! 👋
        </div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Você tem acesso a <strong>{obras.length}</strong> obra{obras.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Atalhos rápidos */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
          Ações Rápidas
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { icon: <ClipboardList size={26} color="#1e3a5f" />, label: 'Lançar Ponto',  sub: 'Presenças do dia',  to: '/portal/ponto',        bg: '#eff6ff', border: '#bfdbfe' },
            { icon: <AlertTriangle size={26} color="#dc2626" />, label: 'Ocorrência',    sub: 'Registrar evento',  to: '/portal/ocorrencias',  bg: '#fef2f2', border: '#fecaca' },
            { icon: <UserPlus size={26} color="#15803d" />,      label: 'Cadastro',      sub: 'Novo colaborador',  to: '/portal/solicitacoes', bg: '#f0fdf4', border: '#bbf7d0' },
            { icon: <span style={{fontSize:26}}>🦺</span>,       label: 'Solicitar EPI', sub: 'Equipamentos',      to: '/portal/epis',         bg: '#fff7ed', border: '#fed7aa' },
          ].map(a => (
            <div key={a.to} onClick={() => nav(a.to)}
              style={{
                background: a.bg, border: `1px solid ${a.border}`, borderRadius: 14,
                padding: '16px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                gap: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'transform 0.1s',
              }}
              onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.97)')}
              onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}>
              {a.icon}
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{a.label}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{a.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </PortalLayout>
  )
}
