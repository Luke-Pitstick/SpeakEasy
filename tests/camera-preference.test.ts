// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { preferredCamera } from '../src/renderer/src/eyetracking/WebcamFaceSource'

it('prefers the built-in camera over a Continuity Camera iPhone', () => {
  expect(
    preferredCamera([
      { id: 'phone', label: 'iPhone (5) Camera' },
      { id: 'mac', label: 'FaceTime HD Camera (467C:1317)' }
    ])
  ).toBe('mac')
})

it('avoids phones and Desk View when there is no built-in camera', () => {
  expect(
    preferredCamera([
      { id: 'phone', label: 'iPhone Camera' },
      { id: 'desk', label: 'iPhone Desk View Camera' },
      { id: 'usb', label: 'Logitech C920' }
    ])
  ).toBe('usb')
})

it('leaves the choice to the system before camera labels are available', () => {
  expect(preferredCamera([{ id: '', label: '' }])).toBeNull()
})
