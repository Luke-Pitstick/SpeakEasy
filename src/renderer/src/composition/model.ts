import { wordInitials } from '../../../shared/initialsPpm'
import type {
  AbbreviationToken,
  PhraseCandidate,
  PredictionRequest,
  PredictionPurpose,
  PredictionResult,
  TextRange
} from '../../../shared/prediction'

export type EntryMode = 'initials' | 'literal' | 'keyword' | 'replacement'
export interface Content {
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

export function initialState(): CompositionState {
  const content: Content = {
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
    revision: 0,
    session: { id: 0, sequence: -1, seed: '', before: contentOf(content) },
    paused: true,
    history: [],
    branches: [],
    request: null,
    candidates: [],
    status: 'idle',
    validationError: null,
    notice: 'Enter initials below, or try the coffee example.'
  }
}

export type Action =
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

export function reducer(state: CompositionState, action: Action): CompositionState {
  switch (action.type) {
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
      if (state.editor === 'phrase' && state.mode !== 'replacement') return state
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
    case 'clear':
      return {
        ...edit(state, {
          draft: '',
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
        notice: 'Example initials loaded. Choose Expand to see demo phrases.'
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
            notice: 'Preparing demo suggestions…'
          }
        : state
    case 'result': {
      const result = action.result
      if (
        !state.request ||
        state.request.id !== result.requestId ||
        state.revision !== result.revision ||
        state.request.purpose !== result.purpose
      )
        return state
      if (result.status === 'error') return { ...state, status: 'error', notice: result.message }
      return {
        ...state,
        candidates: result.candidates,
        status: result.candidates.length ? 'ready' : 'empty',
        notice: result.candidates.length
          ? 'Edit a suggestion, or choose Use to accept it.'
          : 'No demo match. Keep entering, lock a word, or use exact spelling.'
      }
    }
    case 'accept': {
      const candidate = state.candidates.find((item) => item.id === action.id)
      const request = state.request
      if (!candidate || !request || request.revision !== state.revision || state.status !== 'ready')
        return state
      if (request.purpose === 'refinement' && state.phrase !== null) {
        return edit(state, { phrase: candidate.text, selection: null, buffer: '', mode: 'literal' })
      }
      const next = edit(state, {
        draft: candidate.text,
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
