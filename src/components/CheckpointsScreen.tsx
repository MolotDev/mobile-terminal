import { MicIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Checkpoint, SubmittedStatus } from '../types/crew.ts'
import { useCrewStore } from '../stores/useCrewStore.ts'
import { LiveClock } from './LiveClock.tsx'
import { DraftVoiceNote, VoiceNote } from './VoiceNote.tsx'

export function CheckpointsScreen() {
  const checkpoints = useCrewStore((state) => state.checkpoints)
  const completedCheckpoints = useCrewStore((state) => state.completedCheckpoints)
  const currentScreen = useCrewStore((state) => state.currentScreen)
  const submitCheckpoint = useCrewStore((state) => state.submitCheckpoint)
  const closeShift = useCrewStore((state) => state.closeShift)
  const launchSyncNotice = useCrewStore((state) => state.launchSyncNotice)
  const setScreen = useCrewStore((state) => state.setScreen)
  const [description, setDescription] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failHint, setFailHint] = useState(false)
  const [closing, setClosing] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const aliveRef = useRef(true)

  const returning = currentScreen === 5
  const routePoints = checkpoints.filter((point) =>
    returning ? point.id >= 4 : point.id <= 3,
  )
  const isPassed = (point: Checkpoint) =>
    point.status !== 'PENDING' || Boolean(completedCheckpoints[point.code])
  const active = routePoints.find((point) => !isPassed(point)) ?? null
  const allCompleted = routePoints.every((point) => isPassed(point))
  const crewReturned = routePoints.some((point) => point.id === 5 && isPassed(point))

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    setDescription('')
    setAudioBlob(null)
    setNotice(null)
    setFailHint(false)
  }, [active?.id])

  useEffect(() => {
    setFailHint(false)
  }, [description, audioBlob, recording])

  async function stopRecording(): Promise<Blob | null> {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return audioBlob

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        if (aliveRef.current) {
          setAudioBlob(blob)
          setRecording(false)
        }
        resolve(blob)
      }
      recorder.stop()
    })
  }

  async function toggleRecording() {
    if (recording) {
      await stopRecording()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice('Мікрофон недоступний у цьому браузері')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      streamRef.current = stream
      recorderRef.current = recorder
      recorder.start()
      setAudioBlob(null)
      setRecording(true)
      setNotice(null)
    } catch {
      setNotice('Не вдалося увімкнути мікрофон')
    }
  }

  async function handleCloseShift() {
    if (closing) return
    setClosing(true)
    try {
      await closeShift()
    } finally {
      if (aliveRef.current) setClosing(false)
    }
  }

  async function handleSubmit(status: SubmittedStatus) {
    if (!active || completedCheckpoints[active.code]) return
    const hasProblemNote = description.trim() !== '' || recording || audioBlob !== null
    if (status === 'FAILED' && !hasProblemNote) {
      setFailHint(true)
      return
    }
    setFailHint(false)
    try {
      const note = recording ? await stopRecording() : audioBlob
      await submitCheckpoint(active.id, status, description, note)
      setNotice(null)
    } catch {
      setNotice('Не вдалося зберегти контрольну точку')
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <h1
        className={
          returning
            ? 'font-bebas text-xl uppercase tracking-wider text-sbs-white'
            : 'font-bebas text-[24px] uppercase tracking-wider'
        }
      >
        {returning ? 'Повернення · Контрольні точки' : 'Контрольні точки'}
      </h1>
      {returning && launchSyncNotice === 'synced' ? (
        <p className="border border-tactical-success/40 bg-sbs-dark px-3 py-3 text-sm text-tactical-success" role="status">
          Дані про пуски синхронізовано успішно
        </p>
      ) : null}
      {returning && launchSyncNotice === 'queued' ? (
        <p className="border border-sbs-sky/40 bg-sbs-dark px-3 py-3 text-sm text-sbs-sky" role="status">
          Дані про пуски готові для збереження. Очікую підключення до мережі.
        </p>
      ) : null}
      <ol className="flex flex-col gap-3">
        {routePoints.map((point, index) => (
          <CheckpointCard
            key={point.id}
            point={point}
            locked={index > 0 && routePoints[index - 1] !== undefined && !isPassed(routePoints[index - 1])}
            active={point.id === active?.id}
            description={description}
            recording={recording}
            draftAudio={point.id === active?.id ? audioBlob : null}
            failHint={point.id === active?.id && failHint}
            onDescription={setDescription}
            onDiscard={() => setAudioBlob(null)}
            onToggleRecording={() => {
              void toggleRecording()
            }}
            onSubmit={(status) => {
              void handleSubmit(status)
            }}
          />
        ))}
      </ol>
      {notice ? (
        <p className="text-sm text-tactical-warning" role="status">
          {notice}
        </p>
      ) : null}
      {returning ? (
        <button
          type="button"
          disabled={!crewReturned || closing}
          onClick={() => {
            void handleCloseShift()
          }}
          className={
            crewReturned && !closing
              ? 'pixel-cut mt-auto flex h-14 min-h-14 max-h-14 items-center justify-center overflow-hidden bg-gradient-sbs px-3 py-0 font-bebas text-xl leading-none tracking-wider text-sbs-white'
              : 'mt-auto flex h-14 min-h-14 max-h-14 cursor-not-allowed items-center justify-center overflow-hidden border border-sbs-light/10 bg-sbs-dark/40 px-3 py-0 font-bebas text-xl leading-none tracking-wider text-sbs-light/30'
          }
        >
          {crewReturned ? 'Завершити зміну' : 'Очікується повернення екіпажу'}
        </button>
      ) : (
        <button
          type="button"
          disabled={!allCompleted}
          onClick={() => setScreen(4)}
          className={
            allCompleted
              ? 'pixel-cut mt-auto flex h-14 min-h-14 max-h-14 items-center justify-center overflow-hidden bg-gradient-sbs px-3 py-0 font-bebas text-xl leading-none tracking-wider text-sbs-white shadow-[0_0_20px_rgba(45,137,202,0.35)]'
              : 'mt-auto flex h-14 min-h-14 max-h-14 cursor-not-allowed items-center justify-center overflow-hidden border border-sbs-light/10 bg-sbs-dark/40 px-3 py-0 font-bebas text-xl leading-none tracking-wider text-sbs-light/30'
          }
        >
          Звітувати про пуски
        </button>
      )}
    </section>
  )
}

function CheckpointCard({
  point,
  locked,
  active,
  description,
  recording,
  draftAudio,
  failHint,
  onDescription,
  onDiscard,
  onToggleRecording,
  onSubmit,
}: {
  point: Checkpoint
  locked: boolean
  active: boolean
  description: string
  recording: boolean
  draftAudio: Blob | null
  failHint: boolean
  onDescription: (value: string) => void
  onDiscard: () => void
  onToggleRecording: () => void
  onSubmit: (status: SubmittedStatus) => void
}) {
  return (
    <li
      className={
        active
          ? 'hud-bracket-box border border-sbs-sky bg-sbs-dark p-3'
          : 'bg-sbs-dark p-3 opacity-70'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bebas text-xl uppercase tracking-wider">{point.title}</h2>
        {locked || point.status !== 'PENDING' ? (
          <p className="shrink-0 font-handjet text-lg text-sbs-white">
            {locked ? '--:--:--' : (point.fixedTime ?? '--:--:--')}
          </p>
        ) : (
          <LiveClock className="shrink-0 font-handjet text-lg text-sbs-white" />
        )}
      </div>
      {locked ? (
        <p className="mt-3 text-sm text-sbs-light">
          🔒 Очікує проходження попередньої точки
        </p>
      ) : null}
      {point.status !== 'PENDING' ? (
        <p
          className={`mt-2 text-sm ${
            point.status === 'SUCCESS' ? 'text-tactical-success' : 'text-tactical-warning'
          }`}
        >
          {point.status === 'SUCCESS' ? '✓ Успішно' : '✕ Неуспішно'}
        </p>
      ) : null}
      {point.status !== 'PENDING' && point.description !== '' ? (
        <p className="mt-1 truncate font-fixel text-xs text-sbs-light/80">{point.description}</p>
      ) : null}
      {active ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              value={description}
              onChange={(event) => onDescription(event.target.value)}
              aria-label="Примітка"
              className="h-12 min-w-0 flex-1 bg-sbs-black px-3 font-fixel text-sbs-white outline-none ring-sbs-sky focus:ring-1"
            />
            <button
              type="button"
              aria-pressed={recording}
              aria-label="Голосова нотатка"
              onClick={onToggleRecording}
              className={`flex h-12 min-h-12 max-h-12 w-12 shrink-0 items-center justify-center ${
                recording ? 'bg-tactical-danger text-sbs-white' : 'bg-sbs-black text-sbs-white'
              }`}
            >
              <MicIcon size={18} aria-hidden="true" />
            </button>
          </div>
          {recording ? (
            <p className="font-handjet text-sm text-tactical-danger">Запис…</p>
          ) : null}
          {draftAudio ? <DraftVoiceNote blob={draftAudio} onDelete={onDiscard} /> : null}
          {failHint ? (
            <p className="text-xs text-tactical-warning" role="status">
              Для «Неуспішно» потрібен опис проблеми або голосове повідомлення
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSubmit('FAILED')}
              className="flex h-11 min-h-11 max-h-11 items-center justify-center overflow-hidden border border-tactical-warning bg-sbs-dark px-3 py-0 font-bebas text-base leading-none tracking-wider text-tactical-warning"
            >
              ✕ Неуспішно
            </button>
            <button
              type="button"
              onClick={() => onSubmit('SUCCESS')}
              className="flex h-11 min-h-11 max-h-11 items-center justify-center overflow-hidden bg-tactical-success px-3 py-0 font-bebas text-base leading-none tracking-wider text-sbs-black"
            >
              ✓ Успішно
            </button>
          </div>
        </div>
      ) : null}
      {!active && !locked && point.audioBlob ? (
        <div className="mt-3">
          <VoiceNote src={point.audioBlob} />
        </div>
      ) : null}
    </li>
  )
}
