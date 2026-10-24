import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DEFAULT_SETTINGS } from '../../shared/settings'

async function start(): Promise<void> {
  let settings = { ...DEFAULT_SETTINGS }
  let settingsError = ''
  try {
    if (!window.settings) throw Error('Desktop settings unavailable')
    settings = await window.settings.load()
  } catch {
    settingsError = 'Could not load saved settings. Check storage access and restart SpeakEasy.'
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App initialSettings={settings} initialSettingsError={settingsError} />
    </StrictMode>
  )
}
void start()
