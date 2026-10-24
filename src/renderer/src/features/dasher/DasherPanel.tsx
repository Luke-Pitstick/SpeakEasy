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

    const resize = (continuing = false): void => {
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
      inside = continuing && inside
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
      if (initialized && !current.current.paused && !continuing)
        dispatch({
          type: 'pause',
          notice: 'Layout changed. Your text is safe; click anywhere in Dasher to continue.'
        })
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
      // starting the engine; later external resizes still require another click.
      resize(!current.current.paused)
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
    const leave = (): void => {
      inside = false
      pointer.hide()
      engine.current?.pause()
      if (!current.current.paused)
        dispatch({
          type: 'pause',
          notice: 'Steering paused. Click anywhere in Dasher to continue.'
        })
    }
    const blur = (): void => {
      leave()
      dispatch({
        type: 'pause',
        notice: 'Input paused after focus or tracking changed. Click anywhere in Dasher when ready.'
      })
    }
    container.addEventListener('pointermove', move)
    container.addEventListener('click', click)
    container.addEventListener('pointerenter', move)
    container.addEventListener('pointerleave', leave)
    container.addEventListener('pointercancel', blur)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', blur)
    const tick = (now: number): void => {
      const active = engine.current
      if (active && !current.current.paused && inside) {
        // A stationary mouse remains a valid sample; future tracker adapters supply their own timestamps.
        const sample = localSample(
          { ...point, timestamp: now, valid: document.visibilityState === 'visible' },
          bounds,
          now
        )
        if (!sample) blur()
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
      container.removeEventListener('pointerleave', leave)
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
          {state.paused ? 'Click anywhere to resume' : 'Click anywhere to pause'}
        </span>
      </div>
    </section>
  )
}
