import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function projectUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
}

const supabaseUrl = projectUrl(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

const PLACEHOLDER_URL = 'your_project_url'
const PLACEHOLDER_KEY = 'your_anon_key'

export const isDemoMode =
  supabaseUrl === '' ||
  supabaseAnonKey === '' ||
  supabaseUrl === PLACEHOLDER_URL ||
  supabaseAnonKey === PLACEHOLDER_KEY

export const supabase: SupabaseClient | null = isDemoMode
  ? null
  : createClient(supabaseUrl, supabaseAnonKey)
