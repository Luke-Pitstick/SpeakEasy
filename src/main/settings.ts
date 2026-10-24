import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_SETTINGS, validSettingsPatch, type AppSettings } from '../shared/settings'

export class SettingsStore {
  private settings = { ...DEFAULT_SETTINGS }

  constructor(private readonly path: string) {
    try {
      const saved: unknown = JSON.parse(readFileSync(path, 'utf8'))
      if (!validSettingsPatch(saved, true)) throw Error('Invalid saved settings')
      this.settings = { ...DEFAULT_SETTINGS, ...saved }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  read(): AppSettings {
    return { ...this.settings }
  }

  save(patch: Partial<AppSettings>): void {
    if (!validSettingsPatch(patch, true)) throw Error('Invalid settings')
    const next = { ...this.settings, ...patch }
    // Small, infrequent writes finish before IPC acknowledges the change or the app quits.
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path + '.tmp', JSON.stringify(next), { mode: 0o600 })
    renameSync(this.path + '.tmp', this.path)
    this.settings = next
  }
}
