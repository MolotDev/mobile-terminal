import { deleteAudio, getAudio } from '../lib/audioStore.ts'
import { supabase } from '../lib/supabase.ts'
import {
  DEFAULT_TASK_ID,
  type CrewOutboxItem,
  type LaunchItem,
  type LaunchOutboxEvent,
  type LaunchStatus,
  type OutboxEvent,
} from '../types/crew.ts'
import type { Launch } from '../types/mission.ts'

const VOICE_BUCKET = 'tactical-voice'

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
  if (!supabase) return null

  const { data, error } = await supabase
    .from('launches')
    .select('*')
    .eq('battle_group_id', crewId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[LOAD ERROR]:', error)
    return null
  }
  if (!Array.isArray(data)) return { launches: [], mgrs: null }

  const launches = data.flatMap((row, index) => {
    const launch = parseRemoteLaunch(row)
    const item = launch ? toLaunchItem(launch, index) : null
    return item ? [item] : []
  })
  const mgrs = launches.find((launch) => launch.targetMgrs !== '')?.targetMgrs ?? null

  return { launches, mgrs }
}

export function toLaunchItem(launch: Launch, index: number): LaunchItem | null {
  if (!isUuid(launch.id)) return null
  return {
    id: launch.id,
    taskId: launch.task_id,
    battleGroupId: launch.battle_group_id,
    orderNumber: index + 1,
    droneName: 'Ворон',
    droneNumber: launch.asset_serial_number,
    routeId: launch.trajectory_name ?? '№1',
    trackerNumber: launch.tracker_model_serial_number || '',
    targetMgrs: launch.aiming_point_mgrs,
    status: readLaunchStatus(launch.execution_status),
    time: launch.actual_launch_time,
    fixedTime: launch.actual_launch_time,
    wasPostponed: false,
    description: launch.comments || '',
    comment: launch.comments || '',
    audioBlob: null,
  }
}

async function deliverEvent(event: CrewOutboxItem): Promise<boolean> {
  if (!supabase) return false

  if (isCheckpointReport(event)) {
    const audioUrl = await publishedAudioUrl(event).catch(() => null)

    try {
      await insertCheckpointReport({
        id: event.id,
        task_id: event.taskId || DEFAULT_TASK_ID,
        battle_group_id: event.login,
        checkpoint_id: event.code,
        code: event.code,
        title: event.title || event.code,
        status: event.status,
        fixed_time: event.fixedTime,
        description: event.description,
        audio_url: audioUrl,
      })
    } catch (error) {
      if (!isUniqueViolation(error)) return false
    }
    await clearStoredAudio(event.audioKey)
    return true
  }

  if (isLaunchReport(event)) {
    try {
      await insertLaunchReport({
        id: event.id,
        launch_id: event.launchId,
        task_id: event.taskId || DEFAULT_TASK_ID,
        battle_group_id: event.battleGroupId || event.login,
        status: event.status,
        actual_launch_time: event.time,
        comments: event.description,
        tracker_model_serial_number: event.trackerNumber,
      })
    } catch (error) {
      if (!isUniqueViolation(error)) return false
    }
    await clearStoredAudio(event.audioKey)
    return true
  }

  return true
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function insertLaunchReport(payload: {
  id?: string
  launch_id: string
  task_id: string
  battle_group_id: string
  status: 'SUCCESS' | 'FAILED'
  actual_launch_time: string
  comments?: string
  tracker_model_serial_number?: string | null
  reported_by_role?: 'CREW'
  source_channel?: 'TERMINAL'
}) {
  if (!supabase) throw new Error('Supabase client is unavailable')
  if (!isUuid(payload.launch_id)) {
    console.error('Invalid launch ID for update:', payload.launch_id)
    throw new Error('Invalid launch ID')
  }

  const { data, error } = await supabase
    .from('launch_reports')
    .insert([
      {
        ...(payload.id ? { id: payload.id } : {}),
        launch_id: payload.launch_id,
        task_id: payload.task_id,
        battle_group_id: payload.battle_group_id,
        status: payload.status,
        actual_launch_time: payload.actual_launch_time,
        comments: payload.comments || '',
        tracker_model_serial_number: payload.tracker_model_serial_number || null,
        reported_by_role: 'CREW',
        source_channel: 'TERMINAL',
        reported_at: new Date().toISOString(),
      },
    ])
    .select()

  if (error) throw error
  return data[0]
}

export async function insertCheckpointReport(payload: {
  id: string
  task_id: string
  battle_group_id: string
  checkpoint_id: string
  code: string
  title: string
  status: string
  fixed_time: string
  description: string
  audio_url: string | null
}) {
  if (!supabase) throw new Error('Supabase client is unavailable')
  const { data, error } = await supabase
    .from('checkpoint_reports')
    .insert([
      {
        id: payload.id,
        task_id: payload.task_id,
        battle_group_id: payload.battle_group_id,
        checkpoint_id: payload.checkpoint_id,
        code: payload.code,
        title: payload.title,
        status: payload.status,
        fixed_time: payload.fixed_time,
        description: payload.description,
        audio_url: payload.audio_url,
      },
    ])
    .select()

  if (error) throw error
  return data[0]
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
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
  if (value === 'pending' || value === 'PENDING') return 'PENDING'
  if (value === 'POSTPONED' || value === 'SUCCESS' || value === 'FAILED') return value
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
  }
}

function isCheckpointReport(event: CrewOutboxItem): event is OutboxEvent {
  return 'checkpointId' in event
}

function isLaunchReport(event: CrewOutboxItem): event is LaunchOutboxEvent {
  return 'launchId' in event
}
