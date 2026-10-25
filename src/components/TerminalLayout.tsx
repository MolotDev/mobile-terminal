import { CalendarIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useCrewStore } from '../stores/useCrewStore.ts'
import { NetworkBadge, ScreenHeader } from './ScreenHeader.tsx'

export function TerminalLayout({ children }: { children: ReactNode }) {
  const currentScreen = useCrewStore((state) => state.currentScreen)
  const isOnline = useCrewStore((state) => state.isOnline)
  const queueCount = useCrewStore((state) => state.outbox.length)

  return (
    <div className="mx-auto flex h-screen min-h-screen w-full max-w-md flex-col overflow-hidden border-x border-sbs-light/10 bg-sbs-black">
      {currentScreen === 1 ? (
        <header className="flex items-center justify-center border-b border-sbs-light/10 px-4 py-3">
          <NetworkBadge isOnline={isOnline} queueCount={queueCount} />
        </header>
      ) : (
        <ScreenHeader />
      )}
      <main className="flex min-h-0 flex-1 flex-col overflow-x-hidden">
        <ScreenDateTime />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
          {currentScreen === 4 ? (
            <div className="flex min-h-full flex-col">{children}</div>
          ) : (
            <div className="my-auto flex w-full flex-col">{children}</div>
          )}
        </div>
      </main>
      <footer className="whitespace-pre py-3 text-center font-handjet text-sbs-light/40">
        {'50  25  [ : ]  25  50'}
      </footer>
    </div>
  )
}

function ScreenDateTime() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const date = new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now)
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')

  return (
    <p className="flex shrink-0 items-center gap-2 px-4 pt-4 font-handjet text-[18px] text-sbs-light">
      <CalendarIcon size={18} className="shrink-0" aria-hidden="true" />
      <span>{date}</span>
      <span>{time}</span>
    </p>
  )
}
