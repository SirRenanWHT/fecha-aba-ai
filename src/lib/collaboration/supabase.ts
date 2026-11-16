import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rcmssdqsbbxpjgumblfb.supabase.co'
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_T4kY4VYtmlnl5dEdSIiIaw_jvGl1dym'

export const HCAPTCHA_SITE_KEY =
  import.meta.env.VITE_HCAPTCHA_SITE_KEY || 'a5b64c20-4150-4c2a-9990-9f14c9e686d6'

export const supabase = createClient(projectUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export async function hasSupabaseSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return Boolean(data.session)
}

export async function ensureAnonymousSession(captchaToken?: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (data.session) return

  const { error: signInError } = await supabase.auth.signInAnonymously({
    options: captchaToken ? { captchaToken } : undefined,
  })
  if (signInError) throw signInError
}
