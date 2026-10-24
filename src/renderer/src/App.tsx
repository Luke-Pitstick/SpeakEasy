import { useCallback, useEffect, useRef, useState } from 'react'
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
}

function Workspace({ input, onInput }: WorkspaceProps): React.JSX.Element {
  const state = useComposition()
  const dispatch = useCompositionDispatch()
  const interaction = useInteraction()
  const [menu, setMenu] = useState<'closed' | 'more' | 'settings' | 'conversation'>('closed')
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [speed, setSpeed] = useState(0.6)
  const [edgeHeight, setEdgeHeight] = useState(48)
  const [weighting, setWeighting] = useState<'uniform' | 'ppm'>('ppm')
  const predictions = usePredictions()
  const [gazeOverlay, setGazeOverlay] = useState<GazeOverlay>('none')
  const [showGazeDot, setShowGazeDot] = useState(true)
  const closeGazeOverlay = useCallback(() => setGazeOverlay('none'), [])
  // Going to a menu or to phrases pauses writing; coming back resumes it if you were writing.
  // Hovering the header or top cue already pauses, so "were you writing" is captured there.
  const writingBeforeHover = useRef(false)
  const resumeOnReturn = useRef(false)
  const pauseForControls = (): void => {
    writingBeforeHover.current = state.workspace === 'dasher' && !state.paused
    dispatch({ type: 'pause' })
  }
  const leaveWriting = (): void => {
    // Hovering the top cue doesn't pause, so writing may still be running when it activates.
    resumeOnReturn.current ||=
      writingBeforeHover.current || (state.workspace === 'dasher' && !state.paused)
  }
  const cancelResume = (): void => {
    resumeOnReturn.current = false
    writingBeforeHover.current = false
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
        writingBeforeHover.current = false
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
      <div className="top-edge-region" data-gaze-top-cue style={{ height: edgeHeight }}>
        <ActionButton
          className="top-edge-cue"
          identity={`next-${state.workspace}-${state.mode}-${state.editor}`}
          disabled={menu !== 'closed'}
          onAction={() => {
            if (state.workspace === 'dasher') {
              leaveWriting()
              dispatch({ type: 'workspace', workspace: 'phrases' })
              if (!state.request && state.editor === 'entry')
                predictions.request(state.mode === 'initials' ? 'expansion' : 'completion')
            } else dispatch({ type: 'workspace', workspace: 'dasher' })
          }}
        >
          <span>{state.workspace === 'dasher' ? 'Show phrases' : 'Keep writing'}</span>
          <span className="edge-instruction" aria-hidden="true">
            {interaction.dwell ? 'Hold here · look away to cancel' : 'Click to switch'}
          </span>
        </ActionButton>
      </div>
      <header
        className="app-header"
        aria-label="Message and controls"
        onPointerEnter={pauseForControls}
      >
        <div className="message-strip" inert={menu !== 'closed' || undefined}>
          <DraftPanel />
        </div>
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
        <ActionButton
          className="header-menu"
          identity={`more-${menu}`}
          disabled={menu !== 'closed'}
          onAction={() => {
            leaveWriting()
            configure(() => setMenu('more'))
          }}
        >
          Menu
        </ActionButton>
      </header>
      <div
        className="workspace-body"
        inert={menu !== 'closed' || undefined}
        onPointerEnter={() => {
          writingBeforeHover.current = false
        }}
      >
        {state.workspace === 'phrases' && <SpeakFasterPanel predictions={predictions} />}
        <div className="dasher-workspace" hidden={state.workspace !== 'dasher'}>
          <DasherPanel speed={speed} weighting={weighting} />
        </div>
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
              <h2 id="menu-title">
                {menu === 'settings'
                  ? 'Settings'
                  : menu === 'conversation'
                    ? 'Conversation'
                    : 'SpeakEasy'}
              </h2>
              <ActionButton identity="close-menu" onAction={closeMenu}>
                Back
              </ActionButton>
            </div>
            {menu === 'conversation' ? (
              <ConversationPanel predictions={predictions} />
            ) : menu === 'more' ? (
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
                <ActionButton identity="conversation" onAction={() => setMenu('conversation')}>
                  Conversation & Gemini
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
                  onShowDot={setShowGazeDot}
                />
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
                <DwellSelect
                  label="Steering speed"
                  identity="steering-speed"
                  value={speed}
                  options={STEERING_SPEEDS}
                  onChange={(value) => configure(() => setSpeed(value))}
                />
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
                <p className="settings-note" role="status">
                  {weighting === 'uniform'
                    ? 'Uniform letters'
                    : state.mode === 'initials'
                      ? trainedInitials.status
                      : 'Character PPM'}
                </p>
                <label>
                  Top-edge target size
                  <select
                    value={edgeHeight}
                    onChange={(event) => configure(() => setEdgeHeight(Number(event.target.value)))}
                  >
                    <option value={48}>Compact — 48 px</option>
                    <option value={64}>Large — 64 px</option>
                    <option value={88}>Extra large — 88 px</option>
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
                <ActionButton identity="gemini-settings" onAction={() => setMenu('conversation')}>
                  Conversation & Gemini
                </ActionButton>
                <p className="settings-note">
                  Gemini suggests wording using your approved conversation. Speech is not connected.
                </p>
              </div>
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

export default function App(): React.JSX.Element {
  const [input, setInput] = useState<InputSource>(loadInputSource)
  const changeInput = useCallback((value: InputSource) => {
    saveInputSource(value)
    setInput(value)
  }, [])
  return (
    <CompositionProvider>
      <InteractionProvider>
        <GazeProvider active={input !== 'mouse'}>
          <Workspace input={input} onInput={changeInput} />
        </GazeProvider>
      </InteractionProvider>
    </CompositionProvider>
  )
}
