import { useState } from 'react'
import { useCrewStore } from '../stores/useCrewStore.ts'

const RESET_STORAGE_KEY = 'tactical-terminal-v4'
const RESET_QUESTION = 'Скинути всі дані місії екіпажу до початкового стану?'

export function ResetMissionButton() {
  const resetMission = useCrewStore((state) => state.resetMission)
  const [armed, setArmed] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleClick() {
    if (pending) return
    if (!armed) {
      setArmed(true)
      return
    }
    setPending(true)
    try {
      await resetMission()
      localStorage.removeItem(RESET_STORAGE_KEY)
      window.location.reload()
    } catch (error) {
      console.error('[RESET ERROR]:', error)
      setPending(false)
      setArmed(false)
    }
  }

  return (
    <div className="flex max-w-xs flex-col items-center gap-2">
      {armed ? (
        <p className="text-center font-mono text-xs text-red-400/80">{RESET_QUESTION}</p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          void handleClick()
        }}
        className="min-h-12 border border-red-900/60 px-3 font-mono text-xs text-red-400/80 disabled:opacity-40"
      >
        {pending ? 'Скидання...' : armed ? 'Підтвердити скидання' : 'Скинути тестові дані'}
      </button>
    </div>
  )
}
