import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Icon, type IconName } from '@/components/Icon'
import { APP_NAME } from '@/config'
import { useNotes, useSettings } from '@/hooks/useStores'
import { settingsStore, type ThemePreference } from '@/lib/storage/settingsStore'
import { storageUsageBytes } from '@/lib/storage/storage'
import { cn } from '@/lib/utils/cn'
import { formatBytes } from '@/lib/utils/date'

type NavItem = {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Notas', icon: 'note', end: true },
  { to: '/atividades', label: 'Atividades', icon: 'activity' },
  { to: '/ajustes', label: 'Ajustes', icon: 'settings' },
]

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: IconName }> = [
  { value: 'light', label: 'Tema claro', icon: 'sun' },
  { value: 'dark', label: 'Tema escuro', icon: 'moon' },
  { value: 'system', label: 'Seguir o sistema', icon: 'monitor' },
]

export function AppShell() {
  const notes = useNotes()
  const settings = useSettings()
  const navigate = useNavigate()
  const usage = storageUsageBytes()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label={`${APP_NAME} — início`}>
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span className="brand-text">
            <span className="brand-name">{APP_NAME}</span>
            <span className="brand-sub">notas &amp; atividades</span>
          </span>
        </Link>

        <Button
          variant="primary"
          icon="plus"
          className="sidebar-new"
          onClick={() => navigate('/nota/nova')}
        >
          Nova nota
        </Button>

        <nav className="side-nav" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('side-link', isActive && 'is-active')}
            >
              <Icon name={item.icon} size={18} />
              <span className="side-label">{item.label}</span>
              {item.to === '/' && notes.length > 0 ? (
                <span className="side-badge">{notes.length}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="theme-switch" role="group" aria-label="Tema da interface">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn('theme-option', settings.theme === option.value && 'is-active')}
                title={option.label}
                aria-label={option.label}
                aria-pressed={settings.theme === option.value}
                onClick={() => settingsStore.setTheme(option.value)}
              >
                <Icon name={option.icon} size={16} />
              </button>
            ))}
          </div>
          <p className="storage-line">
            <Icon name="layers" size={13} />
            {formatBytes(usage)} em {notes.length} {notes.length === 1 ? 'nota' : 'notas'}
          </p>
          <p className="storage-line subtle">Só neste navegador</p>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Navegação principal">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn('bottom-link', isActive && 'is-active')}
          >
            <Icon name={item.icon} size={21} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
