import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { HardHat, Mail, Lock, LogIn } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function Login() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setSubmitting(true)
    try {
      await signIn(data.email, data.password)
      navigate('/')
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Erro ao realizar login'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Painel esquerdo — hero */}
      <div
        className="hidden md:flex md:w-3/5 bg-primary flex-col items-center justify-center px-12 py-16 relative overflow-hidden"
      >
        {/* Círculos decorativos */}
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-16 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full bg-accent/10" />

        <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center shadow-lg">
              <HardHat className="w-8 h-8 text-white" strokeWidth={1.8} />
            </div>
            <span className="text-4xl font-bold text-white tracking-tight">
              Construtor<span className="text-accent">RH</span>
            </span>
          </div>

          <p className="text-white/80 text-lg leading-relaxed">
            Sistema de Gestão de RH para Construção Civil
          </p>

          <div className="w-16 h-px bg-white/20 my-2" />

          <ul className="flex flex-col gap-3 text-white/70 text-sm text-left w-full">
            {[
              'Controle completo de colaboradores e obras',
              'Registro de ponto, EPIs e acidentes',
              'Folha de pagamento e provisões trabalhistas',
              'Relatórios gerenciais em tempo real',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background">
        {/* Logo mobile */}
        <div className="flex md:hidden items-center gap-2 mb-10">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <HardHat className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-foreground">
            Construtor<span className="text-accent">RH</span>
          </span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">Bem-vindo de volta</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Acesse sua conta para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
            {/* E-mail */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                E-mail
              </Label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com.br"
                  autoComplete="email"
                  className="pl-9"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-sm font-medium">
                Senha
              </Label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pl-9"
                  {...register('password')}
                />
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full mt-2 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              disabled={submitting}
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-8">
            © {new Date().getFullYear()} ConstrutorRH · Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  )
}
