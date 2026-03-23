/**
 * Traduz erros técnicos do PostgreSQL/Supabase para mensagens amigáveis em português.
 */
export function traduzirErro(msg: string): string {
  if (!msg) return 'Ocorreu um erro. Tente novamente.'

  // Chave estrangeira
  if (msg.includes('foreign key') || msg.includes('violates foreign key') || msg.includes('_fkey'))
    return 'Não é possível realizar esta operação: existem registros vinculados.'

  // Unicidade
  if (msg.includes('unique') || msg.includes('duplicate key') || msg.includes('already exists'))
    return 'Já existe um registro com estes dados.'

  // Campo obrigatório
  if (msg.includes('not-null') || msg.includes('null value') || msg.includes('violates not-null'))
    return 'Preencha todos os campos obrigatórios.'

  // Permissão / RLS
  if (msg.includes('permission denied') || msg.includes('row-level security') || msg.includes('policy'))
    return 'Você não tem permissão para realizar esta ação.'

  // Coluna inexistente
  if (msg.includes('column') && msg.includes('does not exist'))
    return 'Erro de configuração do sistema. Contate o suporte.'

  // JWT / sessão
  if (msg.includes('JWT') || msg.includes('expired') || msg.includes('invalid token'))
    return 'Sessão expirada. Faça login novamente.'

  return 'Ocorreu um erro. Tente novamente.'
}
