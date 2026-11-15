import { useEffect } from 'react'
import { useActivities, useSettings } from '@/hooks/useStores'
import { daysUntilDate } from '@/lib/model/activity'
import { STORAGE_KEYS } from '@/lib/storage/storage'

type SentReminders = Record<string, true>

function readSentReminders(): SentReminders {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.deadlineReminders) ?? '{}') as SentReminders
  } catch {
    return {}
  }
}

export function DeadlineNotifications() {
  const activities = useActivities()
  const { deadlineNotifications } = useSettings()

  useEffect(() => {
    if (!deadlineNotifications || !('Notification' in window)) return

    let running = false
    const checkDeadlines = async () => {
      if (running || Notification.permission !== 'granted') return
      running = true
      try {
        const sent = readSentReminders()
        let changed = false

        for (const activity of activities) {
          if (!activity.dueDate || activity.status === 'done') continue
          const days = daysUntilDate(activity.dueDate)
          if (days !== 1 && days !== 0) continue

          const stage = days === 1 ? 'tomorrow' : 'today'
          const key = `${activity.id}:${activity.dueDate}:${stage}`
          if (sent[key]) continue

          const title = activity.title.trim() || 'Atividade sem título'
          const body = days === 1 ? 'Vence amanhã.' : 'Vence hoje.'
          const notificationOptions: NotificationOptions = {
            body: `${body} Abra o Caderno para conferir.`,
            tag: `deadline-${key}`,
            icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
            data: { activityId: activity.id },
          }

          if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration()
            if (registration?.showNotification) {
              await registration.showNotification(title, notificationOptions)
            } else {
              new Notification(title, notificationOptions)
            }
          } else {
            new Notification(title, notificationOptions)
          }

          sent[key] = true
          changed = true
        }

        if (changed) localStorage.setItem(STORAGE_KEYS.deadlineReminders, JSON.stringify(sent))
      } catch (error) {
        console.error('Não foi possível enviar o lembrete de prazo', error)
      } finally {
        running = false
      }
    }

    void checkDeadlines()
    const interval = window.setInterval(() => void checkDeadlines(), 30 * 60 * 1000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkDeadlines()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [activities, deadlineNotifications])

  return null
}
