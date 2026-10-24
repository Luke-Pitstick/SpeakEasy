import { AUDIO_RATE } from '../../../../shared/voice'
import microphoneUrl from './microphone.worklet.js?url&no-inline'

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
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  })
  if (signal.aborted) {
    stream.getTracks().forEach((t) => t.stop())
    throw new DOMException('Cancelled', 'AbortError')
  }
  const context = new AudioContext()
  let node: AudioWorkletNode | null = null
  const close = (): void => {
    node?.disconnect()
    if (node) node.port.onmessage = null
    stream.getTracks().forEach((t) => t.stop())
    void context.close().catch(() => {})
    signal.removeEventListener('abort', close)
  }
  signal.addEventListener('abort', close, { once: true })
  try {
    await context.audioWorklet.addModule(microphoneUrl)
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    node = new AudioWorkletNode(context, 'speakeasy-microphone')
    node.port.onmessage = (event) => {
      if (!signal.aborted && event.data instanceof ArrayBuffer) onAudio(event.data)
    }
    const source = context.createMediaStreamSource(stream)
    const silent = context.createGain()
    silent.gain.value = 0
    source.connect(node)
    node.connect(silent)
    silent.connect(context.destination)
    stream
      .getAudioTracks()
      .forEach((track) => track.addEventListener('ended', onEnded, { once: true }))
    await context.resume()
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
