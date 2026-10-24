// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { SpeechPlayer } from '../src/renderer/src/features/voice/audio'
function fixture(): {
  sources: { onended: null | (() => void); stop: ReturnType<typeof vi.fn> }[]
  started: ReturnType<typeof vi.fn>
  done: ReturnType<typeof vi.fn>
  player: SpeechPlayer
} {
  const sources: {
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    onended: null | (() => void)
    buffer?: unknown
  }[] = []
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }
  const context = {
    currentTime: 0,
    destination: {},
    createGain: () => gain,
    createBuffer: (_channels: number, length: number, rate: number) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length)
    }),
    createBufferSource: () => {
      const s = {
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(),
        onended: null
      }
      sources.push(s)
      return s
    }
  } as unknown as AudioContext
  const started = vi.fn(),
    done = vi.fn(),
    player = new SpeechPlayer(context, 1, started, done)
  return { sources, started, done, player }
}
describe('streaming audio lifecycle', () => {
  it('waits for playback to finish after generation and announces playback once', () => {
    const f = fixture(),
      bytes = new Uint8Array(new Float32Array([0.2, 0.4]).buffer)
    f.player.push(bytes.subarray(0, 3))
    expect(f.sources).toHaveLength(0)
    f.player.push(bytes.subarray(3))
    f.player.push(bytes)
    expect(f.started).toHaveBeenCalledTimes(1)
    f.player.done()
    expect(f.done).not.toHaveBeenCalled()
    f.sources[0].onended!()
    expect(f.done).not.toHaveBeenCalled()
    f.sources[1].onended!()
    expect(f.done).toHaveBeenCalledTimes(1)
  })
  it('stops queued audio immediately and ignores late chunks/completion', () => {
    const f = fixture(),
      bytes = new Uint8Array(new Float32Array([0.2]).buffer)
    f.player.push(bytes)
    const late = f.sources[0].onended!
    f.player.stop()
    f.player.push(bytes)
    f.player.done()
    late()
    expect(f.sources[0].stop).toHaveBeenCalledOnce()
    expect(f.sources).toHaveLength(1)
    expect(f.done).not.toHaveBeenCalled()
  })
})
