import { deleteAudio, getAudio } from '../lib/audioStore.ts'
import { supabase } from '../lib/supabase.ts'
import type { CrewOutboxItem, LaunchItem, LaunchOutboxEvent, LaunchStatus, OutboxEvent } from '../types/crew.ts'
import type { Launch } from '../types/mission.ts'

const VOICE_BUCKET = 'tactical-voice'

export interface DailyPlan {
  id: string
  crewId: string
  planDate: string
  target: string | null
  mgrs: string | null
  address: string | null
  launches: LaunchItem[]
}

export async function uploadAudio(key: string, blob: Blob, path: string): Promise<string | null> {
  if (!supabase || key === '') return null

  const objectPath = path || key
  const { error } = await supabase.storage.from(VOICE_BUCKET).upload(objectPath, blob, {
    contentType: blob.type || 'audio/ogg',
    upsert: true,
  })

  if (error) {
    const status = 'statusCode' in error ? String(error.statusCode) : ''
    if (status !== '409') return null
  }

  const { data } = supabase.storage.from(VOICE_BUCKET).getPublicUrl(objectPath)
  return data.publicUrl || null
}

export async function syncOutbox(outboxItems: CrewOutboxItem[]): Promise<string[]> {
  if (!supabase) return []

  const sent: string[] = []

  for (const event of outboxItems) {
    try {
      const delivered = await deliverEvent(event)
      if (!delivered) continue
      sent.push(event.id)
    } catch {
      continue
    }
  }

  return sent
}

export interface ActiveMission {
  launches: LaunchItem[]
  mgrs: string | null
}

export async function fetchActiveMission(crewId: string): Promise<ActiveMission | null> {
  const primary = await readActiveMission(crewId)
  if (primary && primary.launches.length > 0) return primary
  if (crewId.startsWith('crew_')) return primary
  return readActiveMission(`crew_${crewId}`)
}

async function readActiveMission(crewId: string): Promise<ActiveMission | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('launches')
    .select('*')
    .eq('battle_group_id', crewId)
    .order('created_at', { ascending: true })

  if (error || !Array.isArray(data)) return null

  const launches = data.flatMap((row, index) => {
    const launch = parseRemoteLaunch(row)
    return launch ? [toLaunchItem(launch, index)] : []
  })
  const mgrs = data.flatMap((row) => {
    const launch = parseRemoteLaunch(row)
    return launch?.aiming_point_mgrs ? [launch.aiming_point_mgrs] : []
  })[0] ?? null

  return { launches, mgrs }
}

export function toLaunchItem(launch: Launch, index: number): LaunchItem {
  return {
    id: launch.id,
    orderNumber: index + 1,
    droneName: 'Ворон',
    droneNumber: launch.asset_serial_number,
    routeId: launch.trajectory_name ?? '№1',
    trackerNumber: launch.tracker_model_serial_number,
    status: 'PENDING',
    time: null,
    wasPostponed: false,
    description: '',
    audioBlob: null,
  }
}

export async function fetchDailyPlan(crewId: string): Promise<DailyPlan | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('daily_plans')
    .select('id, crew_id, plan_date, target, mgrs, address, launches')
    .eq('crew_id', crewId)
    .eq('plan_date', currentPlanDate())
    .limit(1)

  if (error || !data) return null

  const row = Array.isArray(data) ? data[0] : data
  return parseDailyPlan(row)
}

async function deliverEvent(event: CrewOutboxItem): Promise<boolean> {
  if (!supabase) return false

  if (isCheckpointReport(event)) {
    const audioUrl = await publishedAudioUrl(event).catch(() => null)

    const { error } = await supabase.from('checkpoint_reports').insert({
      id: event.id,
      battle_group_id: event.login,
      code: event.code,
      title: event.title || event.code,
      status: event.status,
      fixed_time: event.fixedTime,
      description: event.description,
      audio_url: audioUrl,
    })

    if (error && error.code !== '23505') return false
    await clearStoredAudio(event.audioKey)
    return true
  }

  if (isLaunchReport(event)) {
    const audioUrl = await withTimeout(publishedAudioUrl(event).catch(() => null), 8000, null)
    const saved = await withTimeout(updateLaunchReport(event, audioUrl), 12000, false)
    if (!saved) return false
    await clearStoredAudio(event.audioKey)
    return true
  }

  return true
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

function missingAudioColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST204' || (error.message ?? '').includes('audio_url')
}

function launchUpdated(result: { data: unknown; error: { code?: string; message?: string } | null }): boolean {
  return !result.error && Array.isArray(result.data) && result.data.length > 0
}

async function updateLaunchReport(event: LaunchOutboxEvent, audioUrl: string | null): Promise<boolean> {
  if (!supabase) return false

  const reportedAt = new Date().toISOString()
  const base = {
    execution_status: event.status,
    actual_launch_time: event.time,
    comments: event.description,
    tracker_model_serial_number: event.trackerNumber,
    reported_at: reportedAt,
  }
  const crews = event.login.startsWith('crew_')
    ? [event.login]
    : [event.login, `crew_${event.login}`]

  const saved = await writeLaunchUpdate(event, crews, { ...base, audio_url: audioUrl })
  if (saved === true) return true
  if (saved !== 'retry') return false
  return (await writeLaunchUpdate(event, crews, base)) === true
}

async function writeLaunchUpdate(
  event: LaunchOutboxEvent,
  crews: string[],
  payload: {
    execution_status: string
    actual_launch_time: string
    comments: string
    tracker_model_serial_number: string | null
    reported_at: string
    audio_url?: string | null
  },
): Promise<boolean | 'retry'> {
  if (!supabase) return false

  if (isUuid(event.launchId)) {
    const byId = await supabase.from('launches').update(payload).eq('id', event.launchId).select('id')
    if (launchUpdated(byId)) return true
    if (missingAudioColumn(byId.error)) return 'retry'
  }

  const serial = event.droneNumber
  if (!serial) return false
  const bySerial = await supabase
    .from('launches')
    .update(payload)
    .eq('asset_serial_number', serial)
    .in('battle_group_id', crews)
    .select('id')
  if (launchUpdated(bySerial)) return true
  if (missingAudioColumn(bySerial.error)) return 'retry'
  return false
}

async function publishedAudioUrl(event: OutboxEvent | LaunchOutboxEvent): Promise<string | null> {
  const stamp = 'fixedTime' in event ? event.fixedTime : event.time
  const key = event.audioKey || event.id

  if (event.audioKey) {
    const stored = await getAudio(event.audioKey).catch(() => null)
    if (stored) {
      return uploadAudio(event.audioKey, stored, audioObjectPath(event.login, stamp, event.audioKey))
    }
  }

  if (!event.audioBlob) return null
  const blob = blobFromDataUrl(event.audioBlob)
  if (!blob) return null
  return uploadAudio(key, blob, audioObjectPath(event.login, stamp, key))
}

async function clearStoredAudio(audioKey: string | null): Promise<void> {
  if (!audioKey) return
  try {
    await deleteAudio(audioKey)
  } catch {
    return
  }
}

function audioObjectPath(crewId: string, stamp: string, filename: string): string {
  const safeStamp = stamp.replace(/[^\d]/g, '') || String(Date.now())
  const safeName = filename.replace(/[^\w.-]/g, '_')
  return `${crewId}/${safeStamp}_${safeName}.ogg`
}

function blobFromDataUrl(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return null

  const mime = match[1] || 'audio/ogg'
  const payload = match[3] ?? ''

  try {
    if (match[2]) {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
      return new Blob([bytes], { type: mime })
    }

    return new Blob([decodeURIComponent(payload)], { type: mime })
  } catch {
    return null
  }
}

function currentPlanDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function parseDailyPlan(row: unknown): DailyPlan | null {
  if (!isRecord(row)) return null
  if (typeof row.id !== 'string' || typeof row.crew_id !== 'string') return null
  if (typeof row.plan_date !== 'string') return null

  return {
    id: row.id,
    crewId: row.crew_id,
    planDate: row.plan_date,
    target: typeof row.target === 'string' ? row.target : null,
    mgrs: typeof row.mgrs === 'string' ? row.mgrs : null,
    address: typeof row.address === 'string' ? row.address : null,
    launches: parseLaunches(row.launches),
  }
}

function parseLaunches(value: unknown): LaunchItem[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item, index) => {
    const launch = parseLaunch(item, index)
    return launch ? [launch] : []
  })
}

function parseLaunch(value: unknown, index: number): LaunchItem | null {
  if (!isRecord(value)) return null

  const droneName = readString(value, 'droneName', 'drone_name') ?? 'Ворон'
  const droneNumber = readNumber(value, 'droneNumber', 'drone_number')
  const serial = readString(value, 'droneNumber', 'drone_number', 'asset_serial_number')
  if (!serial && droneNumber === null) return null

  const id = readString(value, 'id') ?? String(index + 1)
  const tracker = readString(value, 'trackerNumber', 'tracker_number')
  const route = readString(value, 'routeId', 'route_id', 'trajectory_name')

  return {
    id,
    orderNumber: readNumber(value, 'orderNumber', 'order_number') ?? index + 1,
    routeId: route ?? `№${index + 1}`,
    droneName,
    droneNumber: serial ?? String(droneNumber),
    trackerNumber: tracker,
    status: readLaunchStatus(value.status),
    time: typeof value.time === 'string' ? value.time : null,
    wasPostponed: value.wasPostponed === true || value.was_postponed === true,
    description: typeof value.description === 'string' ? value.description : '',
    audioBlob: typeof value.audioBlob === 'string' ? value.audioBlob : null,
  }
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return null
}

function readLaunchStatus(value: unknown): LaunchStatus {
  if (value === 'PENDING' || value === 'POSTPONED' || value === 'SUCCESS' || value === 'FAILED') {
    return value
  }
  return 'PENDING'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRemoteLaunch(value: unknown): Launch | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.asset_serial_number !== 'string') return null
  if (typeof value.aiming_point_mgrs !== 'string') return null

  return {
    id: value.id,
    task_id: readString(value, 'task_id') ?? '',
    battle_group_id: readString(value, 'battle_group_id') ?? '',
    allocation_line_id: readString(value, 'allocation_line_id'),
    asset_id: readString(value, 'asset_id') ?? '',
    asset_serial_number: value.asset_serial_number,
    tracker_model_id: readString(value, 'tracker_model_id'),
    tracker_model_serial_number: readString(value, 'tracker_model_serial_number'),
    aiming_point_mgrs: value.aiming_point_mgrs,
    trajectory_name: readString(value, 'trajectory_name'),
    ammo_model_id: readString(value, 'ammo_model_id') ?? '',
    ammo_quantity: readNumber(value, 'ammo_quantity') ?? 0,
    created_at: readString(value, 'created_at') ?? '',
    updated_at: readString(value, 'updated_at') ?? '',
    archived_at: readString(value, 'archived_at'),
    reported_at: readString(value, 'reported_at'),
    reported_at_time: readString(value, 'reported_at_time'),
    processed_at: readString(value, 'processed_at'),
    launch_status_id: readString(value, 'launch_status_id') ?? '',
    cause_launch_problem_id: readString(value, 'cause_launch_problem_id') ?? '',
    comments: typeof value.comments === 'string' ? value.comments : '',
    actual_launch_time: readString(value, 'actual_launch_time'),
    execution_status: readString(value, 'execution_status'),
    bda_result: readString(value, 'bda_result'),
    audio_url: readString(value, 'audio_url'),
  }
}

function isCheckpointReport(event: CrewOutboxItem): event is OutboxEvent {
  return 'checkpointId' in event
}

function isLaunchReport(event: CrewOutboxItem): event is LaunchOutboxEvent {
  return 'launchId' in event
}
