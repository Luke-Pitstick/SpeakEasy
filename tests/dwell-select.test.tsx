// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InteractionProvider } from '../src/renderer/src/interaction/controls'
import { DwellSelect } from '../src/renderer/src/interaction/DwellSelect'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('PointerEvent', MouseEvent)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Look at a control long enough for the default 1 s dwell, then look away. */
function dwell(name: string): void {
  const button = screen.getByRole('button', { name })
  fireEvent.pointerEnter(button)
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  fireEvent.pointerLeave(button)
}

it('opens and chooses by dwell alone', () => {
  const onChange = vi.fn()
  render(
    <InteractionProvider>
      <DwellSelect
        label="Steering speed"
        identity="speed"
        value={0.6}
        options={[
          { value: 0.4, label: 'Slow' },
          { value: 0.6, label: 'Standard' },
          { value: 1, label: 'Fast' }
        ]}
        onChange={onChange}
      />
    </InteractionProvider>
  )
  expect(screen.queryByRole('button', { name: 'Fast' })).toBeNull()
  dwell('Standard')
  dwell('Fast')
  expect(onChange).toHaveBeenCalledWith(1)
  // Choosing closes the options again.
  expect(screen.queryByRole('button', { name: 'Slow' })).toBeNull()
})
