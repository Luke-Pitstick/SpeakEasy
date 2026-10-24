import type { GazeTargetRect } from './aimAssist'

/**
 * Safeguards for learning calibration from gaze-only selections. A selection made by the
 * tracker itself is weak evidence: if drift made it pick the wrong target, learning from it
 * would reinforce the drift. So only selections that are unambiguous are used.
 */

/** Fewer steady frames than this is too little evidence. */
const MIN_FRAMES = 8
/** RMS spread (px) of the raw gaze during the dwell above which the eyes weren't steady. */
const MAX_SPREAD_PX = 50
/** The selected target must be at least this much closer (px) than any other target. */
const AMBIGUITY_MARGIN_PX = 30
/** Raw gaze further than this from the target centre: probably not looking at it. */
const MAX_ERROR_PX = 300
/** Weight per frame for a small target, relative to a calibration frame (clicks use 30). */
const SELECTION_WEIGHT = 10
/** Targets bigger than this get proportionally less weight: "looked at the centre" is vaguer. */
const PRECISE_TARGET_PX = 150

export type SelectionAssessment =
  | { ok: true; focus: [number, number]; weight: number; error: number }
  | { ok: false; reason: string; error: number | null }

function distanceToRect([x, y]: [number, number], t: GazeTargetRect): number {
  const dx = Math.max(t.left - x, 0, x - t.right)
  const dy = Math.max(t.top - y, 0, y - t.bottom)
  return Math.hypot(dx, dy)
}

/**
 * Decides whether a dwell selection is trustworthy enough to learn from.
 *
 * @param rawGaze Unassisted model predictions (window px) for the steady part of the dwell.
 * @param selected The target that was selected.
 * @param others Every other visible target.
 * @returns The point assumed to be looked at (target centre) and a per-frame weight, or why
 *   the selection was rejected.
 */
export function assessSelection(
  rawGaze: [number, number][],
  selected: GazeTargetRect,
  others: GazeTargetRect[]
): SelectionAssessment {
  if (rawGaze.length < MIN_FRAMES) return { ok: false, reason: 'Too few eye frames', error: null }

  const mean: [number, number] = [
    rawGaze.reduce((s, p) => s + p[0], 0) / rawGaze.length,
    rawGaze.reduce((s, p) => s + p[1], 0) / rawGaze.length
  ]
  const focus: [number, number] = [
    (selected.left + selected.right) / 2,
    (selected.top + selected.bottom) / 2
  ]
  const error = Math.hypot(mean[0] - focus[0], mean[1] - focus[1])

  const spread = Math.sqrt(
    rawGaze.reduce((s, p) => s + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2, 0) / rawGaze.length
  )
  if (spread > MAX_SPREAD_PX) return { ok: false, reason: "Gaze wasn't steady", error }
  if (error > MAX_ERROR_PX) return { ok: false, reason: 'Gaze too far from target', error }
  const toSelected = distanceToRect(mean, selected)
  const toNearestOther = Math.min(Infinity, ...others.map((o) => distanceToRect(mean, o)))
  if (toNearestOther - toSelected < AMBIGUITY_MARGIN_PX) {
    return { ok: false, reason: 'Too close to another target', error }
  }

  const size = Math.max(selected.right - selected.left, selected.bottom - selected.top)
  const weight = SELECTION_WEIGHT * Math.max(0.25, Math.min(1, PRECISE_TARGET_PX / size))
  return { ok: true, focus, weight, error }
}

/** Neighbours are within this many target-sizes of each other (centre to centre). */
const NEIGHBOR_FACTOR = 1.75

/**
 * Whether two targets are next to each other. Selecting a neighbour right after a selection
 * usually means the first one missed, so it shouldn't be learned from.
 */
export function areNeighbors(a: GazeTargetRect, b: GazeTargetRect): boolean {
  if (a.id === b.id) return false
  const size = Math.max(a.right - a.left, a.bottom - a.top, b.right - b.left, b.bottom - b.top)
  const dx = (a.left + a.right - b.left - b.right) / 2
  const dy = (a.top + a.bottom - b.top - b.bottom) / 2
  return Math.hypot(dx, dy) < NEIGHBOR_FACTOR * size
}
