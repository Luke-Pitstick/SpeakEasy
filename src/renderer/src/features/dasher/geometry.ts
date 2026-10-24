// Adapted from dasher-web Limits and UserInterface's target-right gradients.
// Height controls the leading edge; every box continues to the viewport right.
export class Geometry {
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
  get left(): number {
    return -this.width / 2
  }
  get right(): number {
    return this.width / 2
  }
  get top(): number {
    return -this.height / 2
  }
  get bottom(): number {
    return this.height / 2
  }
  get solverRight(): number {
    return this.width / 3
  }
  private get gradients(): { left: number; height: number }[] {
    return [
      { left: -this.width / 3, height: this.height },
      { left: -this.width / 6, height: this.height / 2 },
      { left: this.width / 5, height: this.height * 0.05 },
      { left: this.solverRight, height: this.height * 0.01 }
    ]
  }
  solveHeight(left: number): number {
    const gradients = this.gradients
    const index = gradients.findIndex((point) => left < point.left)
    if (index < 0) return gradients.at(-1)!.height
    const a = gradients[index === 0 ? 1 : index]
    const b = gradients[index === 0 ? 0 : index - 1]
    return a.height + ((b.height - a.height) * (left - a.left)) / (b.left - a.left)
  }
  solveLeft(height: number): number {
    const gradients = this.gradients
    const index = gradients.findIndex((point) => height > point.height)
    if (index < 0) return this.solverRight
    const a = gradients[index === 0 ? 1 : index]
    const b = gradients[index === 0 ? 0 : index - 1]
    return a.left + ((b.left - a.left) * (height - a.height)) / (b.height - a.height)
  }
}
