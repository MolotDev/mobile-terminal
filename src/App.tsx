import { useEffect } from 'react'
import { CheckpointsScreen } from './components/CheckpointsScreen.tsx'
import { LaunchesScreen } from './components/LaunchesScreen.tsx'
import { LaunchPlanScreen } from './components/LaunchPlanScreen.tsx'
import { LoginScreen } from './components/LoginScreen.tsx'
import { ShiftClosedScreen } from './components/ShiftClosedScreen.tsx'
import { TerminalLayout } from './components/TerminalLayout.tsx'
import { useCrewStore } from './stores/useCrewStore.ts'

export default function App() {
  const currentScreen = useCrewStore((state) => state.currentScreen)
  const setOnlineStatus = useCrewStore((state) => state.setOnlineStatus)

  useEffect(() => {
    void useCrewStore.getState().fetchMissionLaunches(useCrewStore.getState().login)
  }, [])

  useEffect(() => {
    const onOnline = () => {
      void useCrewStore.getState().triggerSync()
    }
    const onOffline = () => {
      setOnlineStatus(false)
    }

    if (navigator.onLine) onOnline()
    else onOffline()

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [setOnlineStatus])

  return (
    <TerminalLayout>
      {currentScreen === 1 ? <LoginScreen /> : null}
      {currentScreen === 2 ? <LaunchPlanScreen /> : null}
      {currentScreen === 3 || currentScreen === 5 ? <CheckpointsScreen /> : null}
      {currentScreen === 4 ? <LaunchesScreen /> : null}
      {currentScreen === 6 ? <ShiftClosedScreen /> : null}
    </TerminalLayout>
  )
}
