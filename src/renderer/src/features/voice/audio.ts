import { AUDIO_RATE } from '../../../../shared/voice'
import microphoneUrl from './microphone.worklet.js?url&no-inline'
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url&no-inline'
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url&no-inline'
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url&no-inline'

export interface Microphone {
  rate: number
  close(): void
}
export async function captureMicrophone(
  deviceId: string,
  signal: AbortSignal,
  onAudio: (buffer: ArrayBuffer) => void,
  onEnded: () => void
): Promise<Microphone> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId === 'default' ? undefined : { exact: deviceId },
      echoCancellation: true,
      // RNNoise handles suppression; stacking denoisers can erase soft consonants.
      noiseSuppression: false,
      autoGainControl: true
    },
    video: false
  })
  if (signal.aborted) {
    stream.getTracks().forEach((t) => t.stop())
    throw new DOMException('Cancelled', 'AbortError')
  }
  let context: AudioContext | null = null
  let node: AudioWorkletNode | null = null
  let denoiser: (AudioWorkletNode & { destroy(): void }) | null = null
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    node?.disconnect()
    if (node) node.port.onmessage = null
    denoiser?.destroy()
    denoiser?.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    void context?.close().catch(() => {})
    signal.removeEventListener('abort', close)
  }
  signal.addEventListener('abort', close, { once: true })
  try {
    // RNNoise requires 48 kHz. Web Audio resamples the selected device for us.
    context = new AudioContext({ sampleRate: 48000 })
    const { loadRnnoise, RnnoiseWorkletNode } = await import('@sapphi-red/web-noise-suppressor')
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    const [wasmBinary] = await Promise.all([
      loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }, { signal }),
      context.audioWorklet.addModule(rnnoiseWorkletUrl),
      context.audioWorklet.addModule(microphoneUrl)
    ])
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    denoiser = new RnnoiseWorkletNode(context, { wasmBinary, maxChannels: 1 })
    denoiser.channelCount = 1
    denoiser.channelCountMode = 'explicit'
    node = new AudioWorkletNode(context, 'speakeasy-microphone', {
      numberOfInputs: 2,
      channelCount: 1,
      channelCountMode: 'explicit'
    })
    const failed = (): void => {
      if (closed) return
      close()
      onEnded()
    }
    denoiser.onprocessorerror = failed
    node.onprocessorerror = failed
    node.port.onmessage = (event) => {
      if (!closed && event.data instanceof ArrayBuffer) onAudio(event.data)
    }
    const source = context.createMediaStreamSource(stream)
    const silent = context.createGain()
    silent.gain.value = 0
    source.connect(denoiser)
    denoiser.connect(node, 0, 0)
    source.connect(node, 0, 1)
    node.connect(silent)
    silent.connect(context.destination)
    stream
      .getAudioTracks()
      .forEach((track) => track.addEventListener('ended', failed, { once: true }))
    await context.resume()
    if (closed) throw new DOMException('Cancelled', 'AbortError')
    return { rate: context.sampleRate, close }
  } catch (error) {
    close()
    throw error
  }
}

/** One utterance per player. Stop invalidates every scheduled source and late chunk. */
export class SpeechPlayer {
  private sources = new Set<AudioBufferSourceNode>()
  private next = 0
  private generated = false
  private stopped = false
  private started = false
  private carry = new Uint8Array(0)
  private gain: GainNode
  constructor(
    private context: AudioContext,
    volume: number,
    private onStarted: () => void,
    private onDone: () => void
  ) {
    this.gain = context.createGain()
    this.gain.gain.value = volume
    this.gain.connect(context.destination)
  }
  push(bytes: Uint8Array): void {
    if (this.stopped) return
    const combined = new Uint8Array(this.carry.length + bytes.length)
    combined.set(this.carry)
    combined.set(bytes, this.carry.length)
    const length = combined.length - (combined.length % 4)
    this.carry = combined.slice(length)
    if (!length) return
    const view = new DataView(combined.buffer, 0, length)
    const buffer = this.context.createBuffer(1, length / 4, AUDIO_RATE)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = view.getFloat32(i * 4, true)
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.gain)
    this.sources.add(source)
    source.onended = () => {
      this.sources.delete(source)
      source.disconnect()
      if (!this.stopped && this.generated && !this.sources.size) this.finish()
    }
    this.next = Math.max(this.context.currentTime, this.next)
    source.start(this.next)
    this.next += buffer.duration
    if (!this.started) {
      this.started = true
      this.onStarted()
    }
  }
  done(): void {
    if (!this.stopped) {
      this.generated = true
      if (!this.sources.size) this.finish()
    }
  }
  private finish(): void {
    if (this.stopped) return
    this.stopped = true
    this.gain.disconnect()
    this.onDone()
  }
  stop(): void {
    this.stopped = true
    for (const source of this.sources) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    this.sources.clear()
    this.gain.disconnect()
  }
}
