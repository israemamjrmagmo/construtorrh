import { createClient } from '@supabase/supabase-js'
// V1 — SOMENTE LEITURA
const url = 'https://rbhmfqngnjxdemavtvxk.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaG1mcW5nbmp4ZGVtYXZ0dnhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQ5MDYyNzYsImV4cCI6MjAyMDQ4MjI3Nn0.DtRKnZ8-hFlZFauMa0cVQdY3YTNC-sGLSBYkCqRrPnI'
export const supabaseV1 = createClient(url, key)
