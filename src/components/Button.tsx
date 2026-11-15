import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './Icon'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        !children && 'btn--icon-only',
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  active?: boolean
  tone?: 'default' | 'danger'
  filled?: boolean
  size?: number
}

export function IconButton({
  icon,
  label,
  active = false,
  tone = 'default',
  filled = false,
  size = 19,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn('icon-btn', active && 'is-active', tone === 'danger' && 'is-danger', className)}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      {...rest}
    >
      <Icon name={icon} size={size} filled={filled} />
    </button>
  )
}
