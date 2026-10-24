export interface InputSample {
  x: number
  y: number
  timestamp: number
  valid: boolean
}

/** Screen samples use CSS pixels; SVG viewBox uses the same pixels, centered. */
export function localSample(
  sample: InputSample,
  bounds: { left: number; top: number; width: number; height: number },
  now: number
): { x: number; y: number } | null {
  if (
    !sample.valid ||
    !Number.isFinite(sample.x) ||
    !Number.isFinite(sample.y) ||
    !Number.isFinite(sample.timestamp) ||
    now - sample.timestamp > 250 ||
    sample.timestamp > now + 50 ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null
  const x = sample.x - bounds.left
  const y = sample.y - bounds.top
  return x < 0 || y < 0 || x > bounds.width || y > bounds.height
    ? null
    : { x: x - bounds.width / 2, y: y - bounds.height / 2 }
}
