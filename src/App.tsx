import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell } from '@/app/AppShell'
import { VersionUpdateNotice } from '@/app/VersionUpdateNotice'
import { ToastProvider } from '@/components/Toast'
import { ActivitiesPage } from '@/features/activities/ActivitiesPage'
import { DeadlineNotifications } from '@/features/activities/DeadlineNotifications'
import { NoteEditorPage } from '@/features/notes/NoteEditorPage'
import { NotesPage } from '@/features/notes/NotesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { ImportPage } from '@/features/sharing/ImportPage'
const CollaborativeNotePage = lazy(() => import('@/features/notes/CollaborativeNotePage').then((module) => ({ default: module.CollaborativeNotePage })))
const ActivityEditorPage = lazy(() => import('@/features/activities/ActivityEditorPage').then((module) => ({ default: module.ActivityEditorPage })))
const CollaborativeActivityInvitePage = lazy(() => import('@/features/activities/CollaborativeActivityInvitePage').then((module) => ({ default: module.CollaborativeActivityInvitePage })))
import { getCollaborativeActivityRoom, getCollaborativeActivityToken } from '@/lib/collaboration/activity-links'
import { useSettings } from '@/hooks/useStores'
import { applyTheme } from '@/lib/storage/settingsStore'
import { getCollaborativeTokenForNote } from '@/lib/collaboration/links'
import { notesStore } from '@/lib/storage/notesStore'
import { activitiesStore } from '@/lib/storage/activitiesStore'

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
  const note = notesStore.getById(id)
  if (note?.collaborationRoom) {
    return <Suspense fallback={<div className="collab-message">Carregando nota compartilhada…</div>}><CollaborativeNotePage room={note.collaborationRoom} /></Suspense>
  }
  const collabToken = id === 'nova' ? undefined : getCollaborativeTokenForNote(id)
  if (collabToken) return <Navigate to={`/colaborar/${collabToken}`} replace />
  return <NoteEditorPage noteId={id} />
}

function ActivityEditorRoute() {
  const { id = 'nova' } = useParams()
  const { search } = useLocation()
  const room = new URLSearchParams(search).get('room') ?? activitiesStore.getById(id)?.collaborationRoom ?? getCollaborativeActivityRoom(id)
  const inviteToken = id === 'nova' || room ? undefined : getCollaborativeActivityToken(id)
  if (inviteToken) return <Navigate to={`/atividade-colaborar/${inviteToken}`} replace />
  return <Suspense fallback={<div className="collab-message">Carregando atividade…</div>}><ActivityEditorPage activityId={id} collaborationRoom={room} /></Suspense>
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
          <Route
            path="colaborar/:token"
            element={
              <Suspense fallback={<div className="collab-message">Carregando editor colaborativo…</div>}>
                <CollaborativeNotePage />
              </Suspense>
            }
          />
          <Route path="atividade/:id" element={<ActivityEditorRoute />} />
          <Route path="atividade-colaborar/:token" element={<Suspense fallback={<div className="collab-message">Carregando atividade compartilhada…</div>}><CollaborativeActivityInvitePage /></Suspense>} />
          <Route path="importar" element={<ImportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </HashRouter>
  )
}
