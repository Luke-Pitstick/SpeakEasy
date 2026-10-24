// Dasher's square-region projection. Display coordinates stay in CSS pixels;
// fitting the engine width to height prevents stretching on ultrawide windows.
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
  solveHeight(left: number): number {
    return Math.max(0, this.right - left)
  }
  solveLeft(height: number): number {
    return this.right - height
  }
}

export function fittedWidth(width: number, height: number): number {
  return Math.max(1, Math.min(width, height * 1.5))
}
