import { useCrewStore } from '../stores/useCrewStore.ts'

export function ShiftClosedScreen() {
  const shiftSummary = useCrewStore((state) => state.shiftSummary)
  const isOnline = useCrewStore((state) => state.isOnline)
  const resetSession = useCrewStore((state) => state.resetSession)
  const sentCount = shiftSummary?.sentCount ?? 0

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-bebas text-xl tracking-wider text-sbs-white">ЗМІНУ ЗАВЕРШЕНО</h1>
      <div className="hud-bracket-box flex flex-col gap-3 bg-sbs-dark p-4">
        <p className="font-fixel text-sbs-white">Відправлено звітів: {sentCount}</p>
        <p
          className={
            isOnline
              ? 'font-handjet text-sm tracking-wider text-tactical-success'
              : 'font-handjet text-sm tracking-wider text-tactical-warning'
          }
          role="status"
        >
          {isOnline ? 'ONLINE' : "Дані збережено локально, очікується зв'язок"}
        </p>
      </div>
      <button
        type="button"
        onClick={resetSession}
        className="pixel-cut flex h-14 min-h-14 max-h-14 items-center justify-center overflow-hidden bg-gradient-sbs px-3 py-0 font-bebas text-xl leading-none tracking-wider text-sbs-white"
      >
        Вийти з терміналу
      </button>
    </section>
  )
}
