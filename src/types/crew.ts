export type ScreenId = 1 | 2 | 3 | 4 | 5 | 6

export type CheckpointStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

export type SubmittedStatus = Exclude<CheckpointStatus, 'PENDING'>

export type LaunchStatus = 'PENDING' | 'POSTPONED' | 'SUCCESS' | 'FAILED'

export type LaunchReportStatus = Extract<LaunchStatus, 'SUCCESS' | 'FAILED'>

export interface Checkpoint {
  id: number
  code: string
  title: string
  status: CheckpointStatus
  fixedTime: string | null
  description: string
  audioBlob: string | null
  reportId: string | null
}

export interface ShiftSummary {
  sentCount: number
  pendingCount: number
  offline: boolean
}

export interface LaunchItem {
  id: string
  orderNumber: number
  routeId: string
  droneName: string
  droneNumber: string
  trackerNumber: string | null
  status: LaunchStatus
  time: string | null
  wasPostponed: boolean
  description: string
  audioBlob: string | null
}

export interface OutboxEvent {
  id: string
  login: string
  checkpointId: number
  code: string
  status: SubmittedStatus
  title: string
  description: string
  audioBlob: string | null
  audioKey: string | null
  fixedTime: string
}

export interface LaunchOutboxEvent {
  id: string
  login: string
  launchId: string
  orderNumber: number
  routeId: string
  droneNumber: string
  trackerNumber: string | null
  status: LaunchReportStatus
  description: string
  audioBlob: string | null
  audioKey: string | null
  time: string
}

export interface LaunchesConfirmedOutboxEvent {
  id: string
  login: string
  kind: 'LAUNCHES_CONFIRMED'
  time: string
}

export interface ShiftClosedOutboxEvent {
  id: string
  login: string
  kind: 'SHIFT_CLOSED'
  time: string
}

export type CrewOutboxItem =
  | OutboxEvent
  | LaunchOutboxEvent
  | LaunchesConfirmedOutboxEvent
  | ShiftClosedOutboxEvent

export interface MissionPlan {
  target: string
  address: string
  mgrs: string
  reception: string
  receptionLabel: string
}

export interface CrewState {
  currentScreen: ScreenId
  isOnline: boolean
  isSyncing: boolean
  outbox: CrewOutboxItem[]
  login: string
  syncTime: string | null
  mission: MissionPlan
  checkpoints: Checkpoint[]
  launches: LaunchItem[]
  activeLaunch: LaunchItem | null
  shiftSummary: ShiftSummary | null
  setScreen: (screen: ScreenId) => void
  setLogin: (login: string) => void
  setOnlineStatus: (isOnline: boolean) => void
  syncData: () => void
  triggerSync: () => Promise<ShiftSummary>
  loadPlanFromRemote: () => Promise<void>
  submitCheckpoint: (
    id: number,
    status: SubmittedStatus,
    description: string,
    audioBlob: Blob | null,
  ) => Promise<void>
  updateLaunchTracker: (launchId: string, newTracker: string | null) => void
  submitLaunch: (
    launchId: string,
    status: LaunchStatus,
    description: string,
    audioBlob: Blob | null,
  ) => Promise<void>
  confirmLaunches: () => Promise<void>
  closeShift: () => Promise<void>
  resetSession: () => void
}
