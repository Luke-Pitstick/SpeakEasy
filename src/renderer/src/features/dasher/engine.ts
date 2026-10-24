// Derived from dasher-web ZoomBox, ControllerPointer, Palette, and UserInterface.
// MIT, Copyright (c) 2020 ACE Centre-North. See THIRD_PARTY_NOTICES.md.
// Modified: typed synchronous geometry, frozen branch weights, compact reversible
// ancestry, bounded tree expansion, snapshot output, no DOM or application state.
import { Geometry } from './geometry'
import { CharacterPredictor, INITIAL_ALPHABET, LITERAL_ALPHABET } from './prediction'

export interface Region {
  id: number
  label: string
  text: string
  left: number
  top: number
  height: number
  depth: number
}
interface Choice {
  label: string
  character: string
}
interface Ancestor {
  text: string
  selected: number
  fractions: number[]
  label: string
}
interface Box {
  id: number
  text: string
  label: string
  choices: Choice[]
  fractions: number[]
  children: (Box | null)[]
  top: number
  height: number
  left: number
}

function display(character: string): string {
  return character === ' ' ? '␣' : character === '\n' ? '↵' : character
}

export class DasherEngine {
  geometry: Geometry
  root: Box
  private ancestors: Ancestor[] = []
  private nextId = 0
  private predictor: CharacterPredictor
  private alphabet: string[]
  private output: string
  private sequence = 0
  private running = false
  private pointer = { x: 0, y: 0 }
  private speed = 1

  constructor(
    width: number,
    height: number,
    seed = '',
    literal = false,
    weighting: 'uniform' | 'ppm' = 'ppm',
    private maxLength = literal ? 500 : 24
  ) {
    this.geometry = new Geometry(width, height)
    this.alphabet = literal ? LITERAL_ALPHABET : INITIAL_ALPHABET
    this.predictor = new CharacterPredictor(this.alphabet, literal ? weighting : 'uniform')
    this.output = seed
    // Store the character path for reversible seeding without enormous coordinates.
    let prefix = ''
    for (const character of [...seed]) {
      if (!this.alphabet.includes(character)) {
        prefix += character
        this.ancestors = []
        continue
      }
      const box = this.makeBox(prefix, '')
      this.ancestors.push({
        text: prefix,
        selected: this.alphabet.indexOf(character),
        fractions: box.fractions,
        label: box.label
      })
      prefix += character
    }
    this.root = this.makeBox(seed, seed ? display([...seed].at(-1)!) : '')
    this.root.height = height * 0.9
    this.root.top = -this.root.height / 2
    this.layout()
  }

  private makeBox(text: string, label: string): Box {
    const choices = this.alphabet.map((character) => ({ label: display(character), character }))
    const weights = this.predictor.weights(text)
    const mass = weights
    const total = mass.reduce((a, b) => a + b, 0)
    return {
      id: this.nextId++,
      text,
      label,
      choices,
      fractions: mass.map((weight) => weight / total),
      children: choices.map(() => null),
      top: 0,
      height: 0,
      left: 0
    }
  }

  private layout(): void {
    let remaining = 420
    const visit = (box: Box, depth: number): void => {
      box.left = this.geometry.solveLeft(box.height)
      let top = box.top
      for (let i = 0; i < box.choices.length; i++) {
        const height = box.height * box.fractions[i]
        if (
          height >= 5 &&
          top < this.geometry.bottom &&
          top + height > this.geometry.top &&
          depth < 9 &&
          remaining-- > 0
        ) {
          const choice = box.choices[i]
          const child = box.children[i] ?? this.makeBox(box.text + choice.character, choice.label)
          child.top = top
          child.height = height
          box.children[i] = child
          visit(child, depth + 1)
        } else box.children[i] = null
        top += height
      }
    }
    visit(this.root, 0)
  }

  private holder(box: Box, x: number, y: number): Box | null {
    if (x < box.left || x > this.geometry.right || y < box.top || y > box.top + box.height)
      return null
    for (const child of box.children) {
      if (!child) continue
      const found = this.holder(child, x, y)
      if (found) return found
    }
    return box
  }

  setSample(x: number, y: number): void {
    this.pointer = {
      x: Math.max(this.geometry.left, Math.min(this.geometry.right, x)),
      y: Math.max(this.geometry.top, Math.min(this.geometry.bottom, y))
    }
  }
  setSpeed(speed: number): void {
    this.speed = Math.max(0.3, Math.min(2, speed))
  }
  resume(): void {
    this.running = true
    this.pointer = { x: 0, y: 0 }
  }
  pause(): void {
    this.running = false
  }

  step(elapsed: number): { text: string; sequence: number; limitReached?: boolean } | null {
    if (!this.running) return null
    if ([...this.output].length >= this.maxLength && this.pointer.x > 12) {
      this.pause()
      return { text: this.output, sequence: this.sequence++, limitReached: true }
    }
    const dt = (Math.min(32, Math.max(0, elapsed)) / 33) * this.speed
    const x = Math.abs(this.pointer.x) < 12 ? 0 : this.pointer.x
    // Zoom is proportional to horizontal displacement, so changing the
    // viewport aspect ratio cannot turn thin targets into a slow linear crawl.
    // Both directions are exact inverse scales; vertical displacement pans.
    const factor = Math.exp((x / this.geometry.width) * 0.18 * dt)
    const rootHeight = this.root.height * factor
    if (rootHeight >= this.geometry.height * 0.45 || this.ancestors.length) {
      this.root.top =
        this.pointer.y + (this.root.top - this.pointer.y) * factor - this.pointer.y * 0.2 * dt
      this.root.height = rootHeight
    }
    this.layout()
    // Restore a trimmed ancestor when reversing exposes space around the root.
    const ancestor = this.ancestors.at(-1)
    if (
      ancestor &&
      (this.root.left > this.geometry.left ||
        this.root.top > this.geometry.top ||
        this.root.top + this.root.height < this.geometry.bottom)
    ) {
      const child = this.root
      const parent = this.makeBox(ancestor.text, ancestor.label)
      parent.fractions = ancestor.fractions
      parent.height = child.height / parent.fractions[ancestor.selected]
      parent.top =
        child.top -
        parent.height * parent.fractions.slice(0, ancestor.selected).reduce((a, b) => a + b, 0)
      parent.children[ancestor.selected] = child
      this.ancestors.pop()
      this.root = parent
      this.layout()
    }
    // Promote a fully covering child, retaining only compact reversible ancestry.
    const index = this.root.children.findIndex(
      (child) =>
        child &&
        child.left <= this.geometry.left &&
        child.top <= this.geometry.top &&
        child.top + child.height >= this.geometry.bottom
    )
    if (index >= 0) {
      this.ancestors.push({
        text: this.root.text,
        selected: index,
        fractions: this.root.fractions,
        label: this.root.label
      })
      this.root = this.root.children[index]!
      this.layout()
    }
    const text = this.holder(this.root, 0, 0)?.text ?? this.ancestors.at(-1)?.text ?? ''
    if (text === this.output) return null
    this.output = text
    return { text, sequence: this.sequence++ }
  }

  regions(): Region[] {
    const result: Region[] = []
    const walk = (box: Box, depth: number): void => {
      if (box.label)
        result.push({
          id: box.id,
          label: box.label,
          text: box.text,
          left: box.left,
          top: box.top,
          height: box.height,
          depth
        })
      for (const child of box.children) if (child) walk(child, depth + 1)
    }
    walk(this.root, 0)
    return result
  }
  get text(): string {
    return this.output
  }
  get ancestorCount(): number {
    return this.ancestors.length
  }
}
