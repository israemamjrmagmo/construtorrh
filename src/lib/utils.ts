import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '')
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
}

export const STATUS_COLORS = {
  ativo: 'bg-emerald-100 text-emerald-800',
  inativo: 'bg-red-100 text-red-800',
  afastado: 'bg-yellow-100 text-yellow-800',
  ferias: 'bg-blue-100 text-blue-800',
  em_andamento: 'bg-blue-100 text-blue-800',
  concluida: 'bg-emerald-100 text-emerald-800',
  pausada: 'bg-yellow-100 text-yellow-800',
  cancelada: 'bg-red-100 text-red-800',
  pendente: 'bg-yellow-100 text-yellow-800',
  pago: 'bg-emerald-100 text-emerald-800',
  em_investigacao: 'bg-orange-100 text-orange-800',
  concluido: 'bg-emerald-100 text-emerald-800',
  arquivado: 'bg-gray-100 text-gray-600',
  vencido: 'bg-red-100 text-red-800',
  renovar: 'bg-orange-100 text-orange-800',
} as const

export const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo', inativo: 'Inativo', afastado: 'Afastado', ferias: 'Férias',
  em_andamento: 'Em Andamento', concluida: 'Concluída', pausada: 'Pausada', cancelada: 'Cancelada',
  pendente: 'Pendente', pago: 'Pago', em_investigacao: 'Em Investigação',
  concluido: 'Concluído', arquivado: 'Arquivado', vencido: 'Vencido', renovar: 'A Renovar',
  clt: 'CLT', pj: 'PJ', temporario: 'Temporário', aprendiz: 'Aprendiz', estagiario: 'Estagiário',
  tipico: 'Típico', trajeto: 'Trajeto', doenca_ocupacional: 'Doença Ocupacional',
  leve: 'Leve', moderado: 'Moderado', grave: 'Grave', fatal: 'Fatal',
  medico: 'Médico', comparecimento: 'Comparecimento', declaracao: 'Declaração',
  folha: 'Folha', adiantamento: 'Adiantamento', '13_salario': '13º Salário', ferias_p: 'Férias', rescisao: 'Rescisão',
  cartao: 'Cartão', bilhete_unico: 'Bilhete Único', dinheiro: 'Dinheiro',
}
