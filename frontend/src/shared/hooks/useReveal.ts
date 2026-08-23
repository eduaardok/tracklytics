import { useEffect, useRef } from 'react'

// S16-P9 — capa 2 de transiciones transversales: revela un bloque la primera
// vez que entra al viewport (IntersectionObserver, se desconecta tras
// revelar). El elemento debe llevar la clase base global `reveal-base` y el
// hook agrega `reveal-in` cuando aparece. Con prefers-reduced-motion o sin
// IntersectionObserver, revela directo (clase inmediata, sin observer).
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reducido =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof IntersectionObserver === 'undefined'
    if (reducido) {
      el.classList.add('reveal-in')
      return
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            el.classList.add('reveal-in')
            obs.disconnect()
          }
        }
      },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return ref
}
