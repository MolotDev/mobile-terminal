import { Compass, Crosshair, MapPinned, Plane, Radar } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LaunchItem } from '../types/crew.ts'
import { useCrewStore } from '../stores/useCrewStore.ts'

export function LaunchPlanScreen() {
  const syncTime = useCrewStore((state) => state.syncTime)
  const syncData = useCrewStore((state) => state.syncData)
  const setScreen = useCrewStore((state) => state.setScreen)
  const mission = useCrewStore((state) => state.mission)
  const launches = useCrewStore((state) => state.launches)
  const trackerCount = launches.filter((launch) => launch.trackerNumber).length
  const assets = summarizeAssets(launches)
  const routes = launches.map((launch) => launch.routeId).join(', ')

  function handleStart() {
    syncData()
    setScreen(3)
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <h1 className="font-bebas text-[24px] uppercase leading-none tracking-wider">
        План пусків на добу
      </h1>
      <article className="hud-bracket-box bg-sbs-dark p-4">
        <h2 className="font-bebas text-[20px] uppercase tracking-wider">Зведена інформація</h2>
        <ul className="mt-4 flex flex-col gap-3 text-sm">
          <TargetRow name={mission.target} mgrs={mission.mgrs} address={mission.address} />
          <ReceptionRow name={mission.reception} />
          <PlanRow icon={Plane}>Засоби: «{assets}».</PlanRow>
          <PlanRow icon={Radar}>
            Трекери: «{trackerCount} / {launches.length}».
          </PlanRow>
          <PlanRow icon={Compass}>Маршрути: «{routes}».</PlanRow>
        </ul>
      </article>
      <p className="border border-sbs-light/20 bg-sbs-dark px-3 py-3 text-sm text-sbs-light">
        ℹ️ Дані польотного завдання оновлено:{' '}
        <span className="font-handjet text-sbs-dawn">{syncTime ?? '--:--:--'}</span>
      </p>
      <button
        type="button"
        onClick={handleStart}
        className="pixel-cut mt-auto flex h-14 min-h-14 max-h-14 items-center justify-center overflow-hidden bg-gradient-sbs px-3 py-0 font-bebas text-xl leading-none tracking-wider text-sbs-white"
      >
        Перейти до виконання
      </button>
    </section>
  )
}

function summarizeAssets(launches: LaunchItem[]): string {
  const counts = new Map<string, number>()
  for (const launch of launches) {
    counts.set(launch.droneName, (counts.get(launch.droneName) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => `${name} * ${count}`).join(', ')
}

function TargetRow({
  name,
  mgrs,
  address,
}: {
  name: string
  mgrs: string
  address: string
}) {
  return (
    <li className="flex items-start gap-2">
      <MapPinned size={16} className="mt-1 shrink-0 text-sbs-sky" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="pixel-cut-badge inline-flex shrink-0 items-center bg-sbs-black px-3 py-1 font-handjet text-sbs-sky">
            {mgrs}
          </span>
          <span className="min-w-0 truncate">{name}</span>
        </div>
        <p className="truncate">{address}</p>
      </div>
    </li>
  )
}

function ReceptionRow({ name }: { name: string }) {
  return (
    <li className="flex items-center gap-2">
      <Crosshair size={16} className="shrink-0 text-sbs-sky" aria-hidden="true" />
      <span className="pixel-cut-badge inline-flex shrink-0 items-center bg-sbs-black px-3 py-1 font-handjet text-sbs-sky">
        ТП
      </span>
      <span className="min-w-0 truncate">{name}</span>
    </li>
  )
}

function PlanRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <li className="flex items-center gap-2">
      <Icon size={16} className="shrink-0 text-sbs-light" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}
