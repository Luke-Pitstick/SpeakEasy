import { useReducer, type ReactNode } from 'react'
import { initialState, reducer } from './model'
import { StateContext, DispatchContext } from './state'
export function CompositionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}
