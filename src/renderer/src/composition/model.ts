import type {
  AbbreviationToken,
  PhraseCandidate,
  PredictionRequest,
  PredictionResult,
  TextRange
} from '../../../shared/prediction'

export type EntryMode = 'initials' | 'literal' | 'keyword' | 'replacement'
export interface Content {
  draft: string
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
    tokens: state.tokens.map((token) => ({ ...token })),
    mode: state.mode,
    buffer: state.buffer,
    selectedToken: state.selectedToken,
    selection: state.selection ? { ...state.selection } : null
  }
}

export function entryText(state: Content): string {
  if (state.mode === 'literal') return state.draft
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

function applyInput(state: CompositionState, text: string): Partial<Content> {
  const bounded = [...text].slice(0, state.mode === 'initials' ? 24 : 500).join('')
  if (state.mode === 'literal') return { draft: bounded, selection: null }
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
          { mode: action.mode, buffer: '', selectedToken: null, selection: null },
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
          tokens: initials(action.initials),
          mode: 'initials',
          buffer: '',
          selection: null,
          selectedToken: null
        }),
        notice: 'Example initials loaded. Choose Expand to see demo phrases.'
      }
    case 'select-token':
      if (state.mode === 'keyword' || state.mode === 'replacement') return state
      return state.tokens.some((token) => token.id === action.id)
        ? edit(state, { selectedToken: action.id, selection: null }, false)
        : state
    case 'select-span':
      if (state.mode === 'keyword' || state.mode === 'replacement') return state
      return action.range.start >= 0 &&
        action.range.end <= state.draft.length &&
        action.range.start < action.range.end
        ? edit(state, { selection: action.range, selectedToken: null }, false)
        : state
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
              buffer: state.draft.slice(state.selection.start, state.selection.end)
            },
            false
          )
        : state
    }
    case 'use-prefix':
    case 'done': {
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
        if (
          [
            ...(state.draft.slice(0, state.selection.start) +
              state.buffer +
              state.draft.slice(state.selection.end))
          ].length > 500
        )
          return { ...state, validationError: 'Your message must fit within 500 characters.' }
        return edit(state, {
          draft:
            state.draft.slice(0, state.selection.start) +
            state.buffer +
            state.draft.slice(state.selection.end),
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
          ? 'Choose a phrase to add it to your draft. Nothing is spoken.'
          : 'No demo match. Keep entering, lock a word, or use exact spelling.'
      }
    }
    case 'accept': {
      const candidate = state.candidates.find((item) => item.id === action.id)
      const request = state.request
      if (!candidate || !request || request.revision !== state.revision || state.status !== 'ready')
        return state
      const next = edit(state, {
        draft: candidate.text,
        selection: null,
        selectedToken: null,
        buffer: '',
        mode: 'literal'
      })
      return {
        ...next,
        branches: [...state.branches, contentOf(state)].slice(-30),
        notice: 'Phrase added to your draft. Select a word to refine or spell it.'
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
