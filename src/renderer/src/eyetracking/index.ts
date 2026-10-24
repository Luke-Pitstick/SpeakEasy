export { GazeProvider } from './GazeProvider'
export { AimAssist, DEFAULT_AIM_ASSIST, findGazeTargets } from './aimAssist'
export type { AimAssistOptions, GazeTargetRect } from './aimAssist'
export { GazeTracker, clientToScreen, screenToClient } from './GazeTracker'
export type {
  CalibrationSample,
  DriftSummary,
  LearningResult,
  PointerMode,
  TrackerState
} from './GazeTracker'
export { DEFAULT_DWELL, DwellSelector } from './dwell'
export { DEFAULT_HEAD_POINTER, HeadPointer } from './headPointer'
export type { HeadPointerOptions } from './headPointer'
export type { DwellOptions, DwellUpdate } from './dwell'
export { assessSelection } from './selectionLearning'
export { useGaze, useGazeSelect, useGazeTarget, useGazeTracker, useTrackerState } from './hooks'
export { CalibrationOverlay } from './components/CalibrationOverlay'
export { CameraPreview } from './components/CameraPreview'
export { DriftTestOverlay } from './components/DriftTestOverlay'
export { ClickRefinement } from './components/ClickRefinement'
export { GazeCursor } from './components/GazeCursor'
export { HeadCenterOverlay } from './components/HeadCenterOverlay'
export { HeadPositionGuide } from './components/HeadPositionGuide'
export { LearningFeedback } from './components/LearningFeedback'
export type { GazeInput, GazeModelData } from './gazeModel'
export type { CalibrationResult, EyeFeatures, GazePoint, HeadPose, TrackerStatus } from './types'
