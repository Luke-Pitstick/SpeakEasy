import { useId, useState } from 'react'
import { ActionButton } from './controls'

export interface DwellOption<T> {
  value: T
  label: string
}

interface DwellSelectProps<T> {
  label: string
  /** Stable prefix for the buttons' dwell identities. */
  identity: string
  value: T
  options: DwellOption<T>[]
  onChange: (value: T) => void
}

/**
 * A dropdown operable by dwell alone. A native <select> opens an OS menu that gaze can't reach;
 * here the current value is an ActionButton that opens a grid of large ActionButton options,
 * so opening and choosing both use the same dwell (or click) as every other control.
 */
export function DwellSelect<T extends string | number>({
  label,
  identity,
  value,
  options,
  onChange
}: DwellSelectProps<T>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const labelId = useId()
  const current = options.find((o) => o.value === value)?.label ?? String(value)
  return (
    <div className={`dwell-select${open ? ' dwell-select--open' : ''}`}>
      <span id={labelId} className="dwell-select__label">
        {label}
      </span>
      <ActionButton
        className="dwell-select__toggle"
        identity={`${identity}-${open}-${value}`}
        selected={open}
        onAction={() => setOpen((o) => !o)}
      >
        {open ? 'Close' : current}
      </ActionButton>
      {open && (
        <div className="dwell-select__options" role="group" aria-labelledby={labelId}>
          {options.map((option) => (
            <ActionButton
              key={String(option.value)}
              identity={`${identity}-option-${option.value}`}
              selected={option.value === value}
              onAction={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </ActionButton>
          ))}
        </div>
      )}
    </div>
  )
}
