import { expect, it } from 'vitest'
import { HeadPointer } from '../src/renderer/src/eyetracking/headPointer'
import type { HeadPose } from '../src/renderer/src/eyetracking/types'

/** A head pose pitched up by `deg` (camera +y is up; the face looks along +z). */
function pitched(deg: number): HeadPose {
  const a = (deg * Math.PI) / 180
  // Rotation about x, row-major: forward (0, 0, 1) becomes (0, sin a, cos a).
  return {
    rotation: [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)],
    eye: [0, 0, -50]
  }
}

it('holds the cursor at the edge past the screen and keeps the centre fixed', () => {
  const pointer = new HeadPointer()
  pointer.center([pitched(0)])
  expect(pointer.point(pitched(0), 1000, 800)).toEqual({ x: 500, y: 400, offscreen: false })

  // Tilting far above the page pins the cursor to the top edge, flagged as off-screen...
  const above = pointer.point(pitched(30), 1000, 800)!
  expect(above.y).toBe(0)
  expect(above.offscreen).toBe(true)
  // ...and returning to the neutral pose returns it to the centre, not somewhere lower.
  const back = pointer.point(pitched(0), 1000, 800)!
  expect(back.x).toBeCloseTo(500)
  expect(back.y).toBeCloseTo(400)
  expect(back.offscreen).toBe(false)
})
