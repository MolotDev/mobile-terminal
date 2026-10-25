import { useState } from 'react'
import type { FormEvent } from 'react'
import { useCrewStore } from '../stores/useCrewStore.ts'

export function LoginCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="flex h-12 min-h-12 max-h-12 items-center justify-center overflow-hidden border border-sbs-light/30 px-3 py-0 font-handjet text-[20px] leading-none text-sbs-light"
    >
      Закрити
    </button>
  )
}

export function LoginScreen() {
  const login = useCrewStore((state) => state.login)
  const setLogin = useCrewStore((state) => state.setLogin)
  const setScreen = useCrewStore((state) => state.setScreen)
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const canSubmit = login.trim() !== '' && password.trim() !== ''

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (login.trim() === '') {
      setNotice('Вкажіть логін')
      return
    }
    if (password.trim() === '') {
      setNotice('Вкажіть пароль')
      return
    }
    setLogin(login.trim())
    setNotice(null)
    setScreen(2)
  }

  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h1 className="font-bebas text-[24px] uppercase tracking-wider">Термінал екіпажу</h1>
          <p className="mt-2 font-handjet text-sbs-light">Система тактичного обліку пусків</p>
        </div>
        <form
          className="hud-bracket-box flex w-full flex-col gap-4 bg-sbs-dark p-4"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-col gap-2 text-sm text-sbs-light">
            Логін
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              autoComplete="username"
              className="h-12 bg-sbs-black px-3 font-handjet text-sbs-white outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-sbs-light">
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-12 bg-sbs-black px-3 font-handjet text-sbs-white outline-none"
            />
          </label>
          {notice ? (
            <p className="text-sm text-tactical-warning" role="status">
              {notice}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className="pixel-cut flex h-14 min-h-14 max-h-14 items-center justify-center overflow-hidden bg-gradient-sbs px-3 py-0 font-bebas text-xl leading-none tracking-wider text-sbs-white transition active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          >
            Увійти
          </button>
        </form>
      </div>
      <p className="text-center font-handjet text-sm text-sbs-light">
        v.1.4.2 · Офлайн-модуль PWA активний
      </p>
    </section>
  )
}
