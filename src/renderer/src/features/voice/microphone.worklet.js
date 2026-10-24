/* global AudioWorkletProcessor, sampleRate, registerProcessor */
/* eslint @typescript-eslint/explicit-function-return-type: "off" -- Standalone audio-thread JavaScript. */
// Runs on the audio thread; sends 100 ms mono PCM blocks, never records to disk.
class MicrophoneProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = new Float32Array(Math.round(sampleRate / 10))
    this.offset = 0
    // Pinned RNNoise wrapper: 512 samples buffering + 480 samples model latency.
    // Align the original signal before mixing to avoid echoes/comb filtering.
    this.original = new Float32Array(992)
    this.originalOffset = 0
  }
  process(inputs) {
    const channels = inputs[1]
    if (!channels?.length) return true
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0
      for (const channel of channels) sample += channel[i] / channels.length
      const original = this.original[this.originalOffset]
      this.original[this.originalOffset] = sample
      this.originalOffset = (this.originalOffset + 1) % this.original.length
      // No gate or VAD cutoff: retain quiet speech even if the model removes it.
      const filtered = inputs[0]?.[0]?.[i] ?? 0
      this.samples[this.offset++] = 0.75 * filtered + 0.25 * original
      if (this.offset === this.samples.length) {
        this.port.postMessage(this.samples.buffer, [this.samples.buffer])
        this.samples = new Float32Array(Math.round(sampleRate / 10))
        this.offset = 0
      }
    }
    return true
  }
}
registerProcessor('speakeasy-microphone', MicrophoneProcessor)
