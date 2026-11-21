import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from '@negrel/webpush'
import { createClient } from '@supabase/supabase-js'

type Subscription = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Unauthorized' }, 401)

  let input: { room?: unknown; type?: unknown }
  try {
    input = await request.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  if (typeof input.room !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.room)
    || (input.type !== 'note' && input.type !== 'activity')) {
    return json({ error: 'Invalid request' }, 400)
  }
  const room = input.room
  const type = input.type

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? (() => {
      const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
      return keys ? JSON.parse(keys).default as string | undefined : undefined
    })()
  const privateKeyJson = Deno.env.get('VAPID_PRIVATE_KEY_JSON')
  if (!supabaseUrl || !serviceKey || !privateKeyJson) {
    return json({ error: 'Push service is not configured' }, 500)
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401)
    const userId = authData.user.id

    const { data: members, error: membersError } = await admin
      .from('collab_members').select('user_id').eq('document_id', room)
    if (membersError) throw membersError
    const memberIds = [...new Set((members ?? []).map((row) => row.user_id as string))]
    if (!memberIds.includes(userId)) return json({ error: 'Not a member of this room' }, 403)

    const recipients = memberIds.filter((id) => id !== userId)
    if (recipients.length === 0) return json({ sent: 0, removed: 0 })
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth')
      .eq('enabled', true).in('user_id', recipients)
    if (subscriptionsError) throw subscriptionsError
    if (!subscriptions?.length) return json({ sent: 0, removed: 0 })

    const vapidKeys = await importVapidKeys(JSON.parse(privateKeyJson), { extractable: false })
    const appServer = await ApplicationServer.new({
      contactInformation: Deno.env.get('VAPID_SUBJECT') || 'https://sirrenanwht.github.io/fecha-aba-ai/',
      vapidKeys,
    })
    const windowStart = new Date(Math.floor(Date.now() / 300_000) * 300_000).toISOString()
    let sent = 0
    let removed = 0
    for (const subscription of subscriptions as Subscription[]) {
      const { data: claim, error: claimError } = await admin
        .from('shared_update_push_deliveries')
        .insert({ subscription_id: subscription.id, document_id: room, window_start: windowStart })
        .select('id').maybeSingle()
      if (claimError?.code === '23505') continue
      if (claimError) throw claimError
      if (!claim) continue

      try {
        const subscriber = appServer.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        })
        const label = type === 'note' ? 'nota' : 'atividade'
        await subscriber.pushTextMessage(JSON.stringify({
          title: 'Caderno atualizado',
          body: `Uma ${label} compartilhada foi atualizada. Abra o Caderno para ver as mudanças.`,
          tag: `shared-update-${room}`,
          url: type === 'note' ? '#/' : '#/atividades',
        }), { ttl: 60 * 60 * 24, urgency: Urgency.Normal })
        sent += 1
      } catch (error) {
        await admin.from('shared_update_push_deliveries').delete().eq('id', claim.id)
        if (error instanceof PushMessageError && error.isGone()) {
          await admin.from('push_subscriptions').delete().eq('id', subscription.id)
          removed += 1
          continue
        }
        console.error('Shared update push delivery failed', error)
      }
    }

    return json({ sent, removed })
  } catch (error) {
    console.error('Shared update push dispatch failed', error)
    return json({ error: 'Could not dispatch shared update notifications' }, 500)
  }
})
