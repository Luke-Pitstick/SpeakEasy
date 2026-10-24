import { expect, it } from 'vitest'
import { AimAssist } from '../src/renderer/src/eyetracking/aimAssist'

const button = { id: 'menu', left: 100, top: 100, right: 200, bottom: 160 }

it('pulls gently toward a nearby button and locks onto it', () => {
  const assist = new AimAssist()
  // 20 px left of the button: locked, and nudged a little toward its centre (150, 130).
  const r = assist.apply(80, 130, [button])
  expect(r.target).toBe('menu')
  expect(r.x).toBeGreaterThan(80)
  expect(r.x - 80).toBeLessThan((150 - 80) * 0.2)
})

it('leaves the pointer alone further than 40 px from any button', () => {
  const assist = new AimAssist()
  expect(assist.apply(50, 130, [button])).toEqual({ x: 50, y: 130, target: null })
})
