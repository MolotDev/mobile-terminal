import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { putAudio } from '../lib/audioStore.ts'
import { fetchActiveMission, syncOutbox } from '../services/syncService.ts'
import type {
  Checkpoint,
  CrewOutboxItem,
  CrewState,
  LaunchItem,
  LaunchOutboxEvent,
  MissionPlan,
  LaunchSyncNotice,
  OutboxEvent,
  ScreenId,
  ShiftClosedOutboxEvent,
  ShiftSummary,
} from '../types/crew.ts'

const DEFAULT_LOGIN = '1.1.1'
const STORAGE_KEY = 'tactical-terminal-v3'
let syncFollowUp = false

const DEFAULT_MISSION: MissionPlan = {
  target: 'Склад',
  address: 'північна промзона, ангар 2',
  mgrs: '36U EV 45210 88320',
  reception: 'Пункт приймання',
  receptionLabel: 'AP-01',
}

const CHECKPOINT_DEFINITIONS = [
  { id: 1, code: 'checkpoint_1', title: 'ЗІБРАЛИСЯ' },
  { id: 2, code: 'checkpoint_2', title: 'ПРИБУЛИ' },
  { id: 3, code: 'checkpoint_3', title: 'ГОТОВІ ДО ВИКОНАННЯ' },
  { id: 4, code: 'checkpoint_4', title: 'ЗГОРНУЛИСЯ' },
  { id: 5, code: 'checkpoint_5', title: 'ПОВЕРНУЛИСЯ' },
] as const

function findActiveLaunch(launches: LaunchItem[]): LaunchItem | null {
  return (
    launches.find((launch) => launch.status === 'PENDING' || launch.status === 'POSTPONED') ??
    null
  )
}

function createCheckpoint(point: (typeof CHECKPOINT_DEFINITIONS)[number]): Checkpoint {
  return {
    id: point.id,
    code: point.code,
    title: point.title,
    status: 'PENDING',
    fixedTime: null,
    description: '',
    audioBlob: null,
    reportId: null,
  }
}

function createCheckpoints(): Checkpoint[] {
  return CHECKPOINT_DEFINITIONS.map((point) => createCheckpoint(point))
}

function alignCheckpoints(stored: Checkpoint[]): Checkpoint[] {
  const byId = new Map(stored.map((point) => [point.id, point]))
  return CHECKPOINT_DEFINITIONS.map((definition) => {
    const current = byId.get(definition.id)
    if (!current) return createCheckpoint(definition)
    return {
      ...current,
      code: definition.code,
      title: definition.title,
      reportId: current.reportId ?? null,
    }
  })
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

async function resolveReportedLaunch(
  get: () => { launches: LaunchItem[]; loadPlanFromRemote: () => Promise<void> },
  launchId: string,
  reported: boolean,
): Promise<LaunchItem | null> {
  const current = get().launches.find((launch) => launch.id === launchId) ?? null
  if (!current || !reported || isUuid(current.id)) return current

  const orderNumber = current.orderNumber
  const droneNumber = current.droneNumber
  await get().loadPlanFromRemote()
  const launches = get().launches
  return (
    launches.find((launch) => launch.id === launchId) ??
    launches.find((launch) => isUuid(launch.id) && launch.droneNumber === droneNumber) ??
    launches.find((launch) => isUuid(launch.id) && launch.orderNumber === orderNumber) ??
    current
  )
}

function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

function pendingReports(outbox: CrewOutboxItem[]): number {
  return outbox.filter((item) => 'checkpointId' in item || 'launchId' in item).length
}

function summary(sentCount: number, pendingCount: number, offline: boolean): ShiftSummary {
  return { sentCount, pendingCount, offline }
}

async function storeVoice(blob: Blob | null): Promise<{ audioKey: string | null; playback: string | null }> {
  const playback = await readAudio(blob)
  if (!blob) return { audioKey: null, playback }
  const audioKey = crypto.randomUUID()
  try {
    await Promise.race([
      putAudio(audioKey, blob),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('audio-timeout')), 2000)
      }),
    ])
    return { audioKey, playback }
  } catch {
    return { audioKey: null, playback }
  }
}

function readAudio(audioBlob: Blob | null): Promise<string | null> {
  if (audioBlob === null) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Не вдалося прочитати аудіо'))
    }
    reader.readAsDataURL(audioBlob)
  })
}

function createSessionState(): Pick<
  CrewState,
  | 'currentScreen'
  | 'login'
  | 'syncTime'
  | 'mission'
  | 'checkpoints'
  | 'launches'
  | 'activeLaunch'
  | 'outbox'
> {
  return {
    currentScreen: 1,
    login: DEFAULT_LOGIN,
    syncTime: null,
    mission: DEFAULT_MISSION,
    checkpoints: createCheckpoints(),
    launches: [],
    activeLaunch: null,
    outbox: [],
  }
}

export const useCrewStore = create<CrewState>()(
  persist(
    (set, get) => ({
      ...createSessionState(),
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      isSyncing: false,
      isLoadingLaunches: false,
      shiftSummary: null,
      launchSyncNotice: null,
      setScreen: (screen: ScreenId) => set({ currentScreen: screen }),
      setLogin: (login: string) => set({ login }),
      setOnlineStatus: (isOnline: boolean) => set({ isOnline }),
      syncData: () => set({ syncTime: formatClock(new Date()) }),
      triggerSync: async () => {
        const offline = typeof navigator !== 'undefined' && !navigator.onLine
        const onSummary = get().currentScreen === 6
        if (offline) {
          set({ isOnline: false })
          const result = summary(
            onSummary ? (get().shiftSummary?.sentCount ?? 0) : 0,
            pendingReports(get().outbox),
            true,
          )
          if (onSummary) set({ shiftSummary: result })
          return result
        }
        if (get().isSyncing) {
          syncFollowUp = true
          return get().shiftSummary ?? summary(0, pendingReports(get().outbox), false)
        }
        if (get().outbox.length === 0) {
          set({ isOnline: true })
          await get().loadPlanFromRemote()
          return get().shiftSummary ?? summary(0, 0, false)
        }

        const queuedReports = pendingReports(get().outbox)
        set({ isSyncing: true, isOnline: true })
        try {
          const sentIds = await syncOutbox(get().outbox)
          const sent = new Set(sentIds)
          let pendingCount = queuedReports
          set((state) => {
            const outbox = state.outbox.filter((item) => !sent.has(item.id))
            pendingCount = pendingReports(outbox)
            return {
              outbox,
              isOnline: true,
              ...(sentIds.length > 0 ? { syncTime: formatClock(new Date()) } : {}),
            }
          })
          const batchSent = Math.max(0, queuedReports - pendingCount)
          const sentCount = onSummary ? (get().shiftSummary?.sentCount ?? 0) + batchSent : batchSent
          const result = summary(sentCount, pendingCount, false)
          if (get().currentScreen === 6) set({ shiftSummary: result })
          await get().loadPlanFromRemote()
          return result
        } catch {
          const result = summary(
            onSummary ? (get().shiftSummary?.sentCount ?? 0) : 0,
            pendingReports(get().outbox),
            false,
          )
          if (onSummary) set({ shiftSummary: result })
          return result
        } finally {
          set({ isSyncing: false })
          if (syncFollowUp) {
            syncFollowUp = false
            void get().triggerSync()
          }
        }
      },
      fetchMissionLaunches: async (crewId: string) => {
        set({ isLoadingLaunches: true })
        try {
          const mission = await fetchActiveMission(crewId)
          if (!mission) {
            set({ launches: [], activeLaunch: null, isLoadingLaunches: false })
            return
          }
          set((state) => ({
            launches: mission.launches,
            activeLaunch: findActiveLaunch(mission.launches),
            isLoadingLaunches: false,
            syncTime: formatClock(new Date()),
            mission: mission.mgrs ? { ...state.mission, mgrs: mission.mgrs } : state.mission,
          }))
        } catch (error) {
          console.error('[LOAD ERROR]:', error)
          set({ launches: [], activeLaunch: null, isLoadingLaunches: false })
        }
      },
      loadPlanFromRemote: async () => {
        await get().fetchMissionLaunches(get().login)
      },
      submitCheckpoint: async (id, status, description, audioBlob) => {
        const active = get().checkpoints.find((point) => point.status === 'PENDING')
        if (!active || active.id !== id) return

        const voice = await storeVoice(audioBlob)
        const fixedTime = formatClock(new Date())
        const reportId = crypto.randomUUID()

        set((state) => {
          const current = state.checkpoints.find((point) => point.id === id)
          const stillActive = state.checkpoints.find(
            (point) => point.status === 'PENDING',
          )
          if (!current || !stillActive || stillActive.id !== id) return state

          const checkpoints = state.checkpoints.map((point) =>
            point.id === id
              ? {
                  ...point,
                  status,
                  description,
                  audioBlob: voice.playback,
                  fixedTime,
                  reportId,
                }
              : point,
          )
          const event: OutboxEvent = {
            id: reportId,
            login: state.login,
            checkpointId: current.id,
            code: current.code,
            title: current.title,
            status,
            description,
            audioBlob: voice.audioKey ? null : voice.playback,
            audioKey: voice.audioKey,
            fixedTime,
          }

          return {
            checkpoints,
            outbox: [...state.outbox, event],
          }
        })
        await get().triggerSync()
      },
      updateLaunchTracker: (launchId, newTracker) =>
        set((state) => {
          const launches = state.launches.map((launch) => {
            if (launch.id !== launchId) return launch
            const tracker = newTracker?.trim() ?? ''
            return { ...launch, trackerNumber: tracker }
          })
          return {
            launches,
            activeLaunch: findActiveLaunch(launches),
          }
        }),
      submitLaunch: async (launchId, status, description, audioBlob) => {
        const reported = status === 'SUCCESS' || status === 'FAILED'
        const target = await resolveReportedLaunch(get, launchId, reported)
        if (!target) return

        const voice = await storeVoice(audioBlob)
        const actualLaunchTime = formatClock(new Date())
        const playback = voice.playback && voice.playback.length < 180000 ? voice.playback : null

        let queued = false
        set((state) => {
          const current = state.launches.find((launch) => launch.id === target.id)
          if (!current) return state

          const next: LaunchItem = {
            ...current,
            status,
            description,
            comment: description,
            audioBlob: playback,
            time: reported ? actualLaunchTime : current.time,
            fixedTime: reported ? actualLaunchTime : current.fixedTime,
            wasPostponed: status === 'POSTPONED' || current.wasPostponed,
          }
          const launches =
            status === 'POSTPONED'
              ? [...state.launches.filter((launch) => launch.id !== target.id), next]
              : state.launches.map((launch) => (launch.id === target.id ? next : launch))

          if (!reported) {
            return {
              launches,
              activeLaunch: findActiveLaunch(launches),
            }
          }

          const event: LaunchOutboxEvent = {
            id: crypto.randomUUID(),
            login: state.login,
            launchId: current.id,
            orderNumber: current.orderNumber,
            routeId: current.routeId,
            droneNumber: current.droneNumber,
            trackerNumber: current.trackerNumber,
            status,
            description,
            audioBlob: voice.audioKey ? null : playback,
            audioKey: voice.audioKey,
            time: actualLaunchTime,
          }
          queued = true

          return {
            launches,
            activeLaunch: findActiveLaunch(launches),
            outbox: [...state.outbox, event],
          }
        })
        if (queued) await get().triggerSync()
      },
      confirmLaunches: async () => {
        const started = Date.now()
        while (get().isSyncing && Date.now() - started < 8000) {
          await new Promise((resolve) => {
            setTimeout(resolve, 50)
          })
        }
        const queued = get().outbox.some((item) => 'launchId' in item)
        const launchSyncNotice: LaunchSyncNotice = queued ? 'queued' : 'synced'
        set({ launchSyncNotice, currentScreen: 5 })
      },
      closeShift: async () => {
        set((state) => {
          const queuedCheckpointIds = new Set(
            state.outbox.flatMap((item) => ('checkpointId' in item ? [item.checkpointId] : [])),
          )
          const finalEvents = state.checkpoints.flatMap((point) => {
            if (point.id < 4 || point.fixedTime === null) return []
            if (point.status !== 'SUCCESS' && point.status !== 'FAILED') return []
            if (queuedCheckpointIds.has(point.id) || point.reportId !== null) return []
            const event: OutboxEvent = {
              id: crypto.randomUUID(),
              login: state.login,
              checkpointId: point.id,
              code: point.code,
              title: point.title,
              status: point.status,
              description: point.description,
              audioBlob: point.audioBlob,
              audioKey: null,
              fixedTime: point.fixedTime,
            }
            return [event]
          })
          const alreadyClosed = state.outbox.some(
            (item) => 'kind' in item && item.kind === 'SHIFT_CLOSED',
          )
          const shiftEvent: ShiftClosedOutboxEvent | null = alreadyClosed
            ? null
            : {
                id: crypto.randomUUID(),
                login: state.login,
                kind: 'SHIFT_CLOSED',
                time: new Date().toISOString(),
              }
          const checkpoints = state.checkpoints.map((point) => {
            const created = finalEvents.find((event) => event.checkpointId === point.id)
            return created ? { ...point, reportId: created.id } : point
          })
          return {
            checkpoints,
            outbox: [...state.outbox, ...finalEvents, ...(shiftEvent ? [shiftEvent] : [])],
          }
        })

        const shiftSummary = await get().triggerSync()
        set({ currentScreen: 6, shiftSummary })
      },
      resetSession: () =>
        set({
          ...createSessionState(),
          isSyncing: false,
          isLoadingLaunches: false,
          shiftSummary: null,
          launchSyncNotice: null,
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentScreen: state.currentScreen,
        outbox: state.outbox,
        login: state.login,
        syncTime: state.syncTime,
        mission: state.mission,
        checkpoints: state.checkpoints,
        launches: state.launches,
        shiftSummary: state.shiftSummary,
        launchSyncNotice: state.launchSyncNotice,
      }),
      onRehydrateStorage: () => (state) => {
        if (typeof navigator !== 'undefined') {
          useCrewStore.getState().setOnlineStatus(navigator.onLine)
        }
        if (!state) return
        useCrewStore.setState({
          ...(state.launches ? { activeLaunch: findActiveLaunch(state.launches) } : {}),
          ...(state.checkpoints ? { checkpoints: alignCheckpoints(state.checkpoints) } : {}),
        })
      },
    },
  ),
)
