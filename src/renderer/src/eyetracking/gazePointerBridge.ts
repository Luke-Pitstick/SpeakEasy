import type { GazeTracker } from './GazeTracker'
import type { GazePoint } from './types'

/**
 * Drives the app's ordinary pointer handling with gaze: each gaze sample is delivered as the
 * pointer events a mouse would produce there (over/out and enter/leave as the element under the
 * gaze changes, and a move every frame). Components that already dwell on pointer enter/leave
 * and steer from pointer moves (ActionButton, DasherPanel) then work with the eyes unchanged.
 *
 * While active, hover events from the real mouse are blocked so the two don't fight over dwell;
 * mouse clicks still work. Losing the face cancels the pointer (pointercancel + leave), which
 * cancels pending dwell, as tracking loss must.
 */

// Distinct from the real mouse (pointerId 1) so handlers can tell them apart if they need to.
const POINTER_ID = 31
const HOVER_EVENTS = ['pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointermove']

function ancestors(el: Element | null): Element[] {
  const chain: Element[] = []
  for (let e = el; e; e = e.parentElement) chain.push(e)
  return chain
}

export class GazePointerBridge {
  private current: Element | null = null
  private last: { x: number; y: number } | null = null
  private offGaze: (() => void) | null = null
  private offState: (() => void) | null = null

  constructor(private readonly tracker: GazeTracker) {}

  start(): void {
    if (this.offGaze) return
    this.offGaze = this.tracker.onGaze((g) => this.handle(g))
    this.offState = this.tracker.subscribe(() => {
      if (!this.tracker.getState().faceDetected) this.cancel()
    })
    for (const type of HOVER_EVENTS) window.addEventListener(type, blockRealMouse, true)
  }

  stop(): void {
    this.offGaze?.()
    this.offState?.()
    this.offGaze = this.offState = null
    for (const type of HOVER_EVENTS) window.removeEventListener(type, blockRealMouse, true)
    this.cancel()
  }

  private handle(gaze: GazePoint): void {
    // A blink keeps the pointer where it was rather than leaving the target.
    if (gaze.blinking) return
    const { x, y } = gaze
    this.last = { x, y }
    const inside = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight
    const target = inside ? document.elementFromPoint(x, y) : null
    if (target !== this.current) this.moveTo(target, x, y)
    if (target) target.dispatchEvent(pointerEvent('pointermove', x, y, true))
  }

  /** Leaves everything (tracking lost or bridge stopped), cancelling pending dwell. */
  private cancel(): void {
    if (!this.current) return
    const { x, y } = this.last ?? { x: 0, y: 0 }
    this.current.dispatchEvent(pointerEvent('pointercancel', x, y, true))
    this.moveTo(null, x, y)
  }

  private moveTo(next: Element | null, x: number, y: number): void {
    const prev = this.current
    this.current = next
    const left = ancestors(prev)
    const entered = ancestors(next)
    if (prev) prev.dispatchEvent(pointerEvent('pointerout', x, y, true, next))
    // pointerleave goes to each element left, innermost first; pointerenter to each element
    // entered, outermost first. Neither bubbles.
    for (const el of left) {
      if (!entered.includes(el)) el.dispatchEvent(pointerEvent('pointerleave', x, y, false, next))
    }
    if (next) next.dispatchEvent(pointerEvent('pointerover', x, y, true, prev))
    for (const el of [...entered].reverse()) {
      if (!left.includes(el)) el.dispatchEvent(pointerEvent('pointerenter', x, y, false, prev))
    }
  }
}

function pointerEvent(
  type: string,
  x: number,
  y: number,
  bubbles: boolean,
  relatedTarget: Element | null = null
): PointerEvent {
  return new PointerEvent(type, {
    bubbles,
    cancelable: type !== 'pointerenter' && type !== 'pointerleave',
    composed: true,
    clientX: x,
    clientY: y,
    pointerId: POINTER_ID,
    pointerType: 'pen',
    isPrimary: true,
    relatedTarget
  })
}

/** Stops real mouse hover events (not clicks) from reaching the app while gaze drives it. */
function blockRealMouse(event: Event): void {
  if (event.isTrusted && (event as PointerEvent).pointerType === 'mouse') {
    event.stopImmediatePropagation()
  }
}
