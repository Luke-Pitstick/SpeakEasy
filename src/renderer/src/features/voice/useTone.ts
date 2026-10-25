import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  emotionProposalSchema,
  type EmotionProposal,
  type ToneController
} from '../../../../shared/tone'
import type { VoiceTone } from '../../../../shared/voice'
import { useComposition } from '../../composition/state'
import { messageText } from '../../composition/model'
import { useInteraction } from '../../interaction/state'

export function useTone(defaultTone: VoiceTone, speaking: boolean): ToneController {
  const state = useComposition()
  const { busy } = useInteraction()
  const [status, setStatus] = useState({ configured: false, enabled: false })
  const [error, setError] = useState('')
  const [manual, setManual] = useState<{ text: string; tone: VoiceTone } | null>(null)
  const [pending, setPending] = useState<{
    scope: string
    proposal: EmotionProposal | null
    error: string
  } | null>(null)
  const [selected, setSelected] = useState<typeof pending>(null)
  const text = messageText(state)
  const conversation = JSON.stringify(
    state.conversation.map(({ speaker, text }) => ({ speaker, text }))
  )
  const scope = JSON.stringify([state.revision, state.contextEpoch, text, conversation])
  const overridden = manual?.text === text
  const ready =
    state.workspace === 'phrases' &&
    state.paused &&
    !speaking &&
    state.status !== 'loading' &&
    !state.selection &&
    state.mode !== 'keyword' &&
    state.mode !== 'replacement' &&
    !(state.mode === 'initials' && state.tokens.length > 0) &&
    !!text.trim() &&
    text.length <= 2000 &&
    !/[<>]/.test(text)
  const enabledRef = useRef(false)
  const currentRequest = useRef('')
  const latest = useRef(scope)
  useLayoutEffect(() => {
    latest.current = scope
  }, [scope])
  useEffect(() => {
    let live = true
    void window.tone
      ?.status()
      .then((next) => {
        if (live) {
          enabledRef.current = next.enabled
          setStatus(next)
        }
      })
      .catch(() => {
        if (live) setError('Could not load Jev settings. Manual tone selection is available.')
      })
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    const api = window.tone
    if (!api || !status.enabled || !status.configured || !ready || overridden) return
    let live = true
    const id = crypto.randomUUID()
    currentRequest.current = id
    const timer = setTimeout(() => {
      void api
        .suggest({
          id,
          revision: state.revision,
          contextEpoch: state.contextEpoch,
          text,
          conversation: JSON.parse(conversation)
        })
        .then((raw) => {
          if (!live || latest.current !== scope || !enabledRef.current) return
          const result = emotionProposalSchema.safeParse(raw)
          if (
            !result.success ||
            result.data.requestId !== id ||
            result.data.revision !== state.revision ||
            result.data.contextEpoch !== state.contextEpoch
          ) {
            setPending({
              scope,
              proposal: null,
              error: 'Invalid Jev suggestion. Choose a tone manually.'
            })
            return
          }
          setPending({ scope, proposal: result.data, error: '' })
        })
        .catch(() => {
          if (live && latest.current === scope && enabledRef.current)
            setPending({
              scope,
              proposal: null,
              error: 'Jev unavailable. Check access and connection, or choose a tone manually.'
            })
        })
    }, 300)
    return () => {
      live = false
      clearTimeout(timer)
      api.cancel(id)
      if (currentRequest.current === id) currentRequest.current = ''
    }
  }, [
    scope,
    conversation,
    text,
    state.revision,
    state.contextEpoch,
    status.enabled,
    status.configured,
    ready,
    overridden
  ])
  // A provider response can arrive during dwell. Publish only after the target is released.
  useEffect(() => {
    if (busy || !ready || overridden || !status.enabled || pending?.scope !== scope) return
    const timer = setTimeout(() => setSelected(pending), 0)
    return () => clearTimeout(timer)
  }, [busy, ready, overridden, status.enabled, pending, scope])
  const proposal = status.enabled && selected?.scope === scope ? selected.proposal : null
  const value = overridden ? manual.tone : (proposal?.tone ?? defaultTone)
  return {
    ...status,
    value,
    message:
      error ||
      (overridden
        ? 'Manual tone'
        : proposal
          ? proposal.confidence < 0.6
            ? 'Jev uncertain · neutral'
            : 'Suggested by Jev'
          : selected?.scope === scope && selected.error
            ? selected.error
            : status.enabled && status.configured && ready
              ? 'Choosing tone…'
              : 'Manual tone'),
    select: (tone) => {
      if (currentRequest.current) window.tone?.cancel(currentRequest.current)
      setManual({ text, tone })
    },
    setEnabled: (enabled) => {
      const api = window.tone
      if (!api) return
      enabledRef.current = enabled
      setStatus((current) => ({ ...current, enabled }))
      setPending(null)
      setSelected(null)
      setError('')
      if (currentRequest.current) api.cancel(currentRequest.current)
      void api
        .setEnabled(enabled)
        .then((next) => {
          if (enabledRef.current === enabled) setStatus(next)
        })
        .catch(() => {
          if (enabledRef.current === enabled) {
            enabledRef.current = false
            setStatus((current) => ({ ...current, enabled: false }))
            setError('Could not save Jev settings. Manual tone selection is available.')
          }
        })
    }
  }
}
