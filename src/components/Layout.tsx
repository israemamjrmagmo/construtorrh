import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  LayoutDashboard, Users, Building2, Briefcase, Shield,
  AlertTriangle, FileText, Clock, DollarSign, Award,
  Calculator, Bus, BarChart3, Settings, LogOut, Menu,
  HardHat, ChevronLeft, ChevronRight, FileWarning
} from 'lucide-react'

const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { to: '/colaboradores', label: 'Colaboradores', icon: Users },
      { to: '/obras',          label: 'Obras',         icon: Building2 },
      { to: '/funcoes',        label: 'Funções',        icon: Briefcase },
    ],
  },
  {
    label: 'Saúde & Segurança',
    items: [
      { to: '/epis',       label: 'EPIs',       icon: Shield },
      { to: '/acidentes',  label: 'Acidentes',  icon: AlertTriangle },
      { to: '/atestados',  label: 'Atestados',  icon: FileWarning },
      { to: '/documentos', label: 'Documentos', icon: FileText },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/ponto',      label: 'Ponto',           icon: Clock },
      { to: '/pagamentos', label: 'Pagamentos',       icon: DollarSign },
      { to: '/premios',    label: 'Prêmios',          icon: Award },
      { to: '/vt',         label: 'Vale Transporte',  icon: Bus },
      { to: '/provisoes',  label: 'Provisões FGTS',   icon: Calculator },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/relatorios',    label: 'Relatórios',    icon: BarChart3 },
      { to: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]

const SIDEBAR_W = 224
const SIDEBAR_W_COLLAPSED = 60

interface LayoutProps { children: React.ReactNode }

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initials = user?.email
    ? user.email.split('@')[0].slice(0, 2).toUpperCase()
    : 'RH'

  const sidebarWidth = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W

  return (
    <TooltipProvider delayDuration={200}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--background)' }}>

        {/* Overlay mobile */}
        {mobileOpen && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.6)' }}
            className="lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── SIDEBAR ────────────────────────────────────────────────────── */}
        <aside
          style={{
            width: sidebarWidth,
            minWidth: sidebarWidth,
            maxWidth: sidebarWidth,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--sidebar)',
            color: 'var(--sidebar-foreground)',
            borderRight: '1px solid var(--sidebar-border)',
            transition: 'width 200ms ease, min-width 200ms ease, max-width 200ms ease',
            position: 'relative',
            zIndex: 50,
            flexShrink: 0,
          }}
          className={cn(
            !mobileOpen && 'max-lg:!fixed max-lg:inset-y-0 max-lg:left-0',
            !mobileOpen && 'max-lg:!-translate-x-full',
            mobileOpen && 'max-lg:!fixed max-lg:inset-y-0 max-lg:left-0 max-lg:!translate-x-0',
          )}
        >
          {/* Logo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            height: 56,
            padding: collapsed ? '0' : '0 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderBottom: '1px solid var(--sidebar-border)',
            flexShrink: 0,
            gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, minWidth: 32,
              background: 'var(--sidebar-primary)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <HardHat size={16} color="var(--sidebar-primary-foreground)" />
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sidebar-foreground)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                  ConstrutorRH
                </p>
                <p style={{ fontSize: 10, color: 'var(--sidebar-foreground)', opacity: 0.4, lineHeight: 1.2 }}>
                  Gestão de RH
                </p>
              </div>
            )}
          </div>

          {/* Navegação */}
          <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
            {NAV_GROUPS.map((group, gi) => (
              <div key={gi} style={{ marginBottom: 4 }}>
                {/* Separador entre grupos quando collapsed */}
                {collapsed && gi > 0 && (
                  <div style={{ margin: '4px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
                )}

                {/* Label do grupo */}
                {!collapsed && (
                  <p style={{
                    padding: '8px 16px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--sidebar-foreground)',
                    opacity: 0.35,
                    userSelect: 'none',
                  }}>
                    {group.label}
                  </p>
                )}

                {/* Itens */}
                {group.items.map(({ to, label, icon: Icon }) => (
                  <Tooltip key={to}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={to}
                        end={to === '/'}
                        onClick={() => setMobileOpen(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: collapsed ? 0 : 10,
                          margin: collapsed ? '2px 6px' : '1px 8px',
                          padding: collapsed ? '0' : '7px 10px',
                          width: collapsed ? 48 : undefined,
                          height: collapsed ? 36 : undefined,
                          justifyContent: collapsed ? 'center' : 'flex-start',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 500,
                          textDecoration: 'none',
                          transition: 'background 120ms, color 120ms',
                          background: isActive ? 'var(--sidebar-primary)' : 'transparent',
                          color: isActive
                            ? 'var(--sidebar-primary-foreground)'
                            : 'rgba(255,255,255,0.60)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                        })}
                        onMouseEnter={e => {
                          const el = e.currentTarget
                          if (!el.getAttribute('data-active')) {
                            el.style.background = 'var(--sidebar-accent)'
                            el.style.color = 'var(--sidebar-accent-foreground)'
                          }
                        }}
                        onMouseLeave={e => {
                          const el = e.currentTarget
                          if (!el.getAttribute('data-active')) {
                            el.style.background = ''
                            el.style.color = ''
                          }
                        }}
                      >
                        {({ isActive }) => (
                          <>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 16,
                              height: 16,
                              minWidth: 16,
                              flexShrink: 0,
                              color: 'inherit',
                            }}>
                              <Icon size={15} color="currentColor" />
                            </span>
                            {!collapsed && (
                              <span style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: 1,
                                color: 'inherit',
                              }}>
                                {label}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right" style={{ fontSize: 12 }}>{label}</TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div style={{ borderTop: '1px solid var(--sidebar-border)', flexShrink: 0 }}>
            {!collapsed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
                <Avatar style={{ width: 28, height: 28, flexShrink: 0 }}>
                  <AvatarFallback style={{ fontSize: 10, fontWeight: 700, background: 'var(--sidebar-accent)', color: 'var(--sidebar-accent-foreground)' }}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--sidebar-foreground)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                    {user?.email?.split('@')[0]}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--sidebar-foreground)', opacity: 0.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                    {user?.email?.split('@')[1]}
                  </p>
                </div>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: collapsed ? 0 : 8,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    width: '100%',
                    padding: collapsed ? '12px 0' : '10px 14px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.45)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'color 150ms, background 150ms',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = '#f87171'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = ''
                    ;(e.currentTarget as HTMLButtonElement).style.background = ''
                  }}
                >
                  <LogOut size={15} color="currentColor" />
                  {!collapsed && <span>Sair</span>}
                </button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Sair</TooltipContent>}
            </Tooltip>
          </div>
        </aside>

        {/* ── MAIN ────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* Topbar */}
          <header style={{
            height: 56,
            background: 'var(--card)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 8,
            flexShrink: 0,
          }}>
            {/* Toggle desktop */}
            <button
              onClick={() => setCollapsed(v => !v)}
              className="hidden lg:flex"
              style={{
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, border: 'none', background: 'transparent',
                color: 'var(--muted-foreground)', cursor: 'pointer',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed
                ? <ChevronRight size={16} color="currentColor" />
                : <ChevronLeft  size={16} color="currentColor" />}
            </button>

            {/* Toggle mobile */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden"
              style={{
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, border: 'none', background: 'transparent',
                color: 'var(--muted-foreground)', cursor: 'pointer',
              }}
            >
              <Menu size={16} color="currentColor" />
            </button>

            <div style={{ flex: 1 }} />

            <Avatar style={{ width: 32, height: 32 }}>
              <AvatarFallback style={{ fontSize: 11, fontWeight: 700, background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                {initials}
              </AvatarFallback>
            </Avatar>
          </header>

          {/* Conteúdo */}
          <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
