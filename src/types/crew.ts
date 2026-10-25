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

export type LaunchSyncNotice = 'synced' | 'queued'

export const DEFAULT_TASK_ID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'

export interface LaunchItem {
  id: string
  taskId: string
  battleGroupId: string
  orderNumber: number
  routeId: string
  droneName: string
  droneNumber: string
  trackerNumber: string
  targetMgrs: string
  status: LaunchStatus
  time: string | null
  fixedTime: string | null
  wasPostponed: boolean
  description: string
  comment: string
  audioBlob: string | null
}

export interface OutboxEvent {
  id: string
  login: string
  taskId: string
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
  taskId: string
  battleGroupId: string
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

export interface CompletedCheckpoint {
  fixedTime: string
  status: string
}

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
  isLoadingLaunches: boolean
  outbox: CrewOutboxItem[]
  login: string
  currentTaskId: string | null
  syncTime: string | null
  mission: MissionPlan
  checkpoints: Checkpoint[]
  completedCheckpoints: Record<string, CompletedCheckpoint>
  launches: LaunchItem[]
  activeLaunch: LaunchItem | null
  shiftSummary: ShiftSummary | null
  launchSyncNotice: LaunchSyncNotice | null
  setScreen: (screen: ScreenId) => void
  setLogin: (login: string) => void
  setOnlineStatus: (isOnline: boolean) => void
  syncData: () => void
  triggerSync: () => Promise<ShiftSummary>
  loadPlanFromRemote: () => Promise<void>
  fetchMissionLaunches: (crewId: string) => Promise<void>
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
  resetMission: () => Promise<void>
  resetSession: () => void
}
