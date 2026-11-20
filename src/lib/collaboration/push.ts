import { supabase, ensureAnonymousSession } from './supabase'

function decodeVapidPublicKey(key: string): Uint8Array {
  const normalized = key.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function enableDeadlinePush(captchaToken?: string): Promise<void> {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidPublicKey) throw new Error('A chave pública de notificações push ainda não foi configurada.')
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Este navegador não oferece notificações push em segundo plano.')
  }

  await ensureAnonymousSession(captchaToken)
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!session) throw new Error('Não foi possível criar a sessão deste dispositivo.')

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  const createdHere = !subscription
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidPublicKey(vapidPublicKey),
  })

  const details = subscription.toJSON()
  if (!details.endpoint || !details.keys?.p256dh || !details.keys.auth) {
    if (createdHere) await subscription.unsubscribe()
    throw new Error('O navegador não retornou os dados necessários para o push.')
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: session.user.id,
    endpoint: details.endpoint,
    p256dh: details.keys.p256dh,
    auth: details.keys.auth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  if (error) {
    if (createdHere) await subscription.unsubscribe()
    throw error
  }
}

export async function disableDeadlinePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  const { error } = await supabase.from('push_subscriptions')
    .delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
  if (error) throw error
}
