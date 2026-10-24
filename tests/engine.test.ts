import { describe, expect, it } from 'vitest'
import { DasherEngine } from '../src/renderer/src/features/dasher/engine'
import {
  CharacterPredictor,
  INITIAL_ALPHABET,
  LITERAL_ALPHABET,
  normalize
} from '../src/renderer/src/features/dasher/prediction'
import { Geometry, fittedWidth } from '../src/renderer/src/features/dasher/geometry'
import { localSample } from '../src/renderer/src/interaction/input'

function steer(engine: DasherEngine, wanted: string, alphabet = INITIAL_ALPHABET): number {
  for (let frame = 0; frame < 4000; frame++) {
    if (engine.text === wanted) return frame
    // Continue into a letter until its region becomes the root before
    // navigating its continuations, matching Dasher's continuous zoom path.
    const prefix = engine.root.text
    const character = wanted[prefix.length]
    const regions = engine.regions()
    const target = regions.find((region) => region.text === prefix + character)
    if (!wanted.startsWith(prefix)) {
      engine.setSample(-engine.geometry.width * 0.4, 0)
      engine.step(16.67)
      continue
    }
    if (!target) {
      engine.setSample(
        0,
        alphabet.indexOf(character) < alphabet.length / 2
          ? engine.geometry.top + 8
          : engine.geometry.bottom - 8
      )
      engine.step(16.67)
      continue
    }
    const center = target.top + target.height / 2
    const y = Math.max(engine.geometry.top + 8, Math.min(engine.geometry.bottom - 8, center))
    engine.setSample(
      center < engine.geometry.top + 8 || center > engine.geometry.bottom - 8
        ? 0
        : engine.geometry.width * 0.1,
      y
    )
    engine.step(16.67)
  }
  throw new Error(`Timed out: ${engine.text} -> ${wanted}`)
}

describe('typed Dasher navigation', () => {
  it('continuously enters initials and reverses across promoted roots', () => {
    const engine = new DasherEngine(1100, 330)
    engine.resume()
    const frames = steer(engine, 'iwac')
    expect(frames).toBeLessThan(2500)
    expect(engine.ancestorCount).toBeGreaterThan(0)
    engine.setSample(-450, 0)
    for (let i = 0; i < 2000 && engine.text; i++) engine.step(16.67)
    expect(engine.text).toBe('')
    engine.pause()
    engine.setSample(450, 100)
    expect(engine.step(100)).toBeNull()
    expect(engine.text).toBe('')
  })
  it('replays a seed reversibly and retains text while paused', () => {
    const engine = new DasherEngine(1100, 330, 'iwac')
    expect(engine.text).toBe('iwac')
    expect(engine.step(16)).toBeNull()
    engine.resume()
    engine.setSample(-450, 0)
    for (let i = 0; i < 2000 && engine.text === 'iwac'; i++) engine.step(16.67)
    expect(engine.text).toBe('iwa')
    steer(engine, 'iwac')
    expect(engine.text).toBe('iwac')
  })
  it('makes every initial reachable and bounds visible work', () => {
    for (const character of INITIAL_ALPHABET) {
      const engine = new DasherEngine(1100, 330)
      engine.resume()
      steer(engine, character)
      expect(engine.regions().length).toBeLessThanOrEqual(421)
    }
  })
  it('preserves punctuation and an uncommon literal name on seeding', () => {
    const engine = new DasherEngine(1100, 330, 'Hello, Zephyr!', true)
    expect(engine.text).toBe('Hello, Zephyr!')
    engine.resume()
    engine.setSample(-450, 0)
    for (let i = 0; i < 2000 && engine.text.endsWith('!'); i++) engine.step(16.67)
    expect(engine.text).toBe('Hello, Zephyr')
  })
})

it('roundtrips square Dasher geometry', () => {
  const geometry = new Geometry(1100, 330)
  for (const height of [5, 20, 100, 330, 5000])
    expect(geometry.solveHeight(geometry.solveLeft(height))).toBeCloseTo(height)
})
it('covers every PPM symbol, including the last, with normalized positive weights', () => {
  const predictor = new CharacterPredictor(LITERAL_ALPHABET, 'ppm')
  for (const context of ['', 'I want a ', 'Zephyr', '???']) {
    const weights = predictor.weights(context)
    expect(weights).toHaveLength(LITERAL_ALPHABET.length)
    expect(weights.every((weight) => Number.isFinite(weight) && weight > 0)).toBe(true)
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  }
  expect(normalize([NaN], 3)).toEqual([1 / 3, 1 / 3, 1 / 3])
})
it('rejects stale, invalid and out-of-panel input without a display-scale assumption', () => {
  const bounds = { left: 20, top: 450, width: 1000, height: 300 }
  expect(localSample({ x: 520, y: 600, timestamp: 1000, valid: true }, bounds, 1000)).toEqual({
    x: 0,
    y: 0
  })
  expect(localSample({ x: 520, y: 600, timestamp: 1000, valid: true }, bounds, 1300)).toBeNull()
  expect(localSample({ x: 520, y: 600, timestamp: 1000, valid: false }, bounds, 1000)).toBeNull()
  expect(localSample({ x: 520, y: 200, timestamp: 1000, valid: true }, bounds, 1000)).toBeNull()
})

it('pauses at the same entry limit as the composition state', () => {
  const engine = new DasherEngine(1100, 330, 'a'.repeat(24))
  engine.resume()
  engine.setSample(200, 0)
  expect(engine.step(16)).toMatchObject({ text: 'a'.repeat(24), limitReached: true })
  expect(engine.step(16)).toBeNull()
})

it('fits a full alphabet without stretching rectangles on ultrawide displays', () => {
  for (const width of [900, 3456]) {
    const height = 600
    const engine = new DasherEngine(fittedWidth(width, height), height)
    expect(engine.geometry.width).toBeLessThanOrEqual(height * 1.5)
    expect(engine.regions().map((region) => region.label)).toEqual(INITIAL_ALPHABET)
    for (const region of engine.regions()) {
      expect(engine.geometry.right - region.left).toBeCloseTo(region.height)
      expect(region.top).toBeGreaterThanOrEqual(-height / 2)
      expect(region.top + region.height).toBeLessThanOrEqual(height / 2)
    }
  }
})
