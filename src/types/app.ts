export interface AppState {
  isListening: boolean
  isPanelOpen: boolean
  toggleListening: () => void
  openPanel: () => void
  closePanel: () => void
  signOut: () => void
}
