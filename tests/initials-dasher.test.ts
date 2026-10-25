import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DasherEngine } from '../src/renderer/src/features/dasher/engine'
import {
  CharacterPredictor,
  INITIAL_ALPHABET
} from '../src/renderer/src/features/dasher/prediction'
import {
  loadInitialsModel,
  trainedInitials
} from '../src/renderer/src/features/dasher/initials-model'
import { entryContext, entrySeed, initialState } from '../src/renderer/src/composition/model'

/** Synthetic controller: pan toward a region, then zoom its center. Not gaze evidence. */
function enter(engine: DasherEngine, wanted: string): number {
  for (let frame = 0; frame < 5000; frame++) {
    if (engine.text === wanted) return frame
    const prefix = engine.root.text
    if (!wanted.startsWith(prefix)) {
      engine.setSample(-engine.geometry.width * 0.4, 0)
      engine.step(16.67)
      continue
    }
    const letter = wanted[prefix.length]
    const index = INITIAL_ALPHABET.indexOf(letter)
    if (index < 0) throw new Error(`No initial target for ${wanted} after ${prefix}`)
    const fraction = engine.root.fractions[index]
    const top =
      engine.root.top +
      engine.root.height * engine.root.fractions.slice(0, index).reduce((a, b) => a + b, 0)
    const center = top + (engine.root.height * fraction) / 2
    // A large proportional margin can make the last letter's interval
    // unreachable to the controller even though a pointer can aim inside it.
    const edge = Math.min(8, engine.geometry.height * 0.025)
    const clipped = Math.max(
      engine.geometry.top + edge,
      Math.min(engine.geometry.bottom - edge, center)
    )
    engine.setSample(center === clipped ? engine.geometry.width * 0.1 : 0, clipped)
    engine.step(16.67)
  }
  const index = INITIAL_ALPHABET.indexOf(wanted[engine.root.text.length])
  throw new Error(
    `Rare-entry timeout: ${engine.text} -> ${wanted}; ${JSON.stringify({
      height: engine.geometry.height,
      root: engine.root.text,
      top: engine.root.top,
      rootHeight: engine.root.height,
      fraction: engine.root.fractions[index],
      targetTop:
        engine.root.top +
        engine.root.height * engine.root.fractions.slice(0, index).reduce((a, b) => a + b, 0),
      ancestors: engine.ancestorCount
    })}`
  )
}

function reverse(engine: DasherEngine, wanted: string): number {
  engine.setSample(-engine.geometry.width * 0.4, 0)
  for (let frame = 0; frame < 5000; frame++) {
    if (engine.text === wanted) return frame
    engine.step(16.67)
  }
  throw new Error(`Reversal timeout: ${engine.text} -> ${wanted}`)
}

describe('frozen initials PPM in Dasher', () => {
  it('reaches bottom-edge z from a seeded viewport', () => {
    const engine = new DasherEngine(1280, 600, 'iw')
    engine.resume()
    enter(engine, 'iwz')
  })
  it('preserves trained letter proportions while reserving mass for punctuation', () => {
    const raw = readFileSync('src/renderer/src/features/dasher/initials-model.json')
    expect(createHash('sha256').update(raw).digest('hex')).toBe(
      '2780b90e230892ba92fd8c2c16053c8d61558595a1a92b2247b48ee02d5171ba'
    )
    expect(trainedInitials.model?.artifact.config).toEqual({
      maxHistory: 2,
      aacWeight: 0.5,
      floor: 0.1
    })
    const predictor = new CharacterPredictor(INITIAL_ALPHABET, 'initials')
    for (const context of ['', 'iw', 'ty', 'qxz', 'z'.repeat(24)]) {
      expect(predictor.weights(context)).toEqual([
        ...trainedInitials.model!.weights(context).map((p) => p * (26 / 28)),
        1 / 28,
        1 / 28
      ])
      expect(predictor.weights(context).every((p) => p >= 0.1 / 28)).toBe(true)
    }
    expect(predictor.weights('iw?ty')).toEqual(predictor.weights('ty'))
    expect(predictor.weights('iw!')).toEqual(predictor.weights(''))
  })

  it('places ! and ? after z and can enter and reverse both marks', () => {
    const engine = new DasherEngine(1280, 600, 'cyhm')
    expect(engine.root.choices.slice(-3).map((choice) => choice.character)).toEqual(['z', '!', '?'])
    engine.resume()
    enter(engine, 'cyhm?')
    reverse(engine, 'cyhm')
    enter(engine, 'cyhm!')
  })

  it('reports a uniform fallback if an invalid or differently smoothed asset is supplied', () => {
    expect(loadInitialsModel({})).toEqual({
      model: null,
      status: 'Initials model unavailable · using uniform letters'
    })
    const wrongFloor = JSON.parse(
      readFileSync('src/renderer/src/features/dasher/initials-model.json', 'utf8')
    )
    wrongFloor.config.floor = 0.05
    expect(loadInitialsModel(wrongFloor).model).toBeNull()
  })

  it('enters and reverses q, x, and z after ordinary and unfamiliar histories', () => {
    for (const height of [188, 330, 600])
      for (const history of ['', 'iw', 'ty', 'qzxz', 'a'.repeat(10)]) {
        for (const letter of 'qxz') {
          const engine = new DasherEngine(1280, height, history)
          const originalFractions = engine.root.fractions
          engine.resume()
          expect(enter(engine, history + letter)).toBeLessThan(5000)
          expect(reverse(engine, history)).toBeLessThan(5000)
          expect(engine.text).toBe(history)
          expect(enter(engine, history + letter)).toBeLessThan(5000)
          expect(Object.isFrozen(originalFractions)).toBe(true)
          expect(engine.regions().length).toBeLessThanOrEqual(421)
        }
      }
  })

  it('reverses across promoted roots, restores fractions, and re-enters rare sequences', () => {
    const engine = new DasherEngine(1280, 600)
    const fractions = engine.root.fractions
    engine.resume()
    enter(engine, 'iwqxzq')
    expect(engine.ancestorCount).toBeGreaterThan(2)
    reverse(engine, '')
    expect(engine.root.text).toBe('')
    expect(engine.root.fractions).toBe(fractions)
    enter(engine, 'zxq')
    reverse(engine, '')
    expect(engine.text).toBe('')
  })

  it('never reweights an existing branch during steering, pause, resume, or resize', () => {
    const engine = new DasherEngine(1280, 600)
    const seen = new Map<number, readonly number[]>()
    engine.resume()
    engine.setSample(320, 1)
    for (let frame = 0; frame < 600; frame++) {
      const visit = (box: typeof engine.root): void => {
        const previous = seen.get(box.id)
        if (previous) expect(box.fractions).toBe(previous)
        else seen.set(box.id, box.fractions)
        expect(Object.isFrozen(box.fractions)).toBe(true)
        for (const child of box.children) if (child) visit(child)
      }
      visit(engine.root)
      engine.step(16.67)
      if (frame === 150) {
        const root = engine.root
        engine.pause()
        expect(engine.step(16)).toBeNull()
        engine.resize(1024, 330)
        expect(engine.root).toBe(root)
        engine.resume()
        engine.setSample(250, 1)
      }
    }
    expect(seen.size).toBeGreaterThan(100)
  })

  it('uses locked-word initials as context without making them reversible output', () => {
    const state = {
      ...initialState(),
      tokens: [
        { id: 'i', kind: 'initial' as const, value: 'i' },
        { id: 'word', kind: 'word' as const, value: 'want' },
        { id: 'a', kind: 'initial' as const, value: 'a' }
      ]
    }
    expect(entryContext(state)).toBe('iw')
    expect(entrySeed(state)).toBe('a')
    const engine = new DasherEngine(
      1280,
      600,
      entrySeed(state),
      false,
      'ppm',
      22,
      entryContext(state)
    )
    expect(engine.root.fractions).toEqual(new DasherEngine(1280, 600, 'iwa').root.fractions)
    engine.resume()
    enter(engine, 'aq')
    reverse(engine, '')
    expect(engine.text).toBe('')
    expect(state.tokens[1].value).toBe('want')
    const unsupported = { ...state, tokens: [{ id: 'n', kind: 'word' as const, value: '2day' }] }
    expect(entryContext(unsupported)).toBe('')
    expect(entryContext({ ...state, mode: 'literal' })).toBe('')
  })
})
