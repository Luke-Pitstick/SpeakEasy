import { createContext, useContext } from 'react'
interface Interaction {
  dwell: boolean
  setDwell: (value: boolean) => void
  duration: number
  setDuration: (value: number) => void
  busy: boolean
  setBusy: (value: boolean) => void
}
export const InteractionContext = createContext<Interaction | null>(null)
export function useInteraction(): Interaction {
  const value = useContext(InteractionContext)
  if (!value) throw new Error('InteractionProvider is required')
  return value
}
