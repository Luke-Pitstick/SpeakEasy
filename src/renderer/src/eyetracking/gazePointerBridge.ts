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
 * cancels pending dwell, as tracking loss must. Looking or pointing past the top or bottom edge
 * presses the full-width cue there (the top row, if the top cue isn't showing); past the sides it
 * leaves like a mouse leaving the window (no element entered), which doesn't pause steering.
 */

// Distinct from the real mouse (pointerId 1) so handlers can tell them apart if they need to.
const POINTER_ID = 31
const HOVER_EVENTS = ['pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointermove']
// The edge cues are the main hands-free controls: the top cue ([data-gaze-top-cue]) switches
// between writing and phrases, the bottom cue ([data-gaze-bottom-cue]) opens the menu. Their hit
// zones are forgiving: each starts this far inside the screen past the cue, and once on it you
// stay on it until this far, so jitter at the boundary can't reset its dwell. At or past its
// screen edge a cue is always pressed. The entry margin is kept modest because other controls
// (the header's buttons, the phrase footer) sit right next to the cues.
const CUE_ENTER_MARGIN = 24
const CUE_EXIT_MARGIN = 64

type Edge = 'top' | 'bottom'

/** The enabled button in an edge cue and its region's bounds, if the cue is showing. */
function edgeCue(edge: Edge): { button: Element; top: number; bottom: number } | null {
  const region = document.querySelector(`[data-gaze-${edge}-cue]`)
  const button = region?.querySelector('button:not(:disabled)')
  if (!region || !button) return null
  const { top, bottom } = region.getBoundingClientRect()
  return { button, top, bottom }
}

function ancestors(el: Element | null): Element[] {
  const chain: Element[] = []
  for (let e = el; e; e = e.parentElement) chain.push(e)
  return chain
}

export class GazePointerBridge {
  private current: Element | null = null
  private onCue: Edge | null = null
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
    const top = edgeCue('top')
    const bottom = edgeCue('bottom')
    const limit = window.innerHeight - 1
    // Decided from the unassisted gaze, so aim assist toward nearby buttons can't pull the
    // pointer out of a cue's zone.
    const reach = (edge: Edge): number => (this.onCue === edge ? CUE_EXIT_MARGIN : CUE_ENTER_MARGIN)
    if (top && (gaze.rawY <= 0 || gaze.y <= 0 || gaze.rawY < top.bottom + reach('top')))
      this.onCue = 'top'
    else if (
      bottom &&
      (gaze.rawY >= limit || gaze.y >= limit || gaze.rawY > bottom.top - reach('bottom'))
    )
      this.onCue = 'bottom'
    else this.onCue = null
    const cue = this.onCue === 'top' ? top : this.onCue === 'bottom' ? bottom : null
    let x = gaze.x
    let y = gaze.y
    let target: Element | null
    if (cue) {
      x = Math.max(0, Math.min(window.innerWidth - 1, gaze.x))
      y = Math.max(cue.top, Math.min(cue.bottom - 1, gaze.y))
      target = cue.button
    } else if (gaze.y <= 0) {
      // At or past the top edge the pointer is on the top row, whatever spans it.
      x = Math.max(0, Math.min(window.innerWidth - 1, gaze.x))
      y = 0
      target = document.elementFromPoint(x, y)
    } else {
      // Past the other edges the pointer has left the window, which presses nothing.
      target = gaze.offscreen ? null : document.elementFromPoint(x, y)
    }
    this.last = { x, y }
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
