import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

type ToastAction = {
  label: string
  onClick: () => void
}

type ToastItem = {
  id: number
  message: string
  action?: ToastAction
}

type Notify = (message: string, action?: ToastAction) => void

const ToastContext = createContext<Notify>(() => undefined)

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const notify = useCallback<Notify>(
    (message, action) => {
      const id = (nextId += 1)
      setItems((current) => [...current.slice(-2), { id, message, action }])
      const timer = window.setTimeout(() => dismiss(id), action ? 6500 : 3500)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const timer of map.values()) window.clearTimeout(timer)
    }
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="toast">
            <span className="toast-message">{item.message}</span>
            {item.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  item.action?.onClick()
                  dismiss(item.id)
                }}
              >
                {item.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="toast-close"
              aria-label="Fechar aviso"
              onClick={() => dismiss(item.id)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): Notify {
  return useContext(ToastContext)
}
