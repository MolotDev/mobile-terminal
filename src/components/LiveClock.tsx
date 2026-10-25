import { useEffect, useState } from 'react'

function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => formatClock(new Date()))

  useEffect(() => {
    const timer = window.setInterval(() => setNow(formatClock(new Date())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return <p className={className}>{now}</p>
}
