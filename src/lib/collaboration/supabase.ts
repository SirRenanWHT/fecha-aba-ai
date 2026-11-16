import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rcmssdqsbbxpjgumblfb.supabase.co'
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_T4kY4VYtmlnl5dEdSIiIaw_jvGl1dym'

export const supabase = createClient(projectUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export async function ensureAnonymousSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (data.session) return

  const { error: signInError } = await supabase.auth.signInAnonymously()
  if (signInError) throw signInError
}
