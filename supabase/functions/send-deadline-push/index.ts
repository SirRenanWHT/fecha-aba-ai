import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from '@negrel/webpush'
import { createClient } from '@supabase/supabase-js'

type SharedActivity = {
  id?: string
  title?: string
  dueDate?: string
  status?: string
}

type SubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  timezone: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function dateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const cronSecret = Deno.env.get('DEADLINE_PUSH_CRON_SECRET')
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

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
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const vapidKeys = await importVapidKeys(JSON.parse(privateKeyJson), { extractable: false })
    const appServer = await ApplicationServer.new({
      contactInformation: Deno.env.get('VAPID_SUBJECT') || 'https://sirrenanwht.github.io/fecha-aba-ai/',
      vapidKeys,
    })

    const { data: sharedActivities, error: activityError } = await supabase
      .from('collab_activities').select('document_id, activity')
    if (activityError) throw activityError

    const dueActivities = (sharedActivities ?? []).flatMap((row) => {
      const activity = row.activity as SharedActivity
      if (!activity.id || !activity.dueDate || activity.status === 'done') return []
      return [{ room: row.document_id as string, activity }]
    })
    if (dueActivities.length === 0) return json({ sent: 0, removed: 0 })

    const rooms = [...new Set(dueActivities.map(({ room }) => room))]
    const { data: members, error: membersError } = await supabase
      .from('collab_members').select('document_id, user_id').in('document_id', rooms)
    if (membersError) throw membersError
    const userIds = [...new Set((members ?? []).map((member) => member.user_id as string))]
    if (userIds.length === 0) return json({ sent: 0, removed: 0 })

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, timezone')
      .eq('enabled', true).in('user_id', userIds)
    if (subscriptionsError) throw subscriptionsError

    let sent = 0
    let removed = 0
    for (const { room, activity } of dueActivities) {
      const roomMembers = new Set((members ?? [])
        .filter((member) => member.document_id === room)
        .map((member) => member.user_id as string))

      for (const subscription of (subscriptions ?? []) as SubscriptionRow[]) {
        if (!roomMembers.has(subscription.user_id)) continue
        let today: string
        try {
          today = dateInTimezone(subscription.timezone)
        } catch {
          today = dateInTimezone('UTC')
        }
        const stage = activity.dueDate === today ? 'today'
          : activity.dueDate === addDays(today, 1) ? 'tomorrow' : null
        if (!stage) continue

        const { data: claim, error: claimError } = await supabase
          .from('shared_activity_push_deliveries')
          .insert({
            subscription_id: subscription.id,
            activity_id: activity.id,
            due_date: activity.dueDate,
            stage,
          })
          .select('id').maybeSingle()
        if (claimError?.code === '23505') continue
        if (claimError) throw claimError
        if (!claim) continue

        const title = activity.title?.trim() || 'Atividade sem título'
        const body = stage === 'today' ? 'Vence hoje.' : 'Vence amanhã.'
        try {
          const subscriber = appServer.subscribe({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          })
          await subscriber.pushTextMessage(JSON.stringify({
            title,
            body: `${body} Abra o Caderno para conferir.`,
            tag: `deadline-${activity.id}-${activity.dueDate}-${stage}`,
            url: '#/atividades',
          }), { ttl: 60 * 60 * 24, urgency: Urgency.High })
          sent += 1
        } catch (error) {
          await supabase.from('shared_activity_push_deliveries').delete().eq('id', claim.id)
          if (error instanceof PushMessageError && error.isGone()) {
            await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
            removed += 1
            continue
          }
          console.error('Push delivery failed', error)
        }
      }
    }

    return json({ sent, removed })
  } catch (error) {
    console.error('Deadline push dispatch failed', error)
    return json({ error: 'Could not dispatch deadline notifications' }, 500)
  }
})
