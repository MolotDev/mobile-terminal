import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AppState } from '../types/app.ts'

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isListening: false,
      isPanelOpen: true,
      toggleListening: () =>
        set((state) => ({ isListening: !state.isListening })),
      openPanel: () => set({ isPanelOpen: true }),
      closePanel: () => set({ isPanelOpen: false, isListening: false }),
      signOut: () => set({ isPanelOpen: true, isListening: false }),
    }),
    {
      name: 'report-mobile',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isListening: state.isListening,
        isPanelOpen: state.isPanelOpen,
      }),
    },
  ),
)
