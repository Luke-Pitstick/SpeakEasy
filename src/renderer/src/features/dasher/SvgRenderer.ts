import type { Region } from './engine'
import type { Geometry } from './geometry'

const NS = 'http://www.w3.org/2000/svg'

/** Owns only this SVG subtree. React owns the surrounding panel. */
export class SvgRenderer {
  private nodes = new Map<
    number,
    { group: SVGGElement; rect: SVGRectElement; label: SVGTextElement; labelGroup: SVGGElement }
  >()
  private layer = document.createElementNS(NS, 'g')
  private labels = document.createElementNS(NS, 'g')
  constructor(private svg: SVGSVGElement) {
    svg.append(this.layer, this.labels)
  }

  draw(regions: Region[], geometry: Geometry): void {
    this.svg.setAttribute(
      'viewBox',
      `${geometry.left} ${geometry.top} ${geometry.width} ${geometry.height}`
    )
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    const seen = new Set<number>()
    const textEdges: number[] = []
    for (const region of regions) {
      const left = Math.max(geometry.left, region.left)
      const top = Math.max(geometry.top, region.top)
      const bottom = Math.min(geometry.bottom, region.top + region.height)
      if (left > geometry.right || bottom - top < 2) continue
      seen.add(region.id)
      let node = this.nodes.get(region.id)
      if (!node) {
        const group = document.createElementNS(NS, 'g')
        const rect = document.createElementNS(NS, 'rect')
        const label = document.createElementNS(NS, 'text')
        const labelGroup = document.createElementNS(NS, 'g')
        group.append(rect)
        labelGroup.append(label)
        node = { group, rect, label, labelGroup }
        this.nodes.set(region.id, node)
      }
      const { group, rect, label, labelGroup } = node
      group.setAttribute(
        'class',
        `dasher-region shade-${(region.text.length + region.label.codePointAt(0)!) % 4}`
      )
      labelGroup.setAttribute('class', 'dasher-region')
      group.setAttribute('data-region', region.label)
      rect.setAttribute('x', String(left))
      rect.setAttribute('y', String(top))
      rect.setAttribute('width', String(geometry.right - left))
      rect.setAttribute('height', String(bottom - top))
      label.textContent = region.label
      const fontSize = Math.min(27, Math.max(9, region.height * 0.75))
      const parentEdge =
        region.depth > 0 ? (textEdges[region.depth - 1] ?? geometry.left) : geometry.left
      const textLeft = Math.max(left + 5, parentEdge)
      textEdges[region.depth] = textLeft + fontSize * 0.7 + 5
      label.setAttribute('x', String(textLeft))
      label.setAttribute('y', String((top + bottom) / 2))
      label.setAttribute('dominant-baseline', 'central')
      label.setAttribute('font-size', String(fontSize))
      label.setAttribute('visibility', bottom - top >= 7 ? 'visible' : 'hidden')
      this.layer.appendChild(group)
      this.labels.appendChild(labelGroup)
    }
    for (const [id, node] of this.nodes)
      if (!seen.has(id)) {
        node.group.remove()
        node.labelGroup.remove()
        this.nodes.delete(id)
      }
  }

  dispose(): void {
    this.layer.remove()
    this.labels.remove()
    this.nodes.clear()
  }
}
