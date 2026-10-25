import { DeleteIcon, ListEndIcon, MicIcon, SearchCheckIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LaunchItem, LaunchStatus } from '../types/crew.ts'
import { useCrewStore } from '../stores/useCrewStore.ts'
import { LiveClock } from './LiveClock.tsx'
import { DraftVoiceNote, VoiceNote } from './VoiceNote.tsx'

type LastResult = {
  orderNumber: number
  droneName: string
  droneNumber: string
  hasTracker: boolean
  status: 'SUCCESS' | 'FAILED' | 'POSTPONED'
}

function isOpen(launch: LaunchItem): boolean {
  return launch.status === 'PENDING' || launch.status === 'POSTPONED'
}

function resultTone(status: LastResult['status']): { text: string; className: string } {
  if (status === 'SUCCESS') return { text: '✓ Успішно', className: 'text-tactical-success' }
  if (status === 'FAILED') return { text: '✕ Неуспішно', className: 'text-tactical-danger' }
  return { text: '⏱ Відкладено', className: 'text-sbs-light' }
}

function formatFixation(time: string | null): string {
  if (!time) return '--.-- --:--'
  const clock = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time.trim())
  if (clock) {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${day}.${month} ${clock[1]}:${clock[2]}`
  }
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return '--.-- --:--'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}.${month} ${hours}:${minutes}`
}

function LaunchSummaryStatus({ launch }: { launch: LaunchItem }) {
  if (launch.status === 'SUCCESS' && launch.wasPostponed) {
    return <span className="w-24 text-right font-fixel text-xs text-sbs-light">⏱ Перенесено</span>
  }
  if (launch.status === 'SUCCESS') {
    return (
      <span className="w-24 text-right font-fixel text-xs text-tactical-success">✓ Успішно</span>
    )
  }
  if (launch.status === 'FAILED') {
    return (
      <span className="w-24 text-right font-fixel text-xs text-tactical-danger">✕ Неуспішно</span>
    )
  }
  return <span className="w-24 shrink-0" />
}

function editDistance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  )
  for (let row = 0; row <= left.length; row += 1) {
    const line = rows[row]
    if (line) line[0] = row
  }
  const first = rows[0]
  if (first) {
    for (let column = 0; column <= right.length; column += 1) first[column] = column
  }
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const current = rows[row]
      const previous = rows[row - 1]
      if (!current || !previous) continue
      const cost = left[row - 1] === right[column - 1] ? 0 : 1
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      )
    }
  }
  return rows[left.length]?.[right.length] ?? 0
}

function closestDroneNumbers(launches: LaunchItem[], needle: string): string[] {
  const target = Number(needle)
  const unique = [...new Set(launches.filter(isOpen).map((launch) => launch.droneNumber))]
  return unique
    .map((number) => {
      const numericValue = Number(number)
      const numeric =
        Number.isFinite(target) && Number.isFinite(numericValue) ? Math.abs(numericValue - target) : 0
      return { number, score: editDistance(number, needle) * 1000 + numeric }
    })
    .sort((left, right) => left.score - right.score || left.number.localeCompare(right.number))
    .slice(0, 3)
    .map((item) => item.number)
}

export function LaunchesScreen() {
  const launches = useCrewStore((state) => state.launches)
  const activeLaunch = useCrewStore((state) => state.activeLaunch)
  const updateLaunchTracker = useCrewStore((state) => state.updateLaunchTracker)
  const submitLaunch = useCrewStore((state) => state.submitLaunch)
  const confirmLaunches = useCrewStore((state) => state.confirmLaunches)
  const isLoadingLaunches = useCrewStore((state) => state.isLoadingLaunches)
  const [query, setQuery] = useState('')
  const [description, setDescription] = useState('')
  const [trackerDraft, setTrackerDraft] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [heldId, setHeldId] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<LastResult | null>(null)
  const transitionRef = useRef<number | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const aliveRef = useRef(true)

  const needle = query.trim()
  const exact = launches.find((launch) => isOpen(launch) && String(launch.droneNumber) === needle)
  const missing = needle !== '' && !exact
  const suggestions = missing ? closestDroneNumbers(launches, needle) : []
  const queued =
    launches.find((launch) => launch.id === activeLaunch?.id && isOpen(launch)) ??
    launches.find((launch) => isOpen(launch)) ??
    null
  const shown = exact && isOpen(exact) ? exact : queued
  const finished = activeLaunch === null
  const heldLaunch = launches.find((launch) => launch.id === heldId) ?? null
  const card = finished && isTransitioning ? heldLaunch : shown
  const liveClock = card != null && card.status !== 'SUCCESS' && card.status !== 'FAILED'

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (transitionRef.current !== null) window.clearTimeout(transitionRef.current)
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!shown && isTransitioning) return
    setDescription(shown?.description ?? '')
    setTrackerDraft('')
    setAudioBlob(null)
    setNotice(null)
  }, [shown?.id, shown?.description])

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

  function commitTracker() {
    if (!shown || shown.trackerNumber) return
    const tracker = trackerDraft.trim()
    if (tracker === '') return
    updateLaunchTracker(shown.id, tracker)
  }

  async function handleSubmit(status: LaunchStatus) {
    if (!shown || isTransitioning) return
    if (status !== 'SUCCESS' && status !== 'FAILED' && status !== 'POSTPONED') return
    if (!shown.trackerNumber) commitTracker()
    if (
      (status === 'SUCCESS' || status === 'FAILED') &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shown.id)
    ) {
      console.error('Invalid launch ID for update:', shown.id)
    }
    setQuery('')
    const result: LastResult = {
      orderNumber: shown.orderNumber,
      droneName: shown.droneName,
      droneNumber: shown.droneNumber,
      hasTracker: Boolean(shown.trackerNumber) || trackerDraft.trim() !== '',
      status,
    }
    setHeldId(shown.id)
    setLastResult(result)
    setIsTransitioning(true)
    try {
      const note = recording ? await stopRecording() : audioBlob
      await submitLaunch(shown.id, status, description, note)
      setNotice(null)
    } catch {
      setLastResult(null)
      setHeldId(null)
      setIsTransitioning(false)
      setNotice('Не вдалося зберегти пуск')
      return
    }
    if (transitionRef.current !== null) window.clearTimeout(transitionRef.current)
    transitionRef.current = window.setTimeout(() => {
      transitionRef.current = null
      setIsTransitioning(false)
      setHeldId(null)
      if (!useCrewStore.getState().activeLaunch) setLastResult(null)
    }, 2000)
  }

  if (isLoadingLaunches && launches.length === 0) {
    return (
      <section className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-center font-handjet text-lg tracking-wider text-sbs-sky">
          [ ЗАВАНТАЖЕННЯ БОЙОВОГО НАРЯДУ... ]
        </p>
      </section>
    )
  }

  if (launches.length === 0) {
    return (
      <section className="flex min-h-full flex-1 items-center justify-center">
        <p className="hud-bracket-box bg-sbs-dark px-4 py-6 text-center font-bebas text-xl tracking-wider text-sbs-white">
          [ БОЙОВИХ ЗАВДАНЬ ДЛЯ ЕКІПАЖУ НЕ ЗНАЙДЕНО ]
        </p>
      </section>
    )
  }

  return (
    <section
      className={`flex min-h-full flex-1 flex-col gap-4 ${finished ? 'justify-center' : ''}`}
    >
      {lastResult && activeLaunch ? (
        <article className="hud-bracket-box flex items-center gap-2 border border-sbs-sky/50 bg-sbs-dark/80 px-3 py-2">
          <p className="min-w-0 flex-1 truncate font-fixel text-sm text-sbs-white">
            #{lastResult.orderNumber} {lastResult.droneName} ·SN-{lastResult.droneNumber} (
            {lastResult.hasTracker ? '+T' : '-T'})
          </p>
          <p className={`shrink-0 font-fixel text-sm ${resultTone(lastResult.status).className}`}>
            {resultTone(lastResult.status).text}
          </p>
        </article>
      ) : null}
      <div className="flex flex-col gap-2">
        {finished && !isTransitioning ? null : (
          <label className="search-field flex h-12 items-center gap-2 bg-sbs-dark px-3">
            <SearchCheckIcon size={18} className="shrink-0 text-sbs-light" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Пошук за номером засобу"
              aria-label="Пошук засобу"
              className="h-12 min-w-0 flex-1 bg-transparent font-fixel text-sbs-white outline-none placeholder:text-sbs-light/60"
            />
          </label>
        )}
        {!isTransitioning && missing ? (
          <article className="hud-bracket-box flex flex-col gap-4 bg-sbs-dark p-4">
            <p className="text-sm text-tactical-warning" role="status">
              Засобу із таким номером серед запланованих пусків не знайдено.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {suggestions.map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setQuery(String(number))}
                  className="h-12 min-h-12 max-h-12 bg-sbs-black font-handjet text-sbs-sky"
                >
                  №{number}
                </button>
              ))}
            </div>
          </article>
        ) : card ? (
          <div className="relative">
            <article
              className={`hud-bracket-box bg-sbs-dark p-4 ${
                isTransitioning ? 'pointer-events-none select-none blur-[2px]' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h1 className="font-bebas text-xl uppercase tracking-wider">
                  Пуск №{card.orderNumber}
                </h1>
                {liveClock ? (
                  <LiveClock className="shrink-0 font-handjet text-lg text-sbs-white" />
                ) : (
                  <p className="shrink-0 font-handjet text-lg text-sbs-white">
                    {card.fixedTime ?? card.time ?? '--:--:--'}
                  </p>
                )}
              </div>
              <p className="mt-3 text-sm text-sbs-light">
                Засіб: {card.droneName} · №{card.droneNumber}
              </p>
              <div className="mt-4">
                {card.trackerNumber ? (
                  <div className="flex items-center gap-2">
                    <span className="flex h-12 min-w-0 flex-1 items-center gap-2 bg-sbs-black px-3">
                      <span className="shrink-0 font-fixel text-sm text-sbs-light">Трекер</span>
                      <span className="min-w-0 truncate font-handjet text-sbs-white">
                        {card.trackerNumber}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTrackerDraft('')
                        updateLaunchTracker(card.id, null)
                      }}
                      aria-label="Прибрати трекер"
                      className="flex h-12 min-h-12 max-h-12 w-12 shrink-0 items-center justify-center border border-sbs-light/30 text-sbs-light"
                    >
                      <DeleteIcon size={18} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <label className="tracker-field flex h-12 w-full items-center gap-2 bg-sbs-black px-3">
                    <span className="shrink-0 font-fixel text-sm text-sbs-light">Трекер</span>
                    <input
                      value={trackerDraft}
                      onChange={(event) => setTrackerDraft(event.target.value)}
                      onBlur={commitTracker}
                      placeholder="Введіть № трекера"
                      aria-label="Номер трекера"
                      className="h-12 min-w-0 flex-1 bg-transparent font-fixel text-sbs-white outline-none placeholder:text-sbs-light/60"
                    />
                  </label>
                )}
              </div>
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Коментар"
                    aria-label="Коментар"
                    className="h-12 min-w-0 flex-1 bg-sbs-black px-3 font-fixel text-sbs-white outline-none placeholder:text-sbs-light/60"
                  />
                  <button
                    type="button"
                    aria-pressed={recording}
                    aria-label="Голосова нотатка"
                    onClick={() => {
                      void toggleRecording()
                    }}
                    className={`flex h-12 min-h-12 max-h-12 w-12 shrink-0 items-center justify-center ${
                      recording ? 'bg-tactical-danger text-sbs-white' : 'bg-sbs-black text-sbs-white'
                    }`}
                  >
                    <MicIcon size={18} aria-hidden="true" />
                  </button>
                </div>
                {recording ? (
                  <p className="mt-2 font-handjet text-sm text-tactical-danger">Запис…</p>
                ) : null}
                {audioBlob ? (
                  <div className="mt-2">
                    <DraftVoiceNote blob={audioBlob} onDelete={() => setAudioBlob(null)} />
                  </div>
                ) : null}
                {!audioBlob && card.audioBlob ? (
                  <div className="mt-2">
                    <VoiceNote src={card.audioBlob} />
                  </div>
                ) : null}
              </div>
              {notice ? (
                <p className="mt-3 text-sm text-tactical-warning" role="status">
                  {notice}
                </p>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleSubmit('FAILED')
                  }}
                  className="flex h-12 min-h-12 max-h-12 items-center justify-center gap-2 overflow-hidden border border-tactical-warning bg-sbs-dark font-bebas text-base leading-none tracking-wider text-tactical-warning"
                >
                  ✕ Неуспішно
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSubmit('POSTPONED')
                  }}
                  className="flex h-12 min-h-12 max-h-12 items-center justify-center gap-2 overflow-hidden border border-sbs-light/40 bg-sbs-dark font-bebas text-base leading-none tracking-wider text-sbs-light"
                >
                  <ListEndIcon
                    size={18}
                    className="[transform:rotateY(180deg)]"
                    aria-hidden="true"
                  />
                  Відкласти
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleSubmit('SUCCESS')
                }}
                className="pixel-cut mt-2 flex h-14 min-h-14 max-h-14 w-full items-center justify-center overflow-hidden bg-tactical-success px-3 py-0 font-bebas text-xl leading-none tracking-wider text-sbs-black"
              >
                ✓ Успішно
              </button>
            </article>
            {isTransitioning ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="bg-sbs-black px-4 py-3 font-handjet text-sm tracking-widest text-sbs-sky">
                  ⏳ СИНХРОНІЗАЦІЯ ДАНИХ ПРО ПУСКИ...
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {finished && !isTransitioning ? (
          <div
            className={`hud-bracket-box max-h-64 overflow-y-auto bg-sbs-dark/50 ${
              finished ? '' : 'mt-auto flex-1'
            }`}
          >
            <ul>
              {[...launches]
                .sort((left, right) => left.orderNumber - right.orderNumber)
                .map((launch) => (
                  <li
                    key={launch.id}
                    className="flex items-center border-b border-sbs-light/10 px-3 py-1.5"
                  >
                    <span className="w-24 shrink-0 font-handjet text-md text-sbs-white">
                      {formatFixation(launch.time)}
                    </span>
                    <span className="flex-1 font-fixel text-sm font-semibold text-sbs-light">
                      S.N-{launch.droneNumber} [{launch.trackerNumber ? ' +T ' : ' -T '}]
                    </span>
                    <LaunchSummaryStatus launch={launch} />
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col">
            <p className="py-1 text-center font-handjet text-xl text-sbs-light">
              <span>
                {`Успішних: `}
                <span className="text-tactical-success">
                  {launches.filter((launch) => launch.status === 'SUCCESS').length}
                </span>
              </span>
              <span> · </span>
              <span>
                {`Неуспішних: `}
                <span className="text-tactical-danger">
                  {launches.filter((launch) => launch.status === 'FAILED').length}
                </span>
              </span>
            </p>
            <p className="py-1 text-center font-handjet text-xl text-sbs-light">
              <span>
                {`Залишилося:  ${launches.filter(isOpen).length}`}
                <span className="text-sbs-sky">
                  
                </span>
              </span>
            </p>
          </div>
      )}
      {finished && !isTransitioning ? (
        <button
          type="button"
          onClick={() => {
            void confirmLaunches()
          }}
          className="pixel-cut flex h-[56px] max-h-[56px] min-h-[56px] items-center justify-center overflow-hidden bg-gradient-sbs px-3 py-0 font-bebas text-xl leading-none tracking-wider text-sbs-white"
        >
          Підтвердити виконання пусків
        </button>
      ) : null}
    </section>
  )
}
