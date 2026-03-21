import React, { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  LayoutDashboard, Users, Building2, Briefcase, Shield,
  AlertTriangle, FileText, Clock, DollarSign, Award,
  Calculator, Bus, BarChart3, Settings, LogOut, Menu, X,
  HardHat, ChevronRight, FileWarning
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/colaboradores', label: 'Colaboradores', icon: Users },
  { to: '/obras', label: 'Obras', icon: Building2 },
  { to: '/funcoes', label: 'Funções', icon: Briefcase },
  { to: '/epis', label: 'EPIs', icon: Shield },
  { to: '/acidentes', label: 'Acidentes', icon: AlertTriangle },
  { to: '/atestados', label: 'Atestados', icon: FileWarning },
  { to: '/documentos', label: 'Documentos', icon: FileText },
  { to: '/ponto', label: 'Ponto', icon: Clock },
  { to: '/pagamentos', label: 'Pagamentos', icon: DollarSign },
  { to: '/premios', label: 'Prêmios', icon: Award },
  { to: '/vt', label: 'Vale Transporte', icon: Bus },
  { to: '/provisoes', label: 'Provisões', icon: Calculator },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

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

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'RH'

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed lg:relative inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-200 ease-in-out',
            collapsed ? 'w-16' : 'w-64',
            mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          )}
        >
          {/* Logo */}
          <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-sidebar-border', collapsed && 'justify-center px-0')}>
            <div className="w-9 h-9 bg-sidebar-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <HardHat className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            {!collapsed && (
              <div>
                <p className="text-sm font-bold text-sidebar-foreground">ConstrutorRH</p>
                <p className="text-xs text-sidebar-foreground/50">Gestão de RH</p>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Tooltip key={to}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 group',
                        collapsed && 'justify-center px-0 py-3',
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )
                    }
                  >
                    <Icon className={cn('flex-shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
                    {!collapsed && <span>{label}</span>}
                  </NavLink>
                </TooltipTrigger>
                {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
              </Tooltip>
            ))}
          </nav>

          {/* Footer */}
          <div className={cn('border-t border-sidebar-border p-3', collapsed && 'px-1')}>
            {!collapsed && (
              <div className="flex items-center gap-2 px-2 py-1 mb-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-accent-foreground">{initials}</AvatarFallback>
                </Avatar>
                <p className="text-xs text-sidebar-foreground/60 truncate flex-1">{user?.email}</p>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className={cn(
                    'w-full text-sidebar-foreground/60 hover:text-red-400 hover:bg-red-900/20',
                    collapsed ? 'px-0 justify-center' : 'justify-start gap-2'
                  )}
                >
                  <LogOut className="w-4 h-4" />
                  {!collapsed && 'Sair'}
                </Button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Sair</TooltipContent>}
            </Tooltip>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-14 bg-card border-b border-border flex items-center gap-3 px-4 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </Button>
            <div className="flex-1" />
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
