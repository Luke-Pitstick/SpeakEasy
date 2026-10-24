import { useLayoutEffect, useRef } from 'react'
import { useComposition, useCompositionDispatch } from '../../composition/state'
import { entryContext, entrySeed } from '../../composition/model'
import { localSample } from '../../interaction/input'
import { DasherEngine } from './engine'
import { SvgRenderer } from './SvgRenderer'
import { PointerOverlay } from './PointerOverlay'

export function DasherPanel({
  speed,
  weighting
}: {
  speed: number
  weighting: 'uniform' | 'ppm'
}): React.JSX.Element {
  const state = useComposition()
  const dispatch = useCompositionDispatch()
  const svg = useRef<SVGSVGElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const pointerSvg = useRef<SVGSVGElement>(null)
  const pointerVisual = useRef<PointerOverlay | null>(null)
  const engine = useRef<DasherEngine | null>(null)
  const synchronizeSeed = useRef<(() => void) | null>(null)
  const capacity =
    state.mode === 'initials' ? 24 - (state.tokens.length - entrySeed(state).length) : 500
  const current = useRef({
    seed: entrySeed(state),
    context: entryContext(state),
    speed,
    paused: state.paused,
    capacity,
    sessionId: state.session.id
  })
  useLayoutEffect(() => {
    current.current = {
      seed: entrySeed(state),
      context: entryContext(state),
      speed,
      paused: state.paused,
      capacity,
      sessionId: state.session.id
    }
  }, [state, speed, capacity])
  const sessionId = state.session.id
  const literal = state.mode !== 'initials'

  useLayoutEffect(() => {
    if (!svg.current || !host.current || !pointerSvg.current) return
    const element = svg.current
    const container = host.current
    const renderer = new SvgRenderer(element)
    const pointer = new PointerOverlay(pointerSvg.current)
    pointerVisual.current = pointer
    let frame = 0
    let last = performance.now()
    let sequence = 0
    let bounds = container.getBoundingClientRect()
    let initialized = false
    let inside = false
    let point = { x: 0, y: 0 }
    let seededContext = current.current.context

    const resize = (): void => {
      const nextBounds = container.getBoundingClientRect()
      // Hidden workspaces must not resize away the preserved navigation position.
      if (!nextBounds.width || !nextBounds.height) return
      if (initialized && nextBounds.width === bounds.width && nextBounds.height === bounds.height) {
        bounds = nextBounds
        return
      }
      bounds = nextBounds
      pointer.resize(Math.max(1, bounds.width), Math.max(1, bounds.height))
      pointer.hide()
      if (engine.current)
        engine.current.resize(Math.max(1, bounds.width), Math.max(1, bounds.height))
      else
        engine.current = new DasherEngine(
          Math.max(1, bounds.width),
          Math.max(1, bounds.height),
          current.current.seed,
          literal,
          weighting,
          current.current.capacity,
          current.current.context
        )
      seededContext = current.current.context
      engine.current.setSpeed(current.current.speed)
      renderer.draw(engine.current.regions(), engine.current.geometry)
      // A layout change holds steering for a frame (the engine resets its pointer) rather
      // than pausing: the next tick re-reads the pointer against the new bounds.
      if (!current.current.paused) engine.current.resume()
      initialized = true
    }
    engine.current = null
    resize()
    synchronizeSeed.current = () => {
      if (
        engine.current?.text !== current.current.seed ||
        seededContext !== current.current.context
      ) {
        engine.current?.pause()
        engine.current = null
        initialized = false
      }
      // An explicit resume can collapse phrase choices. Fit that layout before
      // starting the engine.
      resize()
    }
    const observer = new ResizeObserver(() => resize())
    observer.observe(container)
    const move = (event: { clientX: number; clientY: number }): void => {
      point = { x: event.clientX, y: event.clientY }
      const sample = localSample(
        { ...point, timestamp: performance.now(), valid: true },
        bounds,
        performance.now()
      )
      inside = sample !== null
      if (sample) pointer.update(sample, current.current.paused)
    }
    const click = (event: MouseEvent): void => {
      if (event.button !== 0) return
      // A click is a fresh input sample even if no pointer-enter/move event
      // preceded it (or a resize invalidated the previous sample).
      if (event.detail || event.clientX || event.clientY) move(event)
      dispatch({ type: current.current.paused ? 'resume' : 'pause' })
    }
    // Holding stops steering without pausing: nothing moves or is typed until the pointer
    // is back on the surface, and then writing continues at once.
    const hold = (): void => {
      inside = false
      pointer.hide()
    }
    // Leaving the window (no element entered) keeps steering from the last position, which is
    // still inside the panel: looking or pointing off-screen shouldn't stop writing. Moving onto
    // other UI, such as the top-edge switch or the header controls, holds. Activating a control
    // that takes you away (the switch, the menu) pauses, and coming back resumes.
    const pointerLeave = (event: PointerEvent): void => {
      if (inside && event.relatedTarget === null) return
      hold()
    }
    const blur = (): void => {
      hold()
      dispatch({
        type: 'pause',
        notice: 'Input paused after focus or tracking changed. Look at the crosshair to continue.'
      })
    }
    // While paused, resting near the crosshair resumes, so you don't have to click. It arms only
    // once the pointer has been away from the center since the pause, so a pause made (or
    // tracking lost) at the center isn't undone immediately.
    let wasPaused = current.current.paused
    let centerArmed = false
    let centerSince: number | null = null
    const resumeAtCenter = (now: number): void => {
      const sample = localSample({ ...point, timestamp: now, valid: true }, bounds, now)
      const radius = Math.max(40, Math.min(bounds.width, bounds.height) * 0.1)
      if (!sample || Math.hypot(sample.x, sample.y) > radius) {
        centerArmed = true
        centerSince = null
      } else if (centerArmed) {
        centerSince ??= now
        if (now - centerSince >= 500) {
          centerArmed = false
          centerSince = null
          dispatch({ type: 'resume' })
        }
      }
    }
    container.addEventListener('pointermove', move)
    container.addEventListener('click', click)
    container.addEventListener('pointerenter', move)
    container.addEventListener('pointerleave', pointerLeave)
    container.addEventListener('pointercancel', blur)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', blur)
    const tick = (now: number): void => {
      const active = engine.current
      if (current.current.paused && !wasPaused) {
        centerArmed = false
        centerSince = null
      }
      wasPaused = current.current.paused
      if (active && current.current.paused && inside) resumeAtCenter(now)
      if (active && !current.current.paused && inside) {
        // A stationary mouse remains a valid sample; future tracker adapters supply their own timestamps.
        const sample = localSample(
          { ...point, timestamp: now, valid: document.visibilityState === 'visible' },
          bounds,
          now
        )
        // Off the (possibly resized) surface: hold. A hidden window pauses via visibilitychange.
        if (!sample) hold()
        else {
          active.setSample(sample.x, sample.y)
          pointer.update(sample, false)
          const output = active.step(now - last)
          if (output?.limitReached) dispatch({ type: 'limit' })
          if (output)
            dispatch({
              type: 'engine',
              sessionId: current.current.sessionId,
              sequence: sequence++,
              text: output.text
            })
          renderer.draw(active.regions(), active.geometry)
        }
      }
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.dispose()
      pointer.dispose()
      pointerVisual.current = null
      engine.current?.pause()
      engine.current = null
      synchronizeSeed.current = null
      container.removeEventListener('pointermove', move)
      container.removeEventListener('click', click)
      container.removeEventListener('pointerenter', move)
      container.removeEventListener('pointerleave', pointerLeave)
      container.removeEventListener('pointercancel', blur)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', blur)
    }
  }, [literal, weighting, capacity, dispatch])

  useLayoutEffect(() => {
    synchronizeSeed.current?.()
    pointerVisual.current?.setPaused(state.paused)
    engine.current?.setSpeed(speed)
    if (state.paused) engine.current?.pause()
    else engine.current?.resume()
  }, [state.paused, sessionId, speed, weighting, capacity])

  return (
    <section className="dasher-panel" aria-label="Dasher continuous entry">
      <div
        className={`dasher-surface ${state.paused ? 'is-paused' : ''}`}
        ref={host}
        data-testid="dasher-surface"
        // Continuous steering: gaze aim assist must never pull the pointer while it's here.
        data-gaze-surface
        role="button"
        tabIndex={0}
        aria-label={state.paused ? 'Resume Dasher' : 'Pause Dasher'}
        aria-pressed={!state.paused}
        onKeyDown={(event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return
          event.preventDefault()
          if (!event.repeat) dispatch({ type: state.paused ? 'resume' : 'pause' })
        }}
      >
        <svg
          ref={svg}
          className="dasher-svg"
          aria-label="Steer toward letters on the right; move left to reverse"
          role="img"
        />
        <div className="crosshair" aria-hidden="true">
          <span />
        </div>
        <svg ref={pointerSvg} className="pointer-overlay" aria-hidden="true" />
        <span className="pause-hint">
          {state.paused ? 'Look at the crosshair or click to resume' : 'Click anywhere to pause'}
        </span>
      </div>
    </section>
  )
}
