import { useEffect, useRef, useState } from 'react'

// Revela contenido al hacer scroll (S16 Fase 3, hero/landing) — CSS-only
// equivalente a `whileInView` de framer-motion, sin agregar la librería
// (ver PageTransition.tsx: framer-motion ya se probó y se revirtió una vez
// por costar +43kB gzip en el bundle principal). IntersectionObserver nativo,
// dispara una sola vez y se desconecta — no es un contador de visibilidad
// continuo, es un "ya se reveló" de una sola vía.
//
// El contenido consumidor SIEMPRE debe renderizar visible por defecto
// (opacity:1 en el CSS base) — este hook solo agrega una animación de
// entrada encima, nunca gatea la visibilidad real. Como salvaguarda extra
// (una pestaña oculta o un renderer headless nunca dispara el observer),
// un timeout fuerza `inView=true` a los 1.5s pase lo que pase, así la
// sección nunca queda "esperando" una animación que no va a llegar.
const FALLBACK_MS = 1500

export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(el)
    const fallback = window.setTimeout(() => setInView(true), FALLBACK_MS)
    return () => {
      observer.disconnect()
      window.clearTimeout(fallback)
    }
  }, [threshold])

  return { ref, inView }
}
