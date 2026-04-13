/**
 * Perfil.tsx — Página de perfil do usuário logado
 *
 * Seções:
 *  1. Avatar + info principal (nome, e-mail, role, data de criação)
 *  2. Editar nome de exibição
 *  3. Alterar senha (email de reset via Supabase)
 *  4. Informações da conta (ID, último login, provider)
 *  5. Atividade: role e permissões do usuário
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useProfile, ROLE_PERMISSIONS } from '@/hooks/useProfile'
import { PageHeader } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  User, Mail, Shield, KeyRound, Clock, CheckCircle2,
  Pencil, Save, X, LogOut, RefreshCw, Eye, EyeOff,
  BadgeCheck, Fingerprint, CalendarDays, AlertCircle,
} from 'lucide-react'

// ─── Cores por role ───────────────────────────────────────────────────────────
const SIDEBAR_BG = '#0d3f56'

export default function Perfil() {
  const navigate        = useNavigate()
  const { user, signOut } = useAuth()
  const { profile }     = useProfile()

  // ── Estado de edição do nome ───────────────────────────────────────────────
  const [editandoNome, setEditandoNome] = useState(false)
  const [novoNome,     setNovoNome]     = useState('')
  const [salvandoNome, setSalvandoNome] = useState(false)

  // ── Estado de alteração de senha ───────────────────────────────────────────
  const [senhaAtual,    setSenhaAtual]    = useState('')
  const [novaSenha,     setNovaSenha]     = useState('')
  const [confirma,      setConfirma]      = useState('')
  const [showSenhaAt,   setShowSenhaAt]   = useState(false)
  const [showNovaSenha, setShowNovaSenha] = useState(false)
  const [showConfirma,  setShowConfirma]  = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  // ── Estado reset-por-email ─────────────────────────────────────────────────
  const [enviandoReset, setEnviandoReset] = useState(false)
  const [resetEnviado,  setResetEnviado]  = useState(false)

  // ── Preenche nome ao carregar ──────────────────────────────────────────────
  useEffect(() => {
    setNovoNome(profile?.nome ?? user?.email?.split('@')[0] ?? '')
  }, [profile, user])

  // ── Salvar nome ────────────────────────────────────────────────────────────
  const handleSaveNome = useCallback(async () => {
    if (!novoNome.trim()) { toast.error('Nome não pode ser vazio'); return }
    if (!user?.id) return
    setSalvandoNome(true)
    const { error } = await supabase
      .from('profiles')
      .update({ nome: novoNome.trim() })
      .eq('id', user.id)
    setSalvandoNome(false)
    if (error) { toast.error('Erro ao salvar nome: ' + error.message); return }
    toast.success('Nome atualizado com sucesso!')
    setEditandoNome(false)
    // Recarrega o perfil forçando re-render
    window.location.reload()
  }, [novoNome, user])

  // ── Alterar senha inline ───────────────────────────────────────────────────
  const handleAlterarSenha = useCallback(async () => {
    if (!novaSenha.trim())        { toast.error('Digite a nova senha'); return }
    if (novaSenha.length < 6)     { toast.error('A senha deve ter pelo menos 6 caracteres'); return }
    if (novaSenha !== confirma)   { toast.error('As senhas não coincidem'); return }

    setSalvandoSenha(true)
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSalvandoSenha(false)

    if (error) {
      toast.error('Erro ao alterar senha: ' + error.message)
      return
    }
    toast.success('Senha alterada com sucesso! Faça login novamente.')
    setSenhaAtual(''); setNovaSenha(''); setConfirma('')
    setTimeout(() => { signOut(); navigate('/login') }, 2000)
  }, [novaSenha, confirma, signOut, navigate])

  // ── Reset por e-mail ───────────────────────────────────────────────────────
  const handleResetEmail = useCallback(async () => {
    if (!user?.email) return
    setEnviandoReset(true)
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/#/login`,
    })
    setEnviandoReset(false)
    if (error) { toast.error('Erro ao enviar e-mail: ' + error.message); return }
    setResetEnviado(true)
    toast.success('E-mail de redefinição enviado! Verifique sua caixa de entrada.')
  }, [user])

  // ── Dados derivados ────────────────────────────────────────────────────────
  const nomeExibicao = profile?.nome ?? user?.email?.split('@')[0] ?? 'usuário'
  const initials = nomeExibicao.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
  const role = profile?.role ?? 'visualizador'
  const roleMeta = ROLE_PERMISSIONS[role]
  const email = user?.email ?? '—'
  const criadoEm = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })
    : '—'
  const ultimoLogin = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : '—'

  // ── Permissões em lista ────────────────────────────────────────────────────
  const permissoes = [
    { label: 'Criar registros',    ok: roleMeta.canCreate },
    { label: 'Editar registros',   ok: roleMeta.canEdit },
    { label: 'Excluir registros',  ok: roleMeta.canDelete },
    { label: 'Ver financeiro',     ok: roleMeta.canViewFinanceiro },
  ]

  const senhaValida = novaSenha.length >= 6
  const senhasBatem = novaSenha === confirma && confirma.length > 0

  return (
    <div className="page-root">
      <PageHeader
        title="Meu Perfil"
        subtitle="Informações da sua conta e configurações de segurança"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20, maxWidth: 900 }}
        className="perfil-grid">
        <style>{`
          @media(max-width:680px){.perfil-grid{grid-template-columns:1fr!important}}
        `}</style>

        {/* ══ COLUNA ESQUERDA ══════════════════════════════════════════════════ */}

        {/* Card: Avatar + Info principal */}
        <div style={{ gridColumn: 'span 2' }} className="perfil-full">
          <style>{`.perfil-full{grid-column:span 2}@media(max-width:680px){.perfil-full{grid-column:1!important}}`}</style>
          <div style={{
            background: `linear-gradient(135deg, ${SIDEBAR_BG} 0%, #0a3347 60%, #0f4f2e 100%)`,
            borderRadius: 16, padding: '28px 28px', marginBottom: 0,
            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
          }}>
            {/* Avatar grande */}
            <div style={{
              width: 72, height: 72, borderRadius: 18, flexShrink: 0,
              background: 'rgba(255,255,255,0.18)',
              border: '2.5px solid rgba(255,255,255,0.30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 900, color: '#fff',
              letterSpacing: '-1px',
            }}>
              {initials}
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Conta ativa
              </div>
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, lineHeight: 1.2, marginTop: 3 }}>
                {nomeExibicao}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Mail size={12} />
                {email}
              </div>
            </div>

            {/* Badge de role */}
            <div style={{
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 12, padding: '10px 16px', textAlign: 'center', flexShrink: 0,
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Nível de acesso</div>
              <div style={{
                fontSize: 14, fontWeight: 900, color: '#fff',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <BadgeCheck size={16} />
                {roleMeta.label}
              </div>
            </div>
          </div>
        </div>

        {/* ── Card: Editar nome ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={15} color="#2563eb" />
              </div>
              Nome de Exibição
            </div>
            {!editandoNome && (
              <button
                onClick={() => setEditandoNome(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}
              >
                <Pencil size={12} /> Editar
              </button>
            )}
          </div>

          {editandoNome ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <Label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Novo nome</Label>
                <Input
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  placeholder="Seu nome completo"
                  style={{ marginTop: 4 }}
                  onKeyDown={e => e.key === 'Enter' && handleSaveNome()}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={handleSaveNome} disabled={salvandoNome} style={{ flex: 1, gap: 6 }} size="sm">
                  <Save size={13} /> {salvandoNome ? 'Salvando…' : 'Salvar'}
                </Button>
                <Button variant="outline" onClick={() => { setEditandoNome(false); setNovoNome(profile?.nome ?? '') }} size="sm" style={{ gap: 6 }}>
                  <X size={13} /> Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{nomeExibicao}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Nome exibido no sistema e no portal</div>
            </div>
          )}

          {/* E-mail (somente leitura) */}
          <div style={{ marginTop: 14 }}>
            <Label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>E-mail da conta</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <Mail size={13} color="#94a3b8" />
              <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{email}</span>
              <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>somente leitura</span>
            </div>
          </div>
        </div>

        {/* ── Card: Informações da conta ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Fingerprint size={15} color="#059669" />
            </div>
            Informações da Conta
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: <Fingerprint size={13} color="#94a3b8" />, label: 'ID do usuário', value: user?.id?.slice(0, 18) + '…' ?? '—' },
              { icon: <CalendarDays size={13} color="#94a3b8" />, label: 'Conta criada em', value: criadoEm },
              { icon: <Clock size={13} color="#94a3b8" />, label: 'Último acesso', value: ultimoLogin },
              { icon: <Shield size={13} color="#94a3b8" />, label: 'Método de login', value: user?.app_metadata?.provider === 'email' ? 'E-mail / Senha' : (user?.app_metadata?.provider ?? 'Email') },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#f8fafc', borderRadius: 9, border: '1px solid #e2e8f0' }}>
                <div style={{ flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: '#374151', fontWeight: 600, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Card: Alterar senha ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound size={15} color="#b45309" />
            </div>
            Alterar Senha
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Nova senha */}
            <div>
              <Label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Nova senha</Label>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <Input
                  type={showNovaSenha ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  style={{ paddingRight: 38 }}
                />
                <button
                  onClick={() => setShowNovaSenha(p => !p)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                >
                  {showNovaSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {/* Indicador de força */}
              {novaSenha.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, transition: 'width 0.3s',
                      width: novaSenha.length < 6 ? '25%' : novaSenha.length < 10 ? '60%' : '100%',
                      background: novaSenha.length < 6 ? '#ef4444' : novaSenha.length < 10 ? '#f59e0b' : '#22c55e',
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: novaSenha.length < 6 ? '#ef4444' : novaSenha.length < 10 ? '#b45309' : '#15803d', marginTop: 3, fontWeight: 600 }}>
                    {novaSenha.length < 6 ? '⚠️ Muito curta' : novaSenha.length < 10 ? '👍 Boa' : '💪 Forte'}
                  </div>
                </div>
              )}
            </div>

            {/* Confirmar nova senha */}
            <div>
              <Label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Confirmar nova senha</Label>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <Input
                  type={showConfirma ? 'text' : 'password'}
                  value={confirma}
                  onChange={e => setConfirma(e.target.value)}
                  placeholder="Repita a nova senha"
                  style={{ paddingRight: 38, borderColor: confirma.length > 0 ? (senhasBatem ? '#22c55e' : '#ef4444') : undefined }}
                />
                <button
                  onClick={() => setShowConfirma(p => !p)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                >
                  {showConfirma ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {confirma.length > 0 && (
                <div style={{ fontSize: 10, marginTop: 3, fontWeight: 600, color: senhasBatem ? '#15803d' : '#ef4444' }}>
                  {senhasBatem ? '✅ Senhas coincidem' : '❌ Senhas não coincidem'}
                </div>
              )}
            </div>

            <Button
              onClick={handleAlterarSenha}
              disabled={salvandoSenha || !senhaValida || !senhasBatem}
              style={{ gap: 7, marginTop: 4 }}
            >
              <KeyRound size={14} />
              {salvandoSenha ? 'Alterando…' : 'Alterar Senha'}
            </Button>

            {/* Divisor OU */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>ou</span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>

            {/* Reset por e-mail */}
            {resetEnviado ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 9 }}>
                <CheckCircle2 size={16} color="#16a34a" />
                <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>E-mail de redefinição enviado para {email}</span>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={handleResetEmail}
                disabled={enviandoReset}
                style={{ gap: 7 }}
              >
                <RefreshCw size={14} />
                {enviandoReset ? 'Enviando…' : 'Receber link por e-mail'}
              </Button>
            )}
          </div>
        </div>

        {/* ── Card: Permissões do role ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: roleMeta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BadgeCheck size={15} color={roleMeta.color} />
            </div>
            Nível de Acesso
          </div>

          <div style={{ padding: '12px 14px', background: roleMeta.bg, borderRadius: 10, border: `1px solid ${roleMeta.color}30`, marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: roleMeta.color }}>{roleMeta.label}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Nível de permissão atribuído pelo administrador</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {permissoes.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: p.ok ? '#dcfce7' : '#fef2f2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {p.ok
                    ? <CheckCircle2 size={12} color="#16a34a" />
                    : <AlertCircle size={12} color="#dc2626" />}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{p.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: p.ok ? '#15803d' : '#dc2626' }}>
                  {p.ok ? 'Permitido' : 'Restrito'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Card: Ações da conta ── */}
        <div style={{ gridColumn: 'span 2', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22 }}
          className="perfil-full">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LogOut size={15} color="#dc2626" />
            </div>
            Ações da Conta
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              style={{ gap: 7 }}
            >
              ← Voltar
            </Button>

            <Button
              variant="outline"
              onClick={async () => {
                await signOut()
                navigate('/login')
              }}
              style={{ gap: 7, borderColor: '#fca5a5', color: '#dc2626', marginLeft: 'auto' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#fef2f2' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = '' }}
            >
              <LogOut size={14} /> Sair da conta
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}
