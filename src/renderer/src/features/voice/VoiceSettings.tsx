import { useState } from 'react'
import { VOICE_TONES } from '../../../../shared/voice'
import { ActionButton } from '../../interaction/controls'
import { DwellSelect } from '../../interaction/DwellSelect'
import type { VoiceController } from './useVoice'

export function VoiceSettings({ voice }: { voice: VoiceController }): React.JSX.Element {
  const [page, setPage] = useState(0)
  const shown = voice.voices.slice(page * 6, page * 6 + 6)
  const selected = voice.voices.find((v) => v.id === voice.settings.voiceId)
  return (
    <div className="voice-settings">
      <p>
        Cartesia speaks your confirmed messages and listens automatically for conversation context.
        Audio is sent to Cartesia; recordings are not saved by SpeakEasy. Conversation text stays in
        this session and is supplied to Gemini when enabled.
      </p>
      <section aria-label="Jev tone suggestions">
        <h3>Suggested delivery</h3>
        <p>
          When enabled, Jev receives your ready-to-speak message and up to eight recent conversation
          turns to suggest its tone. This is separate from Gemini generation. It sends no audio,
          camera frames, or saved memories. Review or override the tone beside Speak.
        </p>
        <ActionButton
          identity={`jev-tone-enabled-${voice.tone.enabled}`}
          selected={voice.tone.enabled}
          disabled={!voice.tone.configured && !voice.tone.enabled}
          onAction={() => voice.tone.setEnabled(!voice.tone.enabled)}
        >
          {voice.tone.enabled ? 'Turn off Jev tone suggestions' : 'Suggest tone with Jev'}
        </ActionButton>
        {!voice.tone.configured && (
          <p>Set TYPESAFE_AI_API_TOKEN in .env and restart SpeakEasy to use Jev.</p>
        )}
        <p role="status">{voice.tone.message}</p>
      </section>
      <section aria-label="Preset voice">
        <h3>
          Voice ·{' '}
          {selected?.name ??
            (voice.settings.voiceId === 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4'
              ? 'Skylar'
              : 'Selected preset')}
        </h3>
        <div className="voice-presets">
          {shown.map((v) => (
            <ActionButton
              key={v.id}
              identity={`voice-${v.id}`}
              selected={voice.settings.voiceId === v.id}
              onAction={() => voice.update({ voiceId: v.id })}
            >
              {v.name}
            </ActionButton>
          ))}
        </div>
        <div className="voice-actions">
          <ActionButton
            identity={`voices-previous-${page}`}
            disabled={page === 0}
            onAction={() => setPage((p) => p - 1)}
          >
            Previous voices
          </ActionButton>
          <ActionButton
            identity={`voices-next-${page}`}
            disabled={(page + 1) * 6 >= voice.voices.length}
            onAction={() => setPage((p) => p + 1)}
          >
            Next voices
          </ActionButton>
          <ActionButton
            identity={`voice-preview-${voice.settings.voiceId}-${voice.settings.speed}-${voice.settings.tone}`}
            disabled={!voice.configured || voice.speaking}
            onAction={() => {
              void voice.speak(
                'Hello. This is my voice in SpeakEasy. I can take my time and say what I mean.',
                0,
                'preview'
              )
            }}
          >
            Preview voice
          </ActionButton>
          <ActionButton
            identity="stop-voice-preview"
            disabled={!voice.speaking}
            onAction={voice.stop}
          >
            Stop speech
          </ActionButton>
        </div>
      </section>
      <div className="settings-grid">
        <DwellSelect
          label="Speaking speed"
          identity="voice-speed"
          value={voice.settings.speed}
          options={[0.6, 0.8, 1, 1.2, 1.5].map((value) => ({
            value,
            label: value === 1 ? 'Normal' : `${value}×`
          }))}
          onChange={(speed) => voice.update({ speed })}
        />
        <DwellSelect
          label="Playback volume"
          identity="voice-volume"
          value={voice.settings.volume}
          options={[0, 0.25, 0.5, 0.75, 1].map((value) => ({ value, label: `${value * 100}%` }))}
          onChange={(volume) => voice.update({ volume })}
        />
        <DwellSelect
          label="Delivery tone"
          identity="voice-tone"
          value={voice.settings.tone}
          options={VOICE_TONES.map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1)
          }))}
          onChange={(tone) => voice.update({ tone })}
        />
        <DwellSelect
          label="Microphone"
          identity="voice-microphone"
          value={voice.settings.microphoneId}
          options={voice.devices}
          onChange={(microphoneId) => voice.update({ microphoneId })}
        />
      </div>
      <p role="status">{voice.listening}</p>
      <p className="voice-transcript">
        {voice.partial ||
          'Speak near the microphone to check the live transcript. Finalized speech appears in Conversation.'}
      </p>
      <p>
        English speech output · Sonic 3.6 · Ink 2 transcription. Listening resumes automatically
        after playback; overlapping partner speech is not captured.
      </p>
      {voice.error && <p role="alert">{voice.error}</p>}
    </div>
  )
}
