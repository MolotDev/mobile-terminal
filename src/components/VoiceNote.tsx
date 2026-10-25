import { MicIcon, PauseIcon, PlayIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const BAR_COUNT = 24

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function samplePeaks(buffer: AudioBuffer, bars: number): number[] {
  const channel = buffer.getChannelData(0)
  if (channel.length === 0) return Array.from({ length: bars }, () => 0.2)
  const block = Math.max(1, Math.floor(channel.length / bars))
  const peaks: number[] = []
  for (let index = 0; index < bars; index += 1) {
    const start = index * block
    const end = Math.min(channel.length, start + block)
    let peak = 0
    for (let offset = start; offset < end; offset += 1) {
      peak = Math.max(peak, Math.abs(channel[offset] ?? 0))
    }
    peaks.push(peak)
  }
  const loudest = Math.max(...peaks, 0.01)
  return peaks.map((peak) => peak / loudest)
}

export function VoiceNote({
  src,
  onDelete,
}: {
  src: string
  onDelete?: () => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const bars = peaks ?? Array.from({ length: BAR_COUNT }, () => 0.35)

  useEffect(() => {
    let cancelled = false
    const context = new AudioContext()
    void (async () => {
      try {
        const response = await fetch(src)
        const bytes = await response.arrayBuffer()
        const audio = await context.decodeAudioData(bytes)
        if (!cancelled) setPeaks(samplePeaks(audio, BAR_COUNT))
      } catch {
        if (!cancelled) setPeaks(null)
      } finally {
        void context.close()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [src])

  async function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    try {
      if (audio.paused) await audio.play()
      else audio.pause()
      setNotice(null)
    } catch {
      setNotice('Не вдалося відтворити запис')
    }
  }

  function handleDelete() {
    audioRef.current?.pause()
    onDelete?.()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <MicIcon size={16} className="shrink-0 text-sbs-sky" aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            void togglePlay()
          }}
          aria-label={playing ? 'Пауза' : 'Прослухати'}
          className="flex h-6 min-h-6 max-h-6 w-6 shrink-0 items-center justify-center bg-sbs-black text-sbs-sky"
        >
          {playing ? (
            <PauseIcon size={12} aria-hidden="true" />
          ) : (
            <PlayIcon size={12} aria-hidden="true" />
          )}
        </button>
        <div className="flex h-6 min-w-0 flex-1 items-center gap-0.5" aria-hidden="true">
          {bars.map((peak, index) => (
            <span
              key={index}
              className={`min-w-0 flex-1 ${
                index / bars.length < progress ? 'bg-sbs-sky' : 'bg-sbs-light/30'
              }`}
              style={{ height: `${Math.max(2, Math.round(peak * 16))}px` }}
            />
          ))}
        </div>
        <span className="shrink-0 font-handjet text-sm text-sbs-light">
          {formatDuration(duration)}
        </span>
        {onDelete ? (
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Видалити голосову нотатку"
            className="flex h-6 min-h-6 max-h-6 w-6 shrink-0 items-center justify-center bg-sbs-black text-tactical-warning"
          >
            <Trash2Icon size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {notice ? (
        <p className="text-sm text-tactical-warning" role="status">
          {notice}
        </p>
      ) : null}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget
          if (!audio.duration) return
          setProgress(audio.currentTime / audio.duration)
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      />
    </div>
  )
}

export function DraftVoiceNote({
  blob,
  onDelete,
}: {
  blob: Blob
  onDelete: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(blob)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  if (!src) return null
  return <VoiceNote src={src} onDelete={onDelete} />
}
