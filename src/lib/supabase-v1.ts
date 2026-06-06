import { createClient } from '@supabase/supabase-js'
// V1 — SOMENTE LEITURA
const url = 'https://rbhmfqngnjxdemavtvxk.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaG1mcW5nbmp4ZGVtYXZ0dnhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDI1NzAsImV4cCI6MjA4OTY3ODU3MH0.5F59rd7xU5ynH0gmAJmGq95ZLM6NvFpD7nDF2zwDMvE'
export const supabaseV1 = createClient(url, key)
