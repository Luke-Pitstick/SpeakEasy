// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureMicrophone } from '../src/renderer/src/features/voice/audio'

const { loadRnnoise, destroy } = vi.hoisted(() => ({
  loadRnnoise: vi.fn(),
  destroy: vi.fn()
}))
vi.mock('@sapphi-red/web-noise-suppressor', () => ({
  loadRnnoise,
  RnnoiseWorkletNode: class {
    connect = vi.fn()
    disconnect = vi.fn()
    destroy = destroy
  }
}))

function fixture(): {
  stop: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  addModule: ReturnType<typeof vi.fn>
  nodes: { port: { onmessage: ((event: { data: ArrayBuffer }) => void) | null } }[]
} {
  const stop = vi.fn()
  const close = vi.fn().mockResolvedValue(undefined)
  const addModule = vi.fn().mockResolvedValue(undefined)
  const nodes: { port: { onmessage: ((event: { data: ArrayBuffer }) => void) | null } }[] = []
  const track = { stop, addEventListener: vi.fn() }
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [track],
        getAudioTracks: () => [track]
      })
    }
  })
  vi.stubGlobal(
    'AudioContext',
    class {
      sampleRate = 48000
      destination = {}
      audioWorklet = { addModule }
      close = close
      resume = vi.fn().mockResolvedValue(undefined)
      createMediaStreamSource = (): { connect: ReturnType<typeof vi.fn> } => ({ connect: vi.fn() })
      createGain = (): { gain: { value: number }; connect: ReturnType<typeof vi.fn> } => ({
        gain: { value: 0 },
        connect: vi.fn()
      })
    }
  )
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { onmessage: null }
      connect = vi.fn()
      disconnect = vi.fn()
      constructor() {
        nodes.push(this)
      }
    }
  )
  loadRnnoise.mockResolvedValue(new ArrayBuffer(8))
  return { stop, close, addModule, nodes }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('filtered microphone lifecycle', () => {
  it('stops capture and disposes the denoiser once, rejecting late audio after close', async () => {
    const f = fixture()
    const audio = vi.fn()
    const controller = new AbortController()
    const microphone = await captureMicrophone('default', controller.signal, audio, vi.fn())
    expect(microphone.rate).toBe(48000)
    const late = f.nodes[0].port.onmessage!
    late({ data: new ArrayBuffer(4) })
    expect(audio).toHaveBeenCalledOnce()
    microphone.close()
    controller.abort()
    late({ data: new ArrayBuffer(4) })
    expect(audio).toHaveBeenCalledOnce()
    expect(f.stop).toHaveBeenCalledOnce()
    expect(f.close).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('releases the microphone if a denoiser asset fails to load', async () => {
    const f = fixture()
    f.addModule.mockRejectedValue(new Error('asset unavailable'))
    await expect(
      captureMicrophone('default', new AbortController().signal, vi.fn(), vi.fn())
    ).rejects.toThrow('asset unavailable')
    expect(f.stop).toHaveBeenCalledOnce()
    expect(f.close).toHaveBeenCalledOnce()
  })

  it('does not start a processor after cancellation during model loading', async () => {
    const f = fixture()
    let finish!: (binary: ArrayBuffer) => void
    loadRnnoise.mockImplementation(
      () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve
        })
    )
    const controller = new AbortController()
    const pending = captureMicrophone('default', controller.signal, vi.fn(), vi.fn())
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(loadRnnoise).toHaveBeenCalledOnce())
    controller.abort()
    finish(new ArrayBuffer(8))
    await assertion
    expect(f.nodes).toHaveLength(0)
    expect(f.stop).toHaveBeenCalledOnce()
    expect(f.close).toHaveBeenCalledOnce()
  })
})
