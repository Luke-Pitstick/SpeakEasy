import { FrozenInitialsPpm } from '../../../../shared/initialsPpm'
import artifact from './initials-model.json'

// Frozen run f70020135ab3a402. The artifact already includes 10% uniform mass.
// SHA-256: 2780b90e230892ba92fd8c2c16053c8d61558595a1a92b2247b48ee02d5171ba
// See docs/initials-ppm-results.md for training, evaluation, and source notices.
export function loadInitialsModel(value: unknown): {
  model: FrozenInitialsPpm | null
  status: string
} {
  try {
    const model = new FrozenInitialsPpm(value)
    if (model.artifact.config.floor !== 0.1)
      throw new Error('The initials model must contain 10% uniform smoothing')
    return { model, status: 'Trained initials PPM · 10% smoothing' }
  } catch {
    return { model: null, status: 'Initials model unavailable · using uniform letters' }
  }
}

export const trainedInitials = loadInitialsModel(artifact)
