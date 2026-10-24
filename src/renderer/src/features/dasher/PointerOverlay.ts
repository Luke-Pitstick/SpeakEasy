const NS = 'http://www.w3.org/2000/svg'

/** Pointer feedback and letter geometry share centered panel coordinates. */
export class PointerOverlay {
  private layer = document.createElementNS(NS, 'g')
  private line = document.createElementNS(NS, 'line')
  private ring = document.createElementNS(NS, 'circle')
  private dot = document.createElementNS(NS, 'circle')
  private distance = document.createElementNS(NS, 'text')

  constructor(private svg: SVGSVGElement) {
    this.layer.setAttribute('class', 'input-pointer')
    this.line.setAttribute('class', 'pointer-vector')
    this.line.setAttribute('x1', '0')
    this.line.setAttribute('y1', '0')
    this.ring.setAttribute('class', 'pointer-ring')
    this.ring.setAttribute('r', '8')
    this.dot.setAttribute('class', 'pointer-dot')
    this.dot.setAttribute('r', '2.5')
    this.distance.setAttribute('class', 'pointer-distance')
    this.distance.setAttribute('text-anchor', 'end')
    this.layer.append(this.line, this.ring, this.dot, this.distance)
    this.svg.appendChild(this.layer)
    this.hide()
  }

  resize(width: number, height: number): void {
    this.svg.setAttribute('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
    this.distance.setAttribute('x', String(width / 2 - 16))
    this.distance.setAttribute('y', String(height / 2 - 16))
    this.hide()
  }

  update(point: { x: number; y: number }, paused: boolean): void {
    this.layer.removeAttribute('visibility')
    this.setPaused(paused)
    this.line.setAttribute('x2', String(point.x))
    this.line.setAttribute('y2', String(point.y))
    for (const circle of [this.ring, this.dot]) {
      circle.setAttribute('cx', String(point.x))
      circle.setAttribute('cy', String(point.y))
    }
    this.distance.textContent = `${Math.round(Math.hypot(point.x, point.y))} px from center`
  }

  setPaused(paused: boolean): void {
    this.layer.setAttribute('data-paused', String(paused))
  }

  hide(): void {
    this.layer.setAttribute('visibility', 'hidden')
  }
  dispose(): void {
    this.layer.remove()
  }
}
