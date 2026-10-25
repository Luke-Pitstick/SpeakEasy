import { wordInitials } from '../../../shared/initialsPpm'
import { boundConversationHistory } from '../../../shared/conversationHistory'
import { lexicalWords } from '../../../shared/predictionValidation'
import { validCorrection, type MemoryOperation } from '../../../shared/memory'
import type { PreferenceOperation } from '../../../shared/preferences'
import type {
  ConversationTurn,
  AbbreviationToken,
  PhraseCandidate,
  PredictionRequest,
  PredictionPurpose,
  PredictionResult,
  TextRange
} from '../../../shared/prediction'

export type EntryMode = 'initials' | 'literal' | 'keyword' | 'replacement'
export interface Content {
  lockedSentences: string[]
  savedSentences: string[]
  phraseInitials: string
  correctionOrigin: string | null
  learnedCorrections: string[]
  draft: string
  phrase: string | null
  editor: 'entry' | 'keywords' | 'phrase'
  tokens: AbbreviationToken[]
  mode: EntryMode
  buffer: string
  selectedToken: string | null
  selection: TextRange | null
}
export interface EntrySession {
  id: number
  sequence: number
  seed: string
  before: Content
}
export interface CompositionState extends Content {
  sentenceEvents: { sequence: number; operation: PreferenceOperation }[]
  memoryEvents: { sequence: number; operation: MemoryOperation }[]
  memoryNotice: string
  conversation: ConversationTurn[]
  conversationArchive: ConversationTurn[]
  contextEpoch: number
  cloudEnabled: boolean
  workspace: 'dasher' | 'phrases'
  revision: number
  session: EntrySession
  paused: boolean
  history: Content[]
  branches: Content[]
  request: PredictionRequest | null
  candidates: PhraseCandidate[]
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  notice: string
  validationError: string | null
}

export function contentOf(state: Content): Content {
  return {
    lockedSentences: [...state.lockedSentences],
    savedSentences: [...state.savedSentences],
    phraseInitials: state.phraseInitials,
    correctionOrigin: state.correctionOrigin,
    learnedCorrections: [...state.learnedCorrections],
    draft: state.draft,
    phrase: state.phrase,
    editor: state.editor,
    tokens: state.tokens.map((token) => ({ ...token })),
    mode: state.mode,
    buffer: state.buffer,
    selectedToken: state.selectedToken,
    selection: state.selection ? { ...state.selection } : null
  }
}

export function entryText(state: Content): string {
  if (state.mode === 'literal') return state.phrase ?? state.draft
  if (state.mode === 'keyword' || state.mode === 'replacement') return state.buffer
  return state.tokens
    .map((token) =>
      token.kind === 'word'
        ? `{${token.value}}`
        : token.kind === 'prefix'
          ? `{${token.value}…}`
          : token.value
    )
    .join('')
}

export function messageText(state: Content): string {
  return [...state.lockedSentences, state.phrase ?? state.draft].filter(Boolean).join(' ')
}

export function canLockSentence(state: Content): boolean {
  return state.mode === 'literal' && !state.selection && !!(state.phrase ?? state.draft).trim()
}

export function initialState(): CompositionState {
  const content: Content = {
    lockedSentences: [],
    savedSentences: [],
    phraseInitials: '',
    correctionOrigin: null,
    learnedCorrections: [],
    draft: '',
    phrase: null,
    editor: 'entry',
    tokens: [],
    mode: 'initials',
    buffer: '',
    selectedToken: null,
    selection: null
  }
  return {
    ...content,
    memoryEvents: [],
    sentenceEvents: [],
    memoryNotice: '',
    conversation: [],
    conversationArchive: [],
    contextEpoch: 0,
    cloudEnabled: false,
    workspace: 'dasher',
    revision: 0,
    session: { id: 0, sequence: -1, seed: '', before: contentOf(content) },
    paused: true,
    history: [],
    branches: [],
    request: null,
    candidates: [],
    status: 'idle',
    validationError: null,
    notice: 'Enter initials, then expand with Gemini. Add context in Conversation.'
  }
}

export type Action =
  | { type: 'lock-sentence' }
  | { type: 'memory-changed' }
  | { type: 'memory-notice'; text: string }
  | { type: 'cloud'; enabled: boolean }
  | { type: 'conversation-add'; speaker: 'me' | 'partner'; text: string }
  | { type: 'conversation-edit'; id: string; text: string }
  | { type: 'conversation-remove'; id: string }
  | { type: 'conversation-clear' }
  | { type: 'history-reset' }
  | { type: 'workspace'; workspace: 'dasher' | 'phrases' }
  | { type: 'open-keywords' }
  | { type: 'keep-entering' }
  | { type: 'edit-candidate'; id: string }
  | { type: 'edit-draft' }
  | { type: 'use-phrase' }
  | { type: 'input'; text: string }
  | { type: 'engine'; sessionId: number; sequence: number; text: string }
  | { type: 'mode'; mode: 'initials' | 'literal' }
  | { type: 'pause'; notice?: string }
  | { type: 'resume' }
  | { type: 'backspace' }
  | { type: 'use-initial' }
  | { type: 'use-prefix' }
  | { type: 'limit' }
  | { type: 'undo' }
  | { type: 'back' }
  | { type: 'clear' }
  | { type: 'speech-completed'; text: string; revision: number }
  | { type: 'example'; initials: string }
  | { type: 'select-token'; id: string }
  | { type: 'select-span'; range: TextRange }
  | { type: 'spell' }
  | { type: 'done' }
  | { type: 'cancel-edit' }
  | { type: 'predict'; purpose: PredictionPurpose; id: string }
  | { type: 'request'; request: PredictionRequest }
  | { type: 'result'; result: PredictionResult }
  | { type: 'accept'; id: string }
  | { type: 'dismiss' }

export function initials(text: string): AbbreviationToken[] {
  return [
    ...text
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .slice(0, 24)
  ].map((value, i) => ({ id: `initial-${i}`, kind: 'initial', value }))
}

function invalidate(state: CompositionState): CompositionState {
  return { ...state, request: null, candidates: [], status: 'idle' }
}

function edit(state: CompositionState, changes: Partial<Content>, save = true): CompositionState {
  const next = {
    ...invalidate(state),
    validationError: null,
    ...changes,
    revision: state.revision + 1,
    paused: true
  }
  return {
    ...next,
    history: save ? [...state.history, contentOf(state)].slice(-60) : state.history,
    session: {
      id: state.session.id + 1,
      sequence: -1,
      seed: entrySeed(next),
      before: contentOf(next)
    }
  }
}

/** Locked tokens precede the editable trailing run and are never parsed from engine text. */
export function entrySeed(state: Content): string {
  if (state.mode !== 'initials') return entryText(state)
  const lastWord = state.tokens.findLastIndex((token) => token.kind !== 'initial')
  return state.tokens
    .slice(lastWord + 1)
    .map((token) => token.value)
    .join('')
}

/** Initials before the editable suffix condition prediction, never engine output. */
export function entryContext(state: Content): string {
  if (state.mode !== 'initials') return ''
  const lockedCount = state.tokens.length - entrySeed(state).length
  let context = ''
  for (const token of state.tokens.slice(0, lockedCount)) {
    if (token.kind === 'initial') context += token.value
    else {
      const { segments, barriers } = wordInitials(token.value)
      context = barriers || !segments.length ? '' : context + segments[0][0]
    }
  }
  return context
}

function applyInput(state: CompositionState, text: string): Partial<Content> {
  const bounded = [...text].slice(0, state.mode === 'initials' ? 24 : 500).join('')
  if (state.mode === 'literal')
    return { [state.phrase === null ? 'draft' : 'phrase']: bounded, selection: null }
  if (state.mode !== 'initials') return { buffer: bounded }
  const lastWord = state.tokens.findLastIndex((token) => token.kind !== 'initial')
  const locked = state.tokens.slice(0, lastWord + 1)
  return {
    tokens: [
      ...locked,
      ...initials(bounded.slice(0, Math.max(0, 24 - locked.length))).map((token, i) => ({
        ...token,
        id: `initial-${locked.length + i}`
      }))
    ],
    selectedToken: null
  }
}

function reduceComposition(state: CompositionState, action: Action): CompositionState {
  switch (action.type) {
    case 'lock-sentence':
      return state.phrase === null && state.mode === 'literal' && state.draft.trim()
        ? edit(state, {})
        : state
    case 'memory-changed':
      return { ...edit(state, {}, false), memoryNotice: '' }
    case 'memory-notice':
      return { ...state, memoryNotice: action.text }
    case 'cloud':
      return {
        ...edit(state, {}, false),
        cloudEnabled: action.enabled,
        notice: action.enabled
          ? 'Gemini enabled. Sends constraints, listed conversation, and personal memory if permitted.'
          : 'Cloud suggestions are off. Exact spelling remains available.'
      }
    case 'history-reset':
      return edit(state, {}, false)
    case 'conversation-add': {
      const text = action.text.trim()
      if (!text || text.length > 1000)
        return { ...state, validationError: 'Use a conversation turn of at most 1,000 characters.' }
      const next: CompositionState = {
        ...edit(state, {}, false),
        conversation: [
          ...state.conversation.slice(-7),
          { id: `turn-${state.revision + 1}`, speaker: action.speaker, text }
        ],
        notice: 'Conversation updated for your next request.'
      }
      // External finalized turns must be dispatched at a safe interaction boundary.
      // Refresh only an existing expansion, never accepted text or an edited phrase.
      return action.speaker === 'partner' &&
        state.cloudEnabled &&
        state.paused &&
        state.request?.purpose === 'expansion' &&
        state.phrase === null
        ? reducer(next, { type: 'predict', purpose: 'expansion', id: `context-${next.revision}` })
        : next
    }
    case 'conversation-edit':
      return {
        ...edit(state, {}, false),
        conversation: state.conversation.map((t) =>
          t.id === action.id ? { ...t, text: action.text.slice(0, 1000) } : t
        )
      }
    case 'conversation-remove':
      return {
        ...edit(state, {}, false),
        conversation: state.conversation.filter((t) => t.id !== action.id)
      }
    case 'conversation-clear':
      return {
        ...edit(state, {}, false),
        conversation: [],
        contextEpoch: state.contextEpoch + 1,
        notice: 'Conversation cleared. Pending suggestions were cancelled.'
      }
    case 'workspace': {
      if (
        state.workspace === 'phrases' &&
        action.workspace === 'dasher' &&
        canLockSentence(state)
      ) {
        const next = edit(state, {
          lockedSentences: [...state.lockedSentences, (state.phrase ?? state.draft).trim()],
          phraseInitials: '',
          draft: '',
          phrase: null,
          editor: 'entry',
          mode: 'initials',
          tokens: [],
          buffer: '',
          selectedToken: null,
          selection: null
        })
        return {
          ...next,
          workspace: 'dasher',
          branches: [],
          notice: 'Sentence locked. Enter initials for the next sentence.'
        }
      }

      // Returning with a selected word starts its exact replacement; otherwise
      // preserve unfinished initials and keyword editing.
      const next =
        action.workspace === 'dasher' &&
        state.editor === 'phrase' &&
        state.selection &&
        state.mode !== 'replacement'
          ? reducer(state, { type: 'spell' })
          : action.workspace === 'dasher' && state.editor === 'keywords' && !state.selectedToken
            ? reducer(state, { type: 'keep-entering' })
            : state
      return { ...next, workspace: action.workspace, paused: true }
    }
    case 'input':
      return edit(state, applyInput(state, action.text))
    case 'engine': {
      if (
        state.paused ||
        action.sessionId !== state.session.id ||
        action.sequence <= state.session.sequence
      )
        return state
      const changes = applyInput(state, action.text)
      const next = { ...invalidate(state), validationError: null, ...changes }
      if (entrySeed(next) === entrySeed(state)) return state
      return {
        ...next,
        revision: state.revision + 1,
        history:
          state.session.sequence < 0
            ? [...state.history, state.session.before].slice(-60)
            : state.history,
        session: { ...state.session, sequence: action.sequence }
      }
    }
    case 'pause':
      return { ...state, paused: true, notice: action.notice ?? state.notice }
    case 'resume': {
      if (state.workspace !== 'dasher') return state
      if (state.editor === 'keywords' && !state.selectedToken) return state
      const next = invalidate(state)
      return {
        ...next,
        paused: false,
        notice: 'Steer toward a letter. Move left of the crosshair to reverse.',
        session: {
          id: state.session.id + 1,
          sequence: -1,
          seed: entrySeed(state),
          before: contentOf(state)
        }
      }
    }
    case 'mode':
      return {
        ...edit(
          state,
          {
            mode: action.mode,
            editor: 'entry',
            phrase: null,
            buffer: '',
            selectedToken: null,
            selection: null
          },
          false
        ),
        notice:
          action.mode === 'initials'
            ? 'Each initial stands for one word.'
            : 'Exact spelling writes directly into your draft.'
      }
    case 'backspace': {
      if (!entrySeed(state) && (state.mode === 'initials' || state.mode === 'keyword')) {
        const removeId = state.mode === 'keyword' ? state.selectedToken : state.tokens.at(-1)?.id
        return removeId
          ? edit(state, {
              tokens: state.tokens
                .filter((token) => token.id !== removeId)
                .map((token, i) => ({ ...token, id: `initial-${i}` })),
              mode: 'initials',
              selectedToken: null,
              buffer: ''
            })
          : state
      }
      return edit(state, applyInput(state, [...entrySeed(state)].slice(0, -1).join('')))
    }
    case 'use-initial': {
      if (state.mode !== 'keyword' || !state.selectedToken) return state
      if (!/^[A-Za-z]$/.test(state.buffer.trim()))
        return { ...state, validationError: 'Enter one letter to use it as an initial.' }
      return edit(state, {
        tokens: state.tokens.map((token) =>
          token.id === state.selectedToken
            ? { ...token, kind: 'initial', value: state.buffer.trim().toLowerCase() }
            : token
        ),
        mode: 'initials',
        buffer: '',
        selectedToken: null
      })
    }
    case 'limit':
      return {
        ...state,
        paused: true,
        validationError: 'Entry limit reached. Delete or expand before continuing.'
      }
    case 'undo': {
      const previous = state.history.at(-1)
      return previous
        ? {
            ...edit(state, previous, false),
            history: state.history.slice(0, -1),
            notice: 'Last edit undone.'
          }
        : state
    }
    case 'back': {
      const previous = state.branches.at(-1)
      return previous
        ? {
            ...edit(state, previous),
            branches: state.branches.slice(0, -1),
            notice: 'Back to the previous phrase branch.'
          }
        : state
    }
    case 'speech-completed': {
      // Remove exactly what was spoken. Unrelated updates during playback (a transcribed partner
      // turn, a newly locked sentence, fresh initials) change the revision but must not keep a
      // spoken sentence in the message; a message that no longer starts with it is left alone.
      const parts = [...state.lockedSentences, state.phrase ?? state.draft].filter(Boolean)
      const spoken = parts.findIndex((_, i) => parts.slice(0, i + 1).join(' ') === action.text) + 1
      if (!spoken) return state
      // Work started after speaking (a later sentence, new initials or spelling) is kept.
      // Literal entry is the draft itself, so leftover initials there are not new work.
      const entering = state.mode !== 'literal' && (state.tokens.length > 0 || !!state.buffer)
      if (spoken < parts.length || entering)
        return {
          ...edit(state, {
            lockedSentences: state.lockedSentences.slice(spoken),
            ...(spoken > state.lockedSentences.length ? { draft: '', phrase: null } : {})
          }),
          notice: 'Spoken text was removed from your message.'
        }
      return {
        ...edit(state, {
          lockedSentences: [],
          draft: '',
          phrase: null,
          editor: 'entry',
          tokens: [],
          buffer: '',
          mode: 'initials',
          selection: null,
          selectedToken: null
        }),
        // A finished message starts the next one on the writing screen.
        workspace: 'dasher',
        branches: [],
        notice: 'Message spoken. Enter initials for a new message.'
      }
    }
    case 'clear':
      return {
        ...edit(state, {
          lockedSentences: [],
          phraseInitials: '',
          draft: '',
          savedSentences: [],
          correctionOrigin: null,
          learnedCorrections: [],
          phrase: null,
          editor: 'entry',
          tokens: [],
          buffer: '',
          mode: 'initials',
          selection: null,
          selectedToken: null
        }),
        branches: [],
        notice: 'A fresh message. Undo restores your previous draft.'
      }
    case 'example':
      return {
        ...edit(state, {
          phrase: null,
          editor: 'entry',
          tokens: initials(action.initials),
          mode: 'initials',
          buffer: '',
          selection: null,
          selectedToken: null
        }),
        notice: 'Example initials loaded. Enable Gemini, then choose Expand.'
      }
    case 'keep-entering': {
      const next =
        state.mode === 'keyword' && state.buffer.trim()
          ? reducer(state, { type: 'use-prefix' })
          : state
      return next.validationError ? next : reducer(next, { type: 'mode', mode: 'initials' })
    }
    case 'open-keywords':
      return edit(
        state,
        {
          editor: 'keywords',
          tokens: state.request?.purpose === 'expansion' ? state.request.tokens : state.tokens,
          phrase: null,
          mode: 'initials',
          selection: null,
          selectedToken: null,
          buffer: ''
        },
        false
      )
    case 'edit-draft':
    case 'edit-candidate': {
      const candidate =
        action.type === 'edit-candidate'
          ? state.candidates.find((item) => item.id === action.id)
          : null
      if (
        action.type === 'edit-candidate' &&
        (!candidate || state.request?.revision !== state.revision)
      )
        return state
      const phrase = candidate?.text ?? state.draft
      if (!phrase) return state
      return {
        ...edit(
          state,
          {
            phrase,
            phraseInitials:
              candidate && state.request?.purpose === 'expansion'
                ? lexicalWords(state.request.draft)
                    .map((word) => word[0])
                    .join('') + state.request.tokens.map((t) => t.value[0].toLowerCase()).join('')
                : state.phraseInitials,
            correctionOrigin: phrase,
            tokens:
              candidate && state.request?.purpose === 'expansion'
                ? state.request.tokens
                : state.tokens,
            editor: 'phrase',
            mode: 'literal',
            buffer: '',
            selection: null,
            selectedToken: null
          },
          false
        ),
        branches: [...state.branches, contentOf(state)].slice(-30)
      }
    }
    case 'use-phrase': {
      if (state.phrase === null || state.mode === 'replacement') return state
      return edit(state, {
        draft: state.phrase,
        phrase: null,
        editor: 'entry',
        mode: 'literal',
        selection: null
      })
    }
    case 'select-token': {
      if (state.mode === 'replacement') return state
      let next = state
      if (state.mode === 'keyword' && state.buffer.trim()) {
        next = reducer(state, { type: 'use-prefix' })
        if (next.validationError) return next
      }
      return next.tokens.some((token) => token.id === action.id)
        ? edit(
            next,
            {
              editor: 'keywords',
              mode: 'keyword',
              selectedToken: action.id,
              selection: null,
              buffer: ''
            },
            false
          )
        : state
    }
    case 'select-span': {
      if (state.mode === 'keyword' || state.mode === 'replacement') return state
      const phrase = state.phrase ?? state.draft
      if (
        action.range.start < 0 ||
        action.range.end > phrase.length ||
        action.range.start >= action.range.end
      )
        return state
      const next = edit(state, { selection: action.range, selectedToken: null }, false)
      // Port of input-bar.onChipClicked: selecting a word immediately invokes FillMask.
      if (state.phrase !== null)
        return {
          ...next,
          status: 'loading',
          request: {
            id: `fill-mask-${next.revision}`,
            revision: next.revision,
            purpose: 'refinement',
            draft: phrase,
            lockedMessage: next.lockedSentences.join(' '),
            conversation: next.conversation.filter((t) => t.text.trim()).map((t) => ({ ...t })),
            conversationHistory: next.conversationArchive,
            tokens: next.tokens,
            target: action.range
          }
        }
      return next
    }
    case 'spell': {
      if (state.selectedToken) {
        const token = state.tokens.find((item) => item.id === state.selectedToken)
        return token
          ? edit(
              state,
              { mode: 'keyword', buffer: token.kind !== 'initial' ? token.value : '' },
              false
            )
          : state
      }
      return state.selection
        ? edit(
            state,
            {
              mode: 'replacement',
              buffer:
                state.phrase === null
                  ? state.draft.slice(state.selection.start, state.selection.end)
                  : ''
            },
            false
          )
        : state
    }
    case 'use-prefix':
    case 'done': {
      if (action.type === 'use-prefix' && state.mode !== 'keyword') return state
      if (!state.buffer.trim())
        return { ...state, validationError: 'Spell a word first, or cancel to keep the original.' }
      if (state.mode === 'keyword') {
        if (!/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(state.buffer.trim()))
          return { ...state, validationError: 'A locked keyword must be one word.' }
        return edit(state, {
          tokens: state.tokens.map((token) =>
            token.id === state.selectedToken
              ? {
                  ...token,
                  kind: action.type === 'use-prefix' ? 'prefix' : 'word',
                  value: state.buffer.trim()
                }
              : token
          ),
          mode: 'initials',
          buffer: '',
          selectedToken: null
        })
      }
      if (state.mode === 'replacement' && state.selection) {
        const phrase = state.phrase ?? state.draft
        if (
          [
            ...(phrase.slice(0, state.selection.start) +
              state.buffer +
              phrase.slice(state.selection.end))
          ].length > 500
        )
          return { ...state, validationError: 'Your message must fit within 500 characters.' }
        return edit(state, {
          [state.phrase === null ? 'draft' : 'phrase']:
            phrase.slice(0, state.selection.start) +
            state.buffer +
            phrase.slice(state.selection.end),
          mode: 'literal',
          buffer: '',
          selection: null
        })
      }
      return state
    }
    case 'cancel-edit':
      return edit(
        state,
        {
          mode: state.mode === 'keyword' ? 'initials' : 'literal',
          buffer: '',
          selectedToken: null,
          selection: null
        },
        false
      )
    case 'predict': {
      const next = state
      let tokens = state.tokens
      if (action.purpose === 'expansion' && state.mode === 'keyword' && state.buffer.trim()) {
        const value = state.buffer.trim()
        if (!/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(value))
          return { ...state, validationError: 'A keyword must be one word.' }
        tokens = tokens.map((token) =>
          token.id === state.selectedToken
            ? { ...token, kind: value.length === 1 ? 'initial' : 'prefix', value }
            : token
        )
      }
      if (action.purpose === 'expansion' && !next.tokens.length) return next
      if (action.purpose === 'refinement' && !next.selection) return next
      const draft = next.phrase ?? next.draft
      return reducer(next, {
        type: 'request',
        request: {
          id: action.id,
          revision: next.revision,
          purpose: action.purpose,
          draft,
          lockedMessage: next.lockedSentences.join(' '),
          conversation: next.conversation.filter((t) => t.text.trim()).map((t) => ({ ...t })),
          conversationHistory: next.conversationArchive,
          tokens: tokens.map((token) => ({ ...token })),
          target:
            action.purpose === 'refinement'
              ? next.selection!
              : { start: draft.length, end: draft.length }
        }
      })
    }
    case 'request':
      return action.request.revision === state.revision
        ? {
            ...state,
            paused: true,
            request: action.request,
            candidates: [],
            status: 'loading',
            notice: 'Gemini is preparing six suggestions…'
          }
        : state
    case 'result': {
      const result = action.result
      if (
        !state.request ||
        state.status !== 'loading' ||
        state.request.id !== result.requestId ||
        state.revision !== result.revision ||
        state.request.purpose !== result.purpose
      )
        return state
      if (result.status === 'error') return { ...state, status: 'error', notice: result.message }
      if (
        result.candidates.length < state.candidates.length ||
        state.candidates.some(
          (c, i) => c.id !== result.candidates[i]?.id || c.text !== result.candidates[i]?.text
        )
      )
        return state
      return {
        ...state,
        candidates: result.candidates,
        status: !result.complete ? 'loading' : result.candidates.length ? 'ready' : 'empty',
        notice:
          result.message ??
          (!result.complete
            ? `${result.candidates.length} of six suggestions ready; Gemini is still streaming…`
            : result.candidates.length
              ? 'Choose a phrase to review or edit. Speech only starts when you choose Speak.'
              : 'No suggestions preserved your constraints. Keep entering, lock a word, or retry.')
      }
    }
    case 'accept': {
      const candidate = state.candidates.find((item) => item.id === action.id)
      const request = state.request
      if (!candidate || !request || request.revision !== state.revision) return state
      if (request.purpose === 'refinement' && state.phrase !== null) {
        return edit(state, { phrase: candidate.text, selection: null, buffer: '', mode: 'literal' })
      }
      const next = edit(state, {
        draft: candidate.text,
        phraseInitials:
          request.purpose === 'expansion'
            ? lexicalWords(request.draft)
                .map((word) => word[0])
                .join('') + request.tokens.map((t) => t.value[0].toLowerCase()).join('')
            : request.purpose === 'completion'
              ? ''
              : state.phraseInitials,
        correctionOrigin: null,
        tokens: request.tokens,
        phrase: null,
        editor: 'entry',
        selection: null,
        selectedToken: null,
        buffer: '',
        mode: 'literal'
      })
      return {
        ...next,
        branches: [...state.branches, contentOf(state)].slice(-30),
        notice: 'Phrase accepted. Choose Edit message to change a word.'
      }
    }
    case 'dismiss':
      return {
        ...invalidate(state),
        paused: true,
        notice: 'Suggestions dismissed. Your draft and initials are unchanged.'
      }
  }
}

/** Workspace changes follow explicit actions, never prediction completion or inactivity. */
export function reducer(state: CompositionState, action: Action): CompositionState {
  let next = reduceComposition(state, action)
  if (next === state) return state
  const autoLocked =
    action.type === 'workspace' && next.lockedSentences.length > state.lockedSentences.length
  const committedText = autoLocked ? next.lockedSentences.at(-1)! : next.draft
  const sentenceCommitted =
    autoLocked ||
    action.type === 'lock-sentence' ||
    action.type === 'use-phrase' ||
    (action.type === 'accept' && next.phrase === null) ||
    (action.type === 'done' && state.mode === 'replacement' && state.phrase === null)
  if (sentenceCommitted && !next.validationError && committedText.trim()) {
    const id = `sentence-${next.revision}`
    next = {
      ...next,
      savedSentences: [...next.savedSentences, id],
      conversation: [
        ...next.conversation.slice(-7),
        { id, speaker: 'me', text: committedText.trim().slice(0, 1000) }
      ],
      sentenceEvents: [
        ...next.sentenceEvents,
        {
          sequence: next.revision,
          operation: {
            type: 'commit' as const,
            id,
            text: committedText,
            conversation: next.conversation.map(({ speaker, text }) => ({ speaker, text }))
          }
        }
      ].slice(-100)
    }
  }
  const commit =
    autoLocked ||
    action.type === 'use-phrase' ||
    (action.type === 'done' && state.mode === 'replacement' && state.phrase === null) ||
    (action.type === 'accept' && state.request?.purpose === 'refinement' && state.phrase === null)
  if (commit && !next.validationError) {
    const correction = { before: state.correctionOrigin ?? state.draft, after: committedText }
    if (validCorrection(correction)) {
      const id = `correction-${next.revision}`
      next = {
        ...next,
        correctionOrigin: null,
        learnedCorrections: [...next.learnedCorrections, id],
        memoryEvents: [
          ...next.memoryEvents,
          { sequence: next.revision, operation: { type: 'learn' as const, id, correction } }
        ].slice(-100)
      }
    }
  }
  if (action.type === 'undo' || action.type === 'back') {
    const sentencesRemoved = state.savedSentences.filter((id) => !next.savedSentences.includes(id))
    if (sentencesRemoved.length)
      next = {
        ...next,
        conversation: next.conversation.filter((turn) => !sentencesRemoved.includes(turn.id)),
        sentenceEvents: [
          ...next.sentenceEvents,
          {
            sequence: next.revision,
            operation: { type: 'forget-sentences' as const, ids: sentencesRemoved }
          }
        ].slice(-100)
      }
    const removed = state.learnedCorrections.filter((id) => !next.learnedCorrections.includes(id))
    if (removed.length)
      next = {
        ...next,
        memoryEvents: [
          ...next.memoryEvents,
          { sequence: next.revision, operation: { type: 'forget' as const, ids: removed } }
        ].slice(-100)
      }
  }
  if (
    next.conversation !== state.conversation ||
    ['history-reset', 'memory-changed'].includes(action.type)
  ) {
    const removed = new Set(state.savedSentences.filter((id) => !next.savedSentences.includes(id)))
    if (action.type === 'conversation-remove') removed.add(action.id)
    const archive =
      action.type === 'conversation-clear' ||
      action.type === 'history-reset' ||
      action.type === 'memory-changed'
        ? []
        : state.conversationArchive.filter((t) => !removed.has(t.id))
    const turns = new Map(archive.map((t) => [t.id, t]))
    for (const turn of next.conversation) if (!removed.has(turn.id)) turns.set(turn.id, turn)
    const bounded = boundConversationHistory([...turns.values()])
    next = {
      ...next,
      conversationArchive:
        JSON.stringify(bounded) === JSON.stringify(state.conversationArchive)
          ? state.conversationArchive
          : bounded
    }
    if (next.request && next.request.conversationHistory !== next.conversationArchive)
      next = {
        ...next,
        request: { ...next.request, conversationHistory: next.conversationArchive }
      }
  }
  let workspace = next.workspace
  switch (action.type) {
    case 'spell':
    case 'select-token':
    case 'keep-entering':
    case 'mode':
    case 'clear':
    case 'example':
      workspace = 'dasher'
      break
    case 'edit-draft':
    case 'edit-candidate':
    case 'open-keywords':
    case 'done':
    case 'cancel-edit':
    case 'use-initial':
    case 'use-prefix':
      if (!next.validationError) workspace = 'phrases'
      break
  }
  return workspace === next.workspace ? next : { ...next, workspace, paused: true }
}
