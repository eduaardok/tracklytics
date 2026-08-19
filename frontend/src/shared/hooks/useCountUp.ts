import { useEffect, useRef, useState } from 'react'

// Contador que sube de 0 al valor real (S16 Fase 3, KPIs del hero) —
// requestAnimationFrame puro, sin librería de animación (mismo criterio que
// useInView.ts). `target` puede llegar en `undefined` mientras el query
// todavía está cargando: el hook no arranca hasta tener un número real, así
// que nunca cuenta hacia un placeholder.
export function useCountUp(target: number | undefined, durationMs = 1200): number {
  const [value, setValue] = useState(0)
  const startedFor = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (target == null || startedFor.current === target) return
    startedFor.current = target

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }

    let raf = 0
    const t0 = performance.now()
    const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))

    function tick(now: number) {
      const elapsed = now - t0
      const t = Math.min(1, elapsed / durationMs)
      setValue(Math.round(target! * easeOutExpo(t)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return value
}
