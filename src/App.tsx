import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell } from '@/app/AppShell'
import { VersionUpdateNotice } from '@/app/VersionUpdateNotice'
import { ToastProvider } from '@/components/Toast'
import { ActivitiesPage } from '@/features/activities/ActivitiesPage'
import { DeadlineNotifications } from '@/features/activities/DeadlineNotifications'
import { ActivityEditorPage } from '@/features/activities/ActivityEditorPage'
import { NoteEditorPage } from '@/features/notes/NoteEditorPage'
import { NotesPage } from '@/features/notes/NotesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { ImportPage } from '@/features/sharing/ImportPage'
import { useSettings } from '@/hooks/useStores'
import { applyTheme } from '@/lib/storage/settingsStore'

function ThemeWatcher() {
  const { theme } = useSettings()

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => applyTheme('system')
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [theme])

  return null
}

function EditorRoute() {
  const { id = 'nova' } = useParams()
  return <NoteEditorPage noteId={id} />
}

function ActivityEditorRoute() {
  const { id = 'nova' } = useParams()
  return <ActivityEditorPage activityId={id} />
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <ThemeWatcher />
        <DeadlineNotifications />
        <VersionUpdateNotice />
        <ScrollToTop />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<NotesPage />} />
            <Route path="atividades" element={<ActivitiesPage />} />
            <Route path="ajustes" element={<SettingsPage />} />
          </Route>
          <Route path="nota/:id" element={<EditorRoute />} />
          <Route path="atividade/:id" element={<ActivityEditorRoute />} />
          <Route path="importar" element={<ImportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </HashRouter>
  )
}
