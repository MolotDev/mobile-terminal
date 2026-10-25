import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
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
  : createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
