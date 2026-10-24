import type { DebugContext } from '../../shared/diagnostics'
import { useCallback, useEffect, useRef, useState } from 'react'
import { canLockSentence, messageText } from './composition/model'
import { CompositionProvider } from './composition/context'
import { useComposition, useCompositionDispatch } from './composition/state'
import { DasherPanel } from './features/dasher/DasherPanel'
import { trainedInitials } from './features/dasher/initials-model'
import { DraftPanel, SpeakFasterPanel } from './features/speakfaster/SpeakFasterPanel'
import { GazeLayer, type GazeOverlay } from './features/gaze/GazeLayer'
import { GazeSettings } from './features/gaze/GazeSettings'
import { loadInputSource, saveInputSource, type InputSource } from './features/gaze/input'
import { GazeProvider } from './eyetracking/GazeProvider'
import { ActionButton, InteractionProvider } from './interaction/controls'
import { DwellSelect, type DwellOption } from './interaction/DwellSelect'
import { useInteraction } from './interaction/state'
import { ConversationPanel } from './prediction/ConversationPanel'
import { usePredictions } from './prediction/usePredictions'
import { useVoice } from './features/voice/useVoice'
import { VoiceSettings } from './features/voice/VoiceSettings'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type GeneralSettingsPatch
} from '../../shared/settings'

// How fast Dasher zooms and pans for a given pointer offset; the engine accepts 0.3-2.
const STEERING_SPEEDS: DwellOption<number>[] = [
  { value: 0.3, label: 'Slowest' },
  { value: 0.4, label: 'Slower' },
  { value: 0.5, label: 'Slow' },
  { value: 0.6, label: 'Standard' },
  { value: 0.8, label: 'Quick' },
  { value: 1, label: 'Fast' },
  { value: 1.4, label: 'Faster' },
  { value: 2, label: 'Fastest' }
]

interface WorkspaceProps {
  input: InputSource
  onInput: (input: InputSource) => void
  settings: AppSettings
  onSettings: (patch: GeneralSettingsPatch) => void
  settingsError: string
}

function Workspace({
  input,
  onInput,
  settings,
  onSettings,
  settingsError
}: WorkspaceProps): React.JSX.Element {
  const state = useComposition()
  const dispatch = useCompositionDispatch()
  const interaction = useInteraction()
  const [menu, setMenu] = useState<'closed' | 'more' | 'settings'>('closed')
  const { theme, speed, edgeHeight, weighting, showGazeDot } = settings
  const predictions = usePredictions()
  const voice = useVoice()
  const [debugError, setDebugError] = useState('')
  const debugContext: DebugContext = {
    epoch: state.contextEpoch,
    revision: state.revision,
    draft: state.phrase ?? state.draft,
    initials: state.tokens.map((t) => t.value).join(' '),
    lockedMessage: state.lockedSentences.join(' '),
    conversation: state.conversation.map(({ speaker, text }) => ({ speaker, text })),
    summary: state.conversationSummary,
    pendingSummary: state.summaryPending
      .slice(-100)
      .map(({ speaker, text }) => ({ speaker, text })),
    partial: voice.partial,
    queuedTranscripts: voice.queuedTranscripts,
    listening: voice.listening,
    paused: state.paused,
    busy: interaction.busy
  }
  const debugPayload = JSON.stringify(debugContext)
  useEffect(() => {
    window.diagnostics?.context(JSON.parse(debugPayload))
  }, [debugPayload])
  const [settingsTab, setSettingsTab] = useState<'general' | 'voice' | 'gemini'>('general')
  const [gazeOverlay, setGazeOverlay] = useState<GazeOverlay>('none')
  const closeGazeOverlay = useCallback(() => setGazeOverlay('none'), [])
  // Going to a menu or to phrases pauses writing; coming back resumes it if you were writing.
  // Hovering the header or an edge cue only holds Dasher still, so writing is still running here.
  const resumeOnReturn = useRef(false)
  const leaveWriting = (): void => {
    resumeOnReturn.current ||= state.workspace === 'dasher' && !state.paused
  }
  const cancelResume = (): void => {
    resumeOnReturn.current = false
  }
  useEffect(() => {
    if (
      resumeOnReturn.current &&
      menu === 'closed' &&
      gazeOverlay === 'none' &&
      state.workspace === 'dasher'
    ) {
      resumeOnReturn.current = false
      dispatch({ type: 'resume' })
    }
  }, [menu, gazeOverlay, state.workspace, dispatch])
  useEffect(() => {
    const pause = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        resumeOnReturn.current = false
        dispatch({ type: 'pause', notice: 'Paused.' })
        setMenu('closed')
      }
    }
    window.addEventListener('keydown', pause)
    return () => window.removeEventListener('keydown', pause)
  }, [dispatch])
  const closeMenu = (): void => setMenu('closed')
  const configure = (change: () => void): void => {
    dispatch({ type: 'pause' })
    change()
  }
  return (
    <main className="workspace" data-theme={theme}>
      {settingsError && (
        <p className="settings-error" role="alert">
          {settingsError}
        </p>
      )}
      <div className="top-edge-region" data-gaze-top-cue style={{ height: edgeHeight }}>
        <ActionButton
          className="top-edge-cue"
          identity={`next-${state.workspace}-${state.mode}-${state.editor}-${state.revision}`}
          disabled={menu !== 'closed'}
          onAction={() => {
            if (state.workspace === 'dasher') {
              leaveWriting()
              dispatch({ type: 'workspace', workspace: 'phrases' })
              if (!state.request && state.phrase === null && state.mode !== 'replacement')
                predictions.request(state.mode === 'literal' ? 'completion' : 'expansion')
            } else dispatch({ type: 'workspace', workspace: 'dasher' })
          }}
        >
          <span>
            {state.workspace === 'dasher'
              ? 'Show phrases'
              : canLockSentence(state)
                ? 'Lock sentence & keep writing'
                : 'Keep writing'}
          </span>
          <span className="edge-instruction" aria-hidden="true">
            {interaction.dwell ? 'Hold here · look away to cancel' : 'Click to switch'}
          </span>
        </ActionButton>
      </div>
      <header className="app-header" aria-label="Message and controls">
        <div className="message-strip" inert={menu !== 'closed' || undefined}>
          <DraftPanel
            status={
              <span
                className={`listening-indicator${voice.listening === 'Listening to conversation' ? ' is-live' : ''}`}
                role="status"
                title={voice.listening}
                aria-label={voice.listening}
              >
                <span aria-hidden="true" className="listening-dot" />
                {voice.listening === 'Listening to conversation'
                  ? 'Listening'
                  : voice.speaking
                    ? 'Mic paused during speech'
                    : voice.listening.startsWith('Connecting')
                      ? 'Connecting mic…'
                      : 'Microphone unavailable'}
              </span>
            }
          />
          {voice.error && (
            <p className="strip-error" role="alert">
              {voice.error}
            </p>
          )}
        </div>
        {/* Speak lives in the phrase area once the message is final; Stop stays reachable from
            either workspace while speech plays. */}
        {voice.speaking && (
          <ActionButton identity="stop-speech" onAction={voice.stop}>
            Stop
          </ActionButton>
        )}
        <ActionButton
          className="header-writing"
          identity={`writing-${state.paused}-${state.editor}-${state.mode}-${state.selectedToken ?? ''}-${state.selection?.start ?? ''}`}
          disabled={
            menu !== 'closed' ||
            state.workspace !== 'dasher' ||
            (state.editor === 'keywords' && !state.selectedToken)
          }
          onAction={() => {
            cancelResume()
            dispatch({ type: state.paused ? 'resume' : 'pause' })
          }}
        >
          {state.paused ? 'Start writing' : 'Pause writing'}
        </ActionButton>
      </header>
      <div className="workspace-body" inert={menu !== 'closed' || undefined}>
        {state.workspace === 'phrases' && (
          <SpeakFasterPanel predictions={predictions} voice={voice} />
        )}
        <div className="dasher-workspace" hidden={state.workspace !== 'dasher'}>
          <DasherPanel speed={speed} weighting={weighting} />
        </div>
      </div>
      <div className="bottom-edge-region" data-gaze-bottom-cue style={{ height: edgeHeight }}>
        <ActionButton
          className="bottom-edge-cue"
          identity={`more-${menu}`}
          disabled={menu !== 'closed'}
          onAction={() => {
            leaveWriting()
            configure(() => setMenu('more'))
          }}
        >
          <span>Menu</span>
          <span className="edge-instruction" aria-hidden="true">
            {interaction.dwell ? 'Hold here · look away to cancel' : 'Click to open'}
          </span>
        </ActionButton>
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
              <h2 id="menu-title">{menu === 'settings' ? 'Settings' : 'SpeakEasy'}</h2>
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
                  disabled={!messageText(state) && !state.tokens.length}
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
                  Load example initials
                </ActionButton>
              </div>
            ) : (
              <>
                <ActionButton
                  identity="open-debug"
                  onAction={() => {
                    if (!window.diagnostics) {
                      setDebugError('Restart the desktop app to load the debug window.')
                      return
                    }
                    void window.diagnostics
                      .open(debugContext)
                      .catch(() =>
                        setDebugError(
                          'Could not open debug window. Restart the desktop app and retry.'
                        )
                      )
                  }}
                >
                  Open conversation debug window
                </ActionButton>
                <p className="settings-hint">
                  Captures context, transcriptions, and model results locally while open. Closing
                  the window deletes its trace.
                </p>
                {debugError && <p role="alert">{debugError}</p>}
                <div className="settings-tabs" role="group" aria-label="Settings tabs">
                  <ActionButton
                    identity="settings-general"
                    selected={settingsTab === 'general'}
                    onAction={() => setSettingsTab('general')}
                  >
                    General
                  </ActionButton>
                  <ActionButton
                    identity="settings-voice"
                    selected={settingsTab === 'voice'}
                    onAction={() => setSettingsTab('voice')}
                  >
                    Voice
                  </ActionButton>
                  <ActionButton
                    identity="settings-gemini"
                    selected={settingsTab === 'gemini'}
                    onAction={() => setSettingsTab('gemini')}
                  >
                    Gemini
                  </ActionButton>
                </div>
                {settingsTab === 'voice' ? (
                  <VoiceSettings voice={voice} />
                ) : settingsTab === 'gemini' ? (
                  <ConversationPanel predictions={predictions} />
                ) : (
                  <div className="settings-grid">
                    <GazeSettings
                      input={input}
                      onInput={(value) => configure(() => onInput(value))}
                      onCalibrate={() =>
                        configure(() => {
                          closeMenu()
                          setGazeOverlay('calibrate')
                        })
                      }
                      onCenter={() =>
                        configure(() => {
                          closeMenu()
                          setGazeOverlay('center')
                        })
                      }
                      showDot={showGazeDot}
                      onShowDot={(value) => onSettings({ showGazeDot: value })}
                    />
                    <label>
                      Appearance
                      <select
                        value={theme}
                        onChange={(event) =>
                          configure(() => onSettings({ theme: event.target.value as typeof theme }))
                        }
                      >
                        <option value="system">System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </label>
                    <DwellSelect
                      label="Steering speed"
                      identity="steering-speed"
                      value={speed}
                      options={STEERING_SPEEDS}
                      onChange={(value) => configure(() => onSettings({ speed: value }))}
                    />
                    <div className="settings-field">
                      <label>
                        Letter prediction
                        <select
                          value={weighting}
                          onChange={(event) =>
                            configure(() =>
                              onSettings({ weighting: event.target.value as typeof weighting })
                            )
                          }
                        >
                          <option value="ppm">PPM (trained initials)</option>
                          <option value="uniform">Uniform</option>
                        </select>
                      </label>
                      <p className="settings-hint" role="status">
                        {weighting === 'uniform'
                          ? 'Uniform letters'
                          : state.mode === 'initials'
                            ? trainedInitials.status
                            : 'Character PPM'}
                      </p>
                    </div>
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
                      Edge target size
                      <select
                        value={edgeHeight}
                        onChange={(event) =>
                          configure(() => onSettings({ edgeHeight: Number(event.target.value) }))
                        }
                      >
                        <option value={48}>Compact — 48 px</option>
                        <option value={64}>Large — 64 px</option>
                        <option value={88}>Extra large — 88 px</option>
                      </select>
                    </label>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      <GazeLayer
        input={input}
        overlay={gazeOverlay}
        onOverlayDone={closeGazeOverlay}
        showDot={showGazeDot}
      />
    </main>
  )
}

export default function App({
  initialSettings = DEFAULT_SETTINGS,
  initialSettingsError = ''
}: {
  initialSettings?: AppSettings
  initialSettingsError?: string
}): React.JSX.Element {
  const [settings, setSettings] = useState(initialSettings)
  const [settingsError, setSettingsError] = useState(initialSettingsError)
  const changeSettings = useCallback((patch: GeneralSettingsPatch) => {
    setSettings((current) => ({ ...current, ...patch }))
    if (!window.settings) {
      setSettingsError('Settings could not be saved. Open the desktop app to save preferences.')
      return
    }
    void window.settings.save(patch).then(
      () => setSettingsError(''),
      () =>
        setSettingsError(
          'Settings could not be saved. Check storage access before closing SpeakEasy.'
        )
    )
  }, [])
  const [input, setInput] = useState<InputSource>(loadInputSource)
  const changeInput = useCallback((value: InputSource) => {
    saveInputSource(value)
    setInput(value)
  }, [])
  return (
    <CompositionProvider>
      <InteractionProvider
        preferences={{
          dwell: settings.dwell,
          duration: settings.duration,
          setDwell: (value) => changeSettings({ dwell: value }),
          setDuration: (value) => changeSettings({ duration: value })
        }}
      >
        <GazeProvider active={input !== 'mouse'}>
          <Workspace
            input={input}
            onInput={changeInput}
            settings={settings}
            onSettings={changeSettings}
            settingsError={settingsError}
          />
        </GazeProvider>
      </InteractionProvider>
    </CompositionProvider>
  )
}
