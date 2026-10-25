import { LogOut, Mic, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAppStore } from '../stores/useAppStore.ts'

export function AppToolbar() {
  const isListening = useAppStore((state) => state.isListening)
  const isPanelOpen = useAppStore((state) => state.isPanelOpen)
  const toggleListening = useAppStore((state) => state.toggleListening)
  const openPanel = useAppStore((state) => state.openPanel)
  const closePanel = useAppStore((state) => state.closePanel)
  const signOut = useAppStore((state) => state.signOut)

  if (!isPanelOpen) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <button
          type="button"
          aria-label="Мікрофон"
          onClick={openPanel}
          className="flex h-24 min-h-24 max-h-24 w-24 items-center justify-center rounded-full bg-sbs-dark text-sbs-white"
        >
          <Mic className="h-10 w-10" aria-hidden="true" />
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between px-4 py-4">
        <p className="font-bebas text-2xl uppercase tracking-wider text-sbs-white">Report</p>
        <div className="flex gap-2">
          <IconButton label="Вихід" onClick={signOut}>
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </IconButton>
          <IconButton label="Закрити" onClick={closePanel}>
            <X className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          aria-label="Мікрофон"
          aria-pressed={isListening}
          onClick={toggleListening}
          className={`flex h-24 min-h-24 max-h-24 w-24 items-center justify-center rounded-full text-sbs-white ${
            isListening ? 'bg-tactical-danger' : 'bg-sbs-dark'
          }`}
        >
          <Mic className="h-10 w-10" aria-hidden="true" />
        </button>
      </div>
    </main>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-12 min-h-12 max-h-12 w-12 items-center justify-center rounded-full bg-sbs-dark text-sbs-white"
    >
      {children}
    </button>
  )
}
