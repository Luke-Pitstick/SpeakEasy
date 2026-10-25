import { describe, expect, it } from 'vitest'
import { DasherEngine } from '../src/renderer/src/features/dasher/engine'
import {
  CharacterPredictor,
  INITIAL_ALPHABET,
  LITERAL_ALPHABET,
  normalize
} from '../src/renderer/src/features/dasher/prediction'
import { Geometry } from '../src/renderer/src/features/dasher/geometry'
import { localSample } from '../src/renderer/src/interaction/input'

function steer(engine: DasherEngine, wanted: string, alphabet = INITIAL_ALPHABET): number {
  for (let frame = 0; frame < 4000; frame++) {
    if (engine.text === wanted) return frame
    // Continue into a letter until its region becomes the root before
    // navigating its continuations, matching Dasher's continuous zoom path.
    const prefix = engine.root.text
    const character = wanted[prefix.length]
    const regions = engine.regions()
    let target = regions.find((region) => region.text === prefix + character)
    if (!wanted.startsWith(prefix)) {
      engine.setSample(-engine.geometry.width * 0.4, 0)
      engine.step(16.67)
      continue
    }
    if (!target) {
      // Low-probability branches start below the draw/spawn cutoff. Aim into
      // their interval and zoom until they are large enough to be revealed.
      const index = alphabet.indexOf(character)
      const height = engine.root.height * engine.root.fractions[index]
      target = {
        id: -1,
        label: character,
        text: prefix + character,
        depth: 1,
        likelihood: 0,
        selected: false,
        height,
        left: engine.geometry.solveLeft(height),
        top:
          engine.root.top +
          engine.root.height * engine.root.fractions.slice(0, index).reduce((a, b) => a + b, 0)
      }
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
    const engine = new DasherEngine(1100, 330, '', false, 'uniform')
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

it('roundtrips upstream piecewise Dasher geometry above the minimum target height', () => {
  const geometry = new Geometry(1100, 330)
  for (const height of [5, 20, 100, 330, 5000])
    expect(geometry.solveHeight(geometry.solveLeft(height))).toBeCloseTo(height)
})

it('sizes initials by word context instead of forcing equal letter boxes', () => {
  const first = new DasherEngine(1280, 600)
  const afterI = new DasherEngine(1280, 600, 'i')
  const afterIw = new DasherEngine(1280, 600, 'iw')
  expect(
    new Set(first.regions().map((region) => Math.round(region.height * 100))).size
  ).toBeGreaterThan(1)
  expect(afterI.root.fractions).not.toEqual(first.root.fractions)
  expect(afterIw.root.fractions).not.toEqual(afterI.root.fractions)
  for (const engine of [first, afterI, afterIw]) {
    expect(engine.root.fractions.every((weight) => weight > 0)).toBe(true)
    expect(engine.root.fractions.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    const before = engine.text
    engine.resume()
    expect(engine.step(16.67)).toBeNull()
    expect(engine.text).toBe(before)
  }
})

it('ranks box likelihood from the least to the most probable sibling', () => {
  const ppm = new DasherEngine(1280, 600, 'i')
  const letters = ppm.regions().filter((region) => region.depth === 1)
  const fractions = ppm.root.fractions
  const most = fractions.indexOf(Math.max(...fractions))
  const least = fractions.indexOf(Math.min(...fractions))
  expect(letters[most].likelihood).toBe(1)
  expect(letters[least].likelihood).toBe(0)
  for (const region of ppm.regions()) {
    expect(region.likelihood).toBeGreaterThanOrEqual(0)
    expect(region.likelihood).toBeLessThanOrEqual(1)
  }
  const uniform = new DasherEngine(1280, 600, '', false, 'uniform')
  expect(uniform.regions().every((region) => region.likelihood === 1)).toBe(true)
})

it('selects exactly the entered letters on the path to the output', () => {
  const engine = new DasherEngine(1280, 600)
  expect(engine.regions().some((region) => region.selected)).toBe(false)
  engine.resume()
  engine.setSample(engine.geometry.width * 0.4, 0)
  for (let frame = 0; frame < 2000 && engine.text.length < 2; frame++) engine.step(16.67)
  expect(engine.text.length).toBeGreaterThanOrEqual(2)
  const selected = engine.regions().filter((region) => region.selected)
  expect(selected.map((region) => region.text)).toContain(engine.text)
  for (const region of selected) expect(engine.text.startsWith(region.text)).toBe(true)
  const unselected = engine.regions().filter((region) => region.label && !region.selected)
  expect(unselected.length).toBeGreaterThan(0)
  for (const region of unselected) expect(engine.text.startsWith(region.text)).toBe(false)
})

it('starts with a-z followed by ! and ? visible before any steering', () => {
  for (const height of [188, 330, 600, 1200]) {
    const engine = new DasherEngine(1280, height)
    const letters = engine.regions().filter((region) => region.depth === 1)
    expect(engine.text).toBe('')
    expect(engine.root.text).toBe('')
    expect(letters.map((region) => region.label)).toEqual(INITIAL_ALPHABET)
    for (let index = 0; index < letters.length; index++) {
      const letter = letters[index]
      expect(letter.height).toBeGreaterThanOrEqual(engine.geometry.drawThresholdRect - 0.001)
      expect(letter.left).toBeGreaterThan(0)
      expect(letter.top).toBeGreaterThanOrEqual(engine.geometry.top)
      expect(letter.top + letter.height).toBeLessThanOrEqual(engine.geometry.bottom + 0.001)
      if (index) expect(letter.top).toBeCloseTo(letters[index - 1].top + letters[index - 1].height)
    }
    engine.resume()
    expect(engine.step(16)).toBeNull()
    expect(engine.text).toBe('')
  }
})
it('keeps the outer alphabet within reach while steering through empty space', () => {
  for (const y of [-180, 180]) {
    const engine = new DasherEngine(1280, 406)
    engine.resume()
    engine.setSample(160, y)
    for (let frame = 0; frame < 120; frame++) engine.step(16.67)
    expect(engine.root.top).toBeLessThan(0)
    expect(engine.root.top + engine.root.height).toBeGreaterThan(0)
    expect(
      engine
        .regions()
        .some(
          (region) =>
            region.top < engine.geometry.bottom && region.top + region.height > engine.geometry.top
        )
    ).toBe(true)
  }
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

it('uses the whole viewport for nested letter regions on wide displays', () => {
  for (const width of [900, 3456]) {
    const height = 600
    const engine = new DasherEngine(width, height, '', false, 'uniform')
    expect(engine.geometry.width).toBe(width)
    const letters = engine.regions().filter((region) => region.depth === 1)
    expect(letters.map((region) => region.label)).toEqual(INITIAL_ALPHABET)
    for (const region of letters) {
      expect(region.left).toBeGreaterThan(width * 0.3)
      expect(engine.geometry.right - region.left).toBeLessThan(width * 0.2)
      expect(region.top).toBeGreaterThanOrEqual(-height / 2)
      expect(region.top + region.height).toBeLessThanOrEqual(height / 2)
    }
  }
})

it('expands the target and reveals nested continuations while steering', () => {
  const engine = new DasherEngine(1280, 600, '', false, 'uniform')
  const initial = engine.regions().find((region) => region.text === 'n')!
  engine.resume()
  engine.setSample(180, 0)
  for (let frame = 0; frame < 80; frame++) engine.step(16.67)
  const regions = engine.regions()
  const parent = regions.find((region) => region.text === 'n')!
  expect(parent.height).toBeGreaterThan(initial.height * 2)
  expect(parent.left).toBeLessThan(initial.left)
  expect(regions.some((region) => region.text.startsWith('n') && region.text.length === 2)).toBe(
    false
  )
  for (let frame = 0; frame < 60; frame++) engine.step(16.67)
  const expanded = engine.regions().find((region) => region.text === 'n')!
  const children = engine
    .regions()
    .filter((region) => region.text.startsWith('n') && region.text.length === 2)
  expect(children.length).toBeGreaterThan(0)
  for (const child of children) {
    expect(child.height).toBeGreaterThanOrEqual(engine.geometry.spawnThreshold)
    expect(child.left).toBeGreaterThan(expanded.left)
    expect(child.top).toBeGreaterThanOrEqual(expanded.top - 0.001)
    expect(child.top + child.height).toBeLessThanOrEqual(expanded.top + expanded.height + 0.001)
  }
})

it('resizes boxes without rebuilding the current branch or losing zoom and text', () => {
  const engine = new DasherEngine(1280, 600)
  engine.resume()
  steer(engine, 'iw')
  const text = engine.text
  const rootId = engine.root.id
  const old = engine.regions()
  engine.resize(1920, 600)
  for (const region of old) {
    const resized = engine.regions().find((next) => next.id === region.id)!
    expect(resized.height).toBeCloseTo(region.height)
    expect(resized.left).toBeCloseTo(region.left * 1.5)
  }
  engine.resize(1920, 900)
  expect(engine.text).toBe(text)
  expect(engine.root.id).toBe(rootId)
  for (const region of old) {
    const resized = engine.regions().find((next) => next.id === region.id)!
    expect(resized.height).toBeCloseTo(region.height * 1.5)
    expect(resized.top).toBeCloseTo(region.top * 1.5)
    expect(resized.left).toBeCloseTo(region.left * 1.5)
  }
  expect(engine.step(16)).toBeNull()
  engine.resume()
  engine.setSample(-400, 0)
  for (let i = 0; i < 2000 && engine.text; i++) engine.step(16.67)
  expect(engine.text).toBe('')
})

it('keeps the same zoom rate across character selection and root promotion', () => {
  const engine = new DasherEngine(1280, 600)
  engine.resume()
  engine.setSample(320, 1)
  const factor = Math.exp((320 / 1280) * 0.18 * (16.67 / 33))
  let promotions = 0
  let checked = 0
  for (let frame = 0; frame < 600; frame++) {
    const before = engine.regions()
    const rootId = engine.root.id
    engine.step(16.67)
    if (rootId !== engine.root.id) promotions++
    const after = new Map(engine.regions().map((region) => [region.id, region]))
    for (const region of before) {
      const next = after.get(region.id)
      if (!next) continue
      expect(next.height / region.height).toBeCloseTo(factor, 8)
      checked++
    }
  }
  expect(promotions).toBeGreaterThan(1)
  expect(checked).toBeGreaterThan(1000)
  expect(engine.text.length).toBeGreaterThan(1)
})
