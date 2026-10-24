import { InteractionContext, useInteraction } from './state'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export function InteractionProvider({
  children,
  preferences
}: {
  children: ReactNode
  preferences?: {
    dwell: boolean
    duration: number
    setDwell: (value: boolean) => void
    setDuration: (value: number) => void
  }
}): React.JSX.Element {
  const [dwell, setDwell] = useState(true)
  const [duration, setDuration] = useState(1000)
  const [busy, setBusy] = useState(false)
  return (
    <InteractionContext.Provider
      value={{ dwell, setDwell, duration, setDuration, ...preferences, busy, setBusy }}
    >
      {children}
    </InteractionContext.Provider>
  )
}
interface ActionButtonProps {
  children: ReactNode
  onAction: () => void
  disabled?: boolean
  className?: string
  title?: string
  selected?: boolean
  identity: string
}
export function ActionButton({
  children,
  onAction,
  disabled,
  className = '',
  title,
  selected,
  identity
}: ActionButtonProps): React.JSX.Element {
  const { dwell, duration, setBusy } = useInteraction()
  const [dwelling, setDwelling] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activated = useRef(false)
  const callback = useRef(onAction)
  useEffect(() => {
    callback.current = onAction
  }, [onAction])
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
      setBusy(false)
    }
    setDwelling(false)
  }, [setBusy])
  useEffect(() => {
    const reset = (): void => {
      cancel()
      activated.current = true
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') reset()
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', reset)
    window.addEventListener('resize', reset)
    document.addEventListener('visibilitychange', reset)
    return () => {
      cancel()
      window.removeEventListener('keydown', escape)
      window.removeEventListener('blur', reset)
      window.removeEventListener('resize', reset)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [identity, disabled, dwell, duration, cancel])
  const activate = (): void => {
    cancel()
    if (disabled || (dwell && activated.current)) return
    activated.current = dwell
    callback.current()
  }
  return (
    <button
      type="button"
      className={`action-button ${className} ${dwelling ? 'dwelling' : ''}`}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      // Lets gaze aim assist pull gently toward enabled buttons.
      data-gaze-target={disabled ? undefined : identity}
      style={{ '--dwell-duration': `${duration}ms` } as React.CSSProperties}
      onPointerEnter={() => {
        activated.current = false
        if (!dwell || disabled) return
        setDwelling(true)
        setBusy(true)
        timer.current = setTimeout(activate, duration)
      }}
      onPointerLeave={() => {
        cancel()
        activated.current = false
      }}
      onPointerCancel={cancel}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') activated.current = false
      }}
      onClick={(event) => {
        if (event.detail > 0) activated.current = false
        activate()
      }}
    >
      <span className="action-content">{children}</span>
      <span className="dwell-progress" aria-hidden="true" />
    </button>
  )
}
