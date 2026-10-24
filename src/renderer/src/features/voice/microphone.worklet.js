/* global AudioWorkletProcessor, sampleRate, registerProcessor */
/* eslint @typescript-eslint/explicit-function-return-type: "off" -- Standalone audio-thread JavaScript. */
// Runs on the audio thread; sends 100 ms mono PCM blocks, never records to disk.
class MicrophoneProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = new Float32Array(Math.round(sampleRate / 10))
    this.offset = 0
  }
  process(inputs) {
    const channels = inputs[0]
    if (!channels?.length) return true
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0
      for (const channel of channels) sample += channel[i] / channels.length
      this.samples[this.offset++] = sample
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
