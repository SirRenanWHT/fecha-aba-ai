import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type EmptyStateProps = {
  icon: IconName
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <h2 className="empty-title">{title}</h2>
      <p className="empty-description">{description}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}
