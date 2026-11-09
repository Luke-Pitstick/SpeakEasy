// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

import { createContext, useContext, type Dispatch } from 'react'
import type { Action, CompositionState } from './model'
export const StateContext = createContext<CompositionState | null>(null)
export const DispatchContext = createContext<Dispatch<Action> | null>(null)
export function useComposition(): CompositionState {
  const state = useContext(StateContext)
  if (!state) throw new Error('CompositionProvider is required')
  return state
}
export function useCompositionDispatch(): Dispatch<Action> {
  const dispatch = useContext(DispatchContext)
  if (!dispatch) throw new Error('CompositionProvider is required')
  return dispatch
}
