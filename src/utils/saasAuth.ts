const SAAS_TOKEN_KEY = 'saas_admin_token'

export function isSaasAuthenticated(): boolean {
  const token = localStorage.getItem(SAAS_TOKEN_KEY)
  if (!token) return false
  try {
    // Token válido por 8 horas
    const ts = parseInt(atob(token))
    return Date.now() - ts < 8 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export function saasLogout() {
  localStorage.removeItem(SAAS_TOKEN_KEY)
}
