import { UsersIcon } from 'lucide-react'
import { useCrewStore } from '../stores/useCrewStore.ts'

function crewLabel(login: string): string {
  const name = login.trim().replace(/^crew_/i, '')
  return name === '' ? '-' : name
}

export function ScreenHeader() {
  const currentScreen = useCrewStore((state) => state.currentScreen)
  const login = useCrewStore((state) => state.login)
  const isOnline = useCrewStore((state) => state.isOnline)
  const queueCount = useCrewStore((state) => state.outbox.length)
  const setScreen = useCrewStore((state) => state.setScreen)
  const resetSession = useCrewStore((state) => state.resetSession)

  return (
    <header className="flex items-center justify-between gap-3 border-b border-sbs-light/10 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          disabled={currentScreen === 6}
          onClick={() => {
            if (currentScreen === 6) return
            setScreen(currentScreen === 5 ? 4 : currentScreen === 4 ? 3 : currentScreen === 3 ? 2 : 1)
          }}
          aria-label="Назад"
          className="flex h-12 min-h-12 max-h-12 w-12 shrink-0 items-center justify-center border border-sbs-light/30 font-bebas text-lg text-sbs-white"
        >
          ←
        </button>
        <div className="flex min-w-0 items-center gap-2 font-bebas text-xl tracking-wider text-sbs-white">
          <UsersIcon size={20} className="shrink-0" aria-hidden="true" />
          <span className="truncate">· {crewLabel(login)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NetworkBadge isOnline={isOnline} queueCount={queueCount} />
        <button
          type="button"
          onClick={resetSession}
          className="flex h-12 min-h-12 max-h-12 items-center justify-center overflow-hidden border border-sbs-light/30 px-3 py-0 font-handjet text-[18px] leading-none text-sbs-light"
        >
          Вийти
        </button>
      </div>
    </header>
  )
}

export function NetworkBadge({
  isOnline,
  queueCount,
}: {
  isOnline: boolean
  queueCount: number
}) {
  if (isOnline) {
    return (
      <span className="inline-flex items-center bg-tactical-success px-2 py-1 font-handjet text-xs text-sbs-black">
        ONLINE
      </span>
    )
  }

  return (
    <span className="inline-flex items-center bg-tactical-warning px-2 py-1 font-handjet text-xs text-sbs-black">
      ⚡ OFFLINE: {queueCount}
    </span>
  )
}
