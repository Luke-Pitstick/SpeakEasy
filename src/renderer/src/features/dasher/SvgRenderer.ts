import type { Region } from './engine'
import type { Geometry } from './geometry'

const NS = 'http://www.w3.org/2000/svg'

/** Owns only this SVG subtree. React owns the surrounding panel. */
export class SvgRenderer {
  private nodes = new Map<
    number,
    { group: SVGGElement; rect: SVGRectElement; label: SVGTextElement }
  >()
  private layer = document.createElementNS(NS, 'g')
  constructor(private svg: SVGSVGElement) {
    svg.appendChild(this.layer)
  }

  draw(regions: Region[], geometry: Geometry): void {
    this.svg.setAttribute(
      'viewBox',
      `${geometry.left} ${geometry.top} ${geometry.width} ${geometry.height}`
    )
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    const seen = new Set<number>()
    for (const region of regions) {
      const left = Math.max(geometry.left, region.left)
      const top = Math.max(geometry.top, region.top)
      const bottom = Math.min(geometry.bottom, region.top + region.height)
      if (left > geometry.right || bottom - top < 3) continue
      seen.add(region.id)
      let node = this.nodes.get(region.id)
      if (!node) {
        const group = document.createElementNS(NS, 'g')
        const rect = document.createElementNS(NS, 'rect')
        const label = document.createElementNS(NS, 'text')
        group.append(rect, label)
        node = { group, rect, label }
        this.nodes.set(region.id, node)
      }
      const { group, rect, label } = node
      group.setAttribute('class', `dasher-region shade-${(region.depth + (region.id % 2)) % 4}`)
      group.setAttribute('data-region', region.label)
      rect.setAttribute('x', String(left))
      rect.setAttribute('y', String(top))
      rect.setAttribute('width', String(geometry.right - left))
      rect.setAttribute('height', String(bottom - top))
      label.textContent = region.label
      label.setAttribute('x', String(left + Math.min(12, Math.max(2, region.height * 0.12))))
      label.setAttribute('y', String((top + bottom) / 2))
      label.setAttribute('dominant-baseline', 'central')
      label.setAttribute('font-size', String(Math.min(27, Math.max(9, region.height * 0.75))))
      label.setAttribute('visibility', bottom - top >= 7 ? 'visible' : 'hidden')
      this.layer.appendChild(group)
    }
    for (const [id, node] of this.nodes)
      if (!seen.has(id)) {
        node.group.remove()
        this.nodes.delete(id)
      }
  }

  dispose(): void {
    this.layer.remove()
    this.nodes.clear()
  }
}
