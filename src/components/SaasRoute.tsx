import React from 'react'
import { Navigate } from 'react-router-dom'
import { isSaasAuthenticated } from '@/utils/saasAuth'

export default function SaasRoute({ children }: { children: React.ReactNode }) {
  if (!isSaasAuthenticated()) {
    return <Navigate to="/saas-login" replace />
  }
  return <>{children}</>
}
