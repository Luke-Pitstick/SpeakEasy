import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore } from '../src/main/settings'
import { DEFAULT_SETTINGS, validSettingsPatch } from '../src/shared/settings'

const folders: string[] = []
function settingsPath(): string {
  const folder = mkdtempSync(join(tmpdir(), 'speakeasy-settings-'))
  folders.push(folder)
  return join(folder, 'settings.json')
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('settings persistence', () => {
  it('restores every preference from disk in a new store without a shutdown hook', () => {
    const path = settingsPath()
    const first = new SettingsStore(path)
    expect(first.read()).toEqual(DEFAULT_SETTINGS)
    const changed = {
      phraseModel: 'test/alternative',
      theme: 'dark' as const,
      speed: 1.4,
      edgeHeight: 88,
      weighting: 'uniform' as const,
      showGazeDot: false,
      dwell: false,
      duration: 1500,
      geminiEnabled: true
    }
    first.save(changed)
    expect(new SettingsStore(path).read()).toEqual(changed)
    first.save({ geminiEnabled: false })
    expect(new SettingsStore(path).read()).toEqual({ ...changed, geminiEnabled: false })
  })

  it('merges successive changes without dropping other preferences', () => {
    const path = settingsPath()
    const store = new SettingsStore(path)
    store.save({ theme: 'light' })
    store.save({ duration: 700 })
    store.save({ speed: 2 })
    expect(new SettingsStore(path).read()).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'light',
      duration: 700,
      speed: 2
    })
  })

  it('rejects invalid settings and reports corrupt storage instead of overwriting it', () => {
    const path = settingsPath()
    const store = new SettingsStore(path)
    expect(() => store.save({ speed: NaN })).toThrow('Invalid settings')
    for (const value of [
      null,
      [],
      { unknown: 1 },
      { dwell: 'true' },
      { theme: 'blue' },
      { duration: 0 }
    ])
      expect(validSettingsPatch(value)).toBe(false)
    expect(validSettingsPatch({ geminiEnabled: true })).toBe(false)
    writeFileSync(path, '{broken')
    expect(() => new SettingsStore(path)).toThrow()
    expect(readFileSync(path, 'utf8')).toBe('{broken')
  })

  it('does not acknowledge a change when the file cannot be written', () => {
    const path = settingsPath()
    const store = new SettingsStore(join(path, 'settings.json'))
    writeFileSync(path, 'blocking parent file')
    expect(() => store.save({ theme: 'dark' })).toThrow()
    expect(store.read()).toEqual(DEFAULT_SETTINGS)
  })
})
