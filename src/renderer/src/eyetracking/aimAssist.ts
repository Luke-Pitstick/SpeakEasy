/** An eye-clickable element's id and bounds, in window CSS pixels. */
export interface GazeTargetRect {
  id: string
  left: number
  top: number
  right: number
  bottom: number
  element?: HTMLElement
}

export interface AimAssistOptions {
  enabled: boolean
  /** 0..1: how far the gaze point is pulled toward the locked target's centre. */
  strength: number
  /** px: how far outside a target the gaze can be and still lock onto it. */
  radius: number
}

export interface AssistResult {
  x: number
  y: number
  /** Id of the target being looked at (or locked onto), if any. */
  target: string | null
}

// Deliberately soft: a gentle pull toward buttons near the gaze, not a snap onto them.
export const DEFAULT_AIM_ASSIST: AimAssistOptions = { enabled: true, strength: 0.25, radius: 40 }

/** Extra "closeness" the current target gets (fraction of the radius), so edge noise doesn't flicker. */
const STICKINESS = 0.5

/**
 * Elements marked with `data-gaze-target` that are visible and not covered by something else
 * (e.g. a modal or the calibration overlay), checked at their centre.
 */
export function findGazeTargets(root: ParentNode = document): GazeTargetRect[] {
  const targets: GazeTargetRect[] = []
  root.querySelectorAll<HTMLElement>('[data-gaze-target]').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || !el.checkVisibility()) return
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (!top || !el.contains(top)) return
    targets.push({
      id: el.dataset.gazeTarget ?? '',
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      element: el
    })
  })
  return targets
}

function distanceToRect(x: number, y: number, t: GazeTargetRect): number {
  const dx = Math.max(t.left - x, 0, x - t.right)
  const dy = Math.max(t.top - y, 0, y - t.bottom)
  return Math.hypot(dx, dy)
}

/**
 * Pulls the gaze point toward nearby eye-clickable targets and locks onto one, with
 * hysteresis so tracking noise near an edge doesn't make the selection jump around.
 */
export class AimAssist {
  private locked: string | null = null

  constructor(public options: AimAssistOptions = { ...DEFAULT_AIM_ASSIST }) {}

  apply(x: number, y: number, targets: GazeTargetRect[]): AssistResult {
    if (!this.options.enabled) {
      this.locked = null
      const hit = targets.find((t) => distanceToRect(x, y, t) === 0)
      return { x, y, target: hit?.id ?? null }
    }

    let best: GazeTargetRect | null = null
    let bestDistance = Infinity
    let bestScore = Infinity
    for (const t of targets) {
      const d = distanceToRect(x, y, t)
      const score = d - (t.id === this.locked ? STICKINESS * this.options.radius : 0)
      if (score < bestScore) {
        best = t
        bestDistance = d
        bestScore = score
      }
    }
    const reach =
      this.options.radius + (best?.id === this.locked ? STICKINESS * this.options.radius : 0)
    if (!best || bestDistance > reach) {
      this.locked = null
      return { x, y, target: null }
    }

    this.locked = best.id
    const pull = this.options.strength * (1 - bestDistance / reach)
    const cx = (best.left + best.right) / 2
    const cy = (best.top + best.bottom) / 2
    return { x: x + pull * (cx - x), y: y + pull * (cy - y), target: best.id }
  }

  reset(): void {
    this.locked = null
  }
}
