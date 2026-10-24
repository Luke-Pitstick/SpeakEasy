import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

interface Processor {
  processor?: unknown
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
  destroy?(): void
}

function loadProcessor(source: string): {
  create: (options?: unknown) => Processor
  chunks: Float32Array[]
} {
  let Constructor: new (options?: unknown) => Processor
  const chunks: Float32Array[] = []
  runInNewContext(source.replaceAll('import.meta.url', JSON.stringify('file:///rnnoise.js')), {
    AudioWorkletProcessor: class {
      port = {
        addEventListener: () => {},
        postMessage: (buffer: ArrayBuffer) => chunks.push(new Float32Array(buffer))
      }
    },
    registerProcessor: (_name: string, implementation: typeof Constructor) => {
      Constructor = implementation
    },
    sampleRate: 48000,
    WebAssembly,
    Float32Array,
    Uint8Array,
    ArrayBuffer,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout
  })
  return { create: (options) => new Constructor(options), chunks }
}

describe('microphone noise filtering', () => {
  it('retains a quiet utterance, including its onset, when the denoiser rejects it entirely', () => {
    const f = loadProcessor(
      readFileSync('src/renderer/src/features/voice/microphone.worklet.js', 'utf8')
    )
    const processor = f.create()
    const original = Float32Array.from({ length: 9600 }, (_, i) =>
      i < 3000 ? 0.001 * Math.sin(i * 0.1) : 0
    )
    for (let i = 0; i < original.length; i += 128) {
      processor.process([[new Float32Array(128)], [original.slice(i, i + 128)]], [])
    }
    const output = Float32Array.from(f.chunks.flatMap((chunk) => [...chunk]))
    expect(f.chunks.every((chunk) => chunk.length === 4800)).toBe(true)
    for (let i = 0; i < 3000; i++) {
      expect(output[i + 992]).toBeCloseTo(original[i] * 0.25, 9)
    }
  })

  it.each(['broadband', 'rumble'])(
    'runs actual RNNoise on %s noise with aligned mixing',
    async (kind) => {
      const base = 'node_modules/@sapphi-red/web-noise-suppressor/dist/'
      const f = loadProcessor(readFileSync(base + 'rnnoise/workletProcessor.js', 'utf8'))
      const wasm = readFileSync(base + 'rnnoise.wasm')
      const processor = f.create({
        processorOptions: {
          maxChannels: 1,
          wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)
        }
      })
      await expect.poll(() => Boolean(processor.processor)).toBe(true)
      let seed = 42
      let lowPass = 0
      const input = Float32Array.from({ length: 144000 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const white = (seed / 2 ** 32 - 0.5) * 0.04
        lowPass += 0.03 * (white - lowPass)
        return kind === 'rumble' ? lowPass : white
      })
      const output = new Float32Array(input.length)
      for (let i = 0; i + 128 <= input.length; i += 128) {
        const block = new Float32Array(128)
        processor.process([[input.slice(i, i + 128)]], [[block]])
        output.set(block, i)
      }
      let peakLag = 0
      let peak = -Infinity
      for (let lag = 0; lag < 1500; lag++) {
        let correlation = 0
        for (let i = 8000; i < 24000; i++) correlation += output[i] * input[i - lag]
        if (correlation > peak) {
          peak = correlation
          peakLag = lag
        }
      }
      expect(peakLag).toBe(992)
      let rawEnergy = 0
      let mixedEnergy = 0
      for (let i = 96000; i < 143000; i++) {
        rawEnergy += input[i - 992] ** 2
        mixedEnergy += (0.75 * output[i] + 0.25 * input[i - 992]) ** 2
      }
      // Broadband white noise is only modestly reduced by this model; do not claim
      // the stronger rumble result for every noise source.
      expect(mixedEnergy / rawEnergy).toBeLessThan(kind === 'rumble' ? 0.5 : 0.9)
      processor.destroy?.()
    }
  )
})
