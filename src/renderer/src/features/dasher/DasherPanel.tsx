import { useEffect, useRef } from 'react'
import { useComposition, useCompositionDispatch } from '../../composition/state'
import { entrySeed } from '../../composition/model'
import { localSample } from '../../interaction/input'
import { DasherEngine } from './engine'
import { SvgRenderer } from './SvgRenderer'
import { PointerOverlay } from './PointerOverlay'
import { fittedWidth } from './geometry'

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
  const capacity =
    state.mode === 'initials' ? 24 - (state.tokens.length - entrySeed(state).length) : 500
  const current = useRef({ seed: entrySeed(state), speed, paused: state.paused, capacity })
  useEffect(() => {
    current.current = { seed: entrySeed(state), speed, paused: state.paused, capacity }
  }, [state, speed, capacity])
  const sessionId = state.session.id
  const literal = state.mode !== 'initials'

  useEffect(() => {
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

    const resize = (): void => {
      const nextBounds = container.getBoundingClientRect()
      if (initialized && nextBounds.width === bounds.width && nextBounds.height === bounds.height) {
        bounds = nextBounds
        return
      }
      bounds = nextBounds
      pointer.resize(Math.max(1, bounds.width), Math.max(1, bounds.height))
      const seed = engine.current?.text ?? current.current.seed
      engine.current?.pause()
      engine.current = new DasherEngine(
        fittedWidth(bounds.width, bounds.height),
        Math.max(1, bounds.height),
        seed,
        literal,
        weighting,
        current.current.capacity
      )
      engine.current.setSpeed(current.current.speed)
      renderer.draw(engine.current.regions(), engine.current.geometry)
      if (initialized && !current.current.paused)
        dispatch({ type: 'pause', notice: 'Layout changed. Your text is safe; choose Resume.' })
      initialized = true
    }
    engine.current = null
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    const move = (event: PointerEvent): void => {
      point = { x: event.clientX, y: event.clientY }
      inside = true
      const sample = localSample(
        { ...point, timestamp: performance.now(), valid: true },
        bounds,
        performance.now()
      )
      if (sample) pointer.update(sample, current.current.paused)
    }
    const leave = (): void => {
      inside = false
      pointer.hide()
      engine.current?.pause()
      if (!current.current.paused)
        dispatch({
          type: 'pause',
          notice: 'Steering paused. Review your text, then choose Resume.'
        })
    }
    const blur = (): void => {
      leave()
      dispatch({
        type: 'pause',
        notice: 'Input paused after focus or tracking changed. Choose Resume when ready.'
      })
    }
    container.addEventListener('pointermove', move)
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
            dispatch({ type: 'engine', sessionId, sequence: sequence++, text: output.text })
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
      container.removeEventListener('pointermove', move)
      container.removeEventListener('pointerenter', move)
      container.removeEventListener('pointerleave', leave)
      container.removeEventListener('pointercancel', blur)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', blur)
    }
  }, [sessionId, literal, weighting, dispatch])

  useEffect(() => {
    pointerVisual.current?.setPaused(state.paused)
    engine.current?.setSpeed(speed)
    if (state.paused) engine.current?.pause()
    else engine.current?.resume()
  }, [state.paused, sessionId, speed, weighting])

  const target =
    state.mode === 'initials'
      ? 'Initials'
      : state.mode === 'keyword'
        ? 'Locked word'
        : state.mode === 'replacement'
          ? 'Selected word'
          : 'Exact spelling'
  return (
    <section className="dasher-panel" aria-label="Dasher continuous entry">
      <div className="dasher-heading">
        <span>Dasher</span>
        <span>{target}</span>
      </div>
      <div
        className={`dasher-surface ${state.paused ? 'is-paused' : ''}`}
        ref={host}
        data-testid="dasher-surface"
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
        {state.paused && <span className="pause-hint">Paused — choose Resume below</span>}
      </div>
    </section>
  )
}
