/** What drives the pointer: the mouse, the webcam eye tracker, or (opt-in) head pointing. */
export type InputSource = 'mouse' | 'eyes' | 'head'

const INPUT_KEY = 'speakeasy.input'

export function loadInputSource(): InputSource {
  try {
    const value = localStorage.getItem(INPUT_KEY)
    return value === 'eyes' || value === 'head' ? value : 'mouse'
  } catch {
    return 'mouse'
  }
}

export function saveInputSource(input: InputSource): void {
  try {
    localStorage.setItem(INPUT_KEY, input)
  } catch {
    // Remembering the choice is a convenience; the selection still applies this session.
  }
}
