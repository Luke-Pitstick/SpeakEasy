import { useEffect, useState } from 'react'
import type { DemoScenario } from '../../shared/prediction'
import { CompositionProvider } from './composition/context'
import { useComposition, useCompositionDispatch } from './composition/state'
import { DasherPanel } from './features/dasher/DasherPanel'
import { SpeakFasterPanel } from './features/speakfaster/SpeakFasterPanel'
import { ActionButton, InteractionProvider } from './interaction/controls'
import { useInteraction } from './interaction/state'

function Workspace(): React.JSX.Element {
  const state = useComposition()
  const dispatch = useCompositionDispatch()
  const interaction = useInteraction()
  const [menu, setMenu] = useState<'closed' | 'more' | 'settings'>('closed')
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [speed, setSpeed] = useState(0.6)
  const [weighting, setWeighting] = useState<'uniform' | 'ppm'>('ppm')
  const [scenario, setScenario] = useState<DemoScenario>('normal')
  useEffect(() => {
    const pause = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        dispatch({ type: 'pause', notice: 'Paused.' })
        setMenu('closed')
      }
    }
    window.addEventListener('keydown', pause)
    return () => window.removeEventListener('keydown', pause)
  }, [dispatch])
  const hasChoices =
    state.paused &&
    (state.status !== 'idle' ||
      !!state.selection ||
      state.editor !== 'entry' ||
      state.mode === 'keyword' ||
      state.mode === 'replacement')
  const closeMenu = (): void => setMenu('closed')
  const configure = (change: () => void): void => {
    dispatch({ type: 'pause' })
    change()
  }
  return (
    <main
      className={`workspace ${hasChoices ? 'has-choices' : ''} ${state.paused ? 'has-phrase-tools' : ''}`}
      data-theme={theme}
    >
      <header className="app-header">
        <h1>SpeakEasy</h1>
        <span className="input-status">
          {state.paused ? 'Paused' : 'Writing'}
          <span className="status-divider">/</span>Offline demo
        </span>
        <ActionButton
          className="header-writing"
          identity={`writing-${state.paused}-${state.editor}-${state.mode}-${state.selectedToken ?? ''}-${state.selection?.start ?? ''}`}
          disabled={
            menu !== 'closed' ||
            (state.editor === 'phrase' && state.mode !== 'replacement') ||
            (state.editor === 'keywords' && !state.selectedToken)
          }
          onAction={() => dispatch({ type: state.paused ? 'resume' : 'pause' })}
        >
          {state.paused ? 'Start writing' : 'Pause writing'}
        </ActionButton>
        <ActionButton
          className="header-menu"
          identity={`more-${menu}`}
          disabled={menu !== 'closed'}
          onAction={() => configure(() => setMenu('more'))}
        >
          Menu
        </ActionButton>
      </header>
      <div className="workspace-body" inert={menu !== 'closed' || undefined}>
        <SpeakFasterPanel scenario={scenario} />
        <DasherPanel speed={speed} weighting={weighting} />
      </div>
      {menu !== 'closed' && (
        <div className="menu-scrim">
          <section
            className="menu-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-title"
          >
            <div className="menu-heading">
              <h2 id="menu-title">{menu === 'settings' ? 'Settings' : 'Menu'}</h2>
              <ActionButton identity="close-menu" onAction={closeMenu}>
                Back
              </ActionButton>
            </div>
            {menu === 'more' ? (
              <div className="more-grid">
                <ActionButton
                  identity={`undo-${state.revision}`}
                  disabled={!state.history.length}
                  onAction={() => {
                    dispatch({ type: 'undo' })
                    closeMenu()
                  }}
                >
                  Undo
                </ActionButton>
                <ActionButton
                  identity={`delete-${state.revision}`}
                  onAction={() => {
                    dispatch({ type: 'backspace' })
                    closeMenu()
                  }}
                >
                  Delete
                </ActionButton>
                <ActionButton
                  identity={`mode-${state.revision}`}
                  onAction={() => {
                    dispatch({
                      type: 'mode',
                      mode: state.mode === 'initials' ? 'literal' : 'initials'
                    })
                    closeMenu()
                  }}
                >
                  {state.mode === 'initials' ? 'Exact spelling' : 'Enter initials'}
                </ActionButton>
                <ActionButton
                  identity={`back-${state.revision}`}
                  disabled={!state.branches.length}
                  onAction={() => {
                    dispatch({ type: 'back' })
                    closeMenu()
                  }}
                >
                  Previous phrase
                </ActionButton>
                <ActionButton
                  identity={`new-${state.revision}`}
                  disabled={!state.draft && !state.tokens.length}
                  onAction={() => {
                    dispatch({ type: 'clear' })
                    closeMenu()
                  }}
                >
                  New message
                </ActionButton>
                <ActionButton identity="settings" onAction={() => setMenu('settings')}>
                  Settings
                </ActionButton>
                <ActionButton
                  identity="demo"
                  onAction={() => {
                    dispatch({ type: 'example', initials: 'iwac' })
                    closeMenu()
                  }}
                >
                  Load demo initials
                </ActionButton>
              </div>
            ) : (
              <div className="settings-grid">
                <label>
                  Appearance
                  <select
                    value={theme}
                    onChange={(event) =>
                      configure(() => setTheme(event.target.value as typeof theme))
                    }
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label>
                  Steering speed
                  <select
                    value={speed}
                    onChange={(event) => configure(() => setSpeed(Number(event.target.value)))}
                  >
                    <option value={0.4}>Slow</option>
                    <option value={0.6}>Standard</option>
                    <option value={1}>Fast</option>
                  </select>
                </label>
                <label>
                  Letter prediction
                  <select
                    value={weighting}
                    onChange={(event) =>
                      configure(() => setWeighting(event.target.value as typeof weighting))
                    }
                  >
                    <option value="ppm">PPM (trained initials)</option>
                    <option value="uniform">Uniform</option>
                  </select>
                </label>
                <label>
                  Dwell activation
                  <select
                    value={String(interaction.dwell)}
                    onChange={(event) =>
                      configure(() => interaction.setDwell(event.target.value === 'true'))
                    }
                  >
                    <option value="false">Off — click to select</option>
                    <option value="true">On — look to select</option>
                  </select>
                </label>
                <label>
                  Dwell time
                  <select
                    value={interaction.duration}
                    onChange={(event) =>
                      configure(() => interaction.setDuration(Number(event.target.value)))
                    }
                  >
                    <option value={700}>700 ms</option>
                    <option value={1000}>1 second</option>
                    <option value={1500}>1.5 seconds</option>
                  </select>
                </label>
                <label>
                  Demo response
                  <select
                    value={scenario}
                    onChange={(event) => {
                      dispatch({ type: 'dismiss' })
                      setScenario(event.target.value as DemoScenario)
                    }}
                  >
                    <option value="normal">Normal</option>
                    <option value="empty">No matches</option>
                    <option value="error">Error</option>
                    <option value="timeout">Timeout</option>
                    <option value="late">Late response</option>
                    <option value="invalid">Invalid response</option>
                  </select>
                </label>
                <p className="settings-note">
                  Mouse and dwell input. Phrase suggestions use demo data. No eye tracker, LLM, or
                  speech service is connected.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default function App(): React.JSX.Element {
  return (
    <CompositionProvider>
      <InteractionProvider>
        <Workspace />
      </InteractionProvider>
    </CompositionProvider>
  )
}
