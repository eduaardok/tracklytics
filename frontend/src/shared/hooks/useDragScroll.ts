// Arrastre horizontal con mouse para filas desplazables — feedback de
// usuario: sin esto solo se podía desplazar con rueda/trackpad.
//
// DELEGACIÓN GLOBAL POR ATRIBUTO, no listeners por nodo: las filas se montan
// condicionalmente Y se recrean al volver de una vista de detalle (remount),
// y los listeners por nodo quedaban huérfanos en el nodo viejo ("tras entrar
// a una canción y volver a Catálogo, el arrastre moría"). Con un único juego
// de listeners globales que resuelven la fila ACTIVA en cada pointerdown vía
// `closest('[data-drag-scroll]')`, da igual cuántas veces se recree el nodo:
// siempre se encuentra el que está vivo en ese momento.
//
// Uso: `const dragRow = useDragScroll()` → `<div {...dragRow}>`.
//
// Detalles de comportamiento:
// 1. `dragstart` prevenido — las portadas son <img> y su drag nativo HTML5
//    secuestraba el gesto (pointercancel a mitad de arrastre).
// 2. Sin scroll-snap en la fila (re-anclaba al soltar = salto brusco).
// 3. Inercia al soltar: velocidad de los últimos ~120ms con decaimiento.
// 4. El click sintético post-arrastre se suprime para no navegar.
// 5. Touch/pen fuera: ya tienen scroll nativo.

const ATTR = 'data-drag-scroll'
const DRAGGING = 'data-dragging'

let installed = false

function ensureInstalled() {
  if (installed || typeof window === 'undefined') return
  installed = true

  let active: HTMLElement | null = null
  let moved = false
  let startX = 0
  let startScroll = 0
  let samples: { t: number; x: number }[] = []
  let raf = 0

  const stopFling = () => cancelAnimationFrame(raf)

  // El drag nativo HTML5 de <img> secuestra el gesto — se corta en captura.
  window.addEventListener(
    'dragstart',
    (e) => {
      if ((e.target as Element | null)?.closest(`[${ATTR}]`)) e.preventDefault()
    },
    true,
  )

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = (e.target as Element | null)?.closest<HTMLElement>(`[${ATTR}]`)
    if (!el) return
    stopFling()
    active = el
    moved = false
    samples = []
    startX = e.clientX
    startScroll = el.scrollLeft
    // Evita selección de texto durante el arrastre; el click normal no se ve
    // afectado (el drag de <img> ya está cubierto arriba).
    e.preventDefault()
  })

  window.addEventListener('pointermove', (e) => {
    if (!active) return
    const dx = e.clientX - startX
    // Umbral pequeño antes de considerar "arrastre": un click quieto sigue
    // siendo un click.
    if (!moved && Math.abs(dx) > 6) {
      moved = true
      active.setAttribute(DRAGGING, '')
    }
    if (!moved) return
    samples.push({ t: performance.now(), x: e.clientX })
    if (samples.length > 8) samples.shift()
    active.scrollLeft = startScroll - dx
  })

  window.addEventListener('pointerup', () => {
    const el = active
    active = null
    if (!el || !moved) return

    el.removeAttribute(DRAGGING)

    // Inercia: velocidad media de los últimos ~120ms (px/ms → px/frame ~16.7)
    // con decaimiento exponencial; se corta si empieza otro arrastre.
    const now = performance.now()
    const recent = samples.filter((s) => now - s.t <= 120)
    const first = recent[0]
    const last = recent[recent.length - 1]
    if (first && last && last.t > first.t) {
      let vPxFrame = ((first.x - last.x) / (last.t - first.t)) * 16.7
      vPxFrame = Math.max(-40, Math.min(40, vPxFrame))
      const step = () => {
        if (active || Math.abs(vPxFrame) < 0.4) return
        el.scrollLeft += vPxFrame
        vPxFrame *= 0.94
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }

    // El click sintético posterior al arrastre NO debe navegar (abriría la
    // card que solo se quería deslizar) — se suprime este tick.
    const suppress = (ev: Event) => {
      ev.stopPropagation()
      ev.preventDefault()
    }
    el.addEventListener('click', suppress, { capture: true, once: true })
    setTimeout(() => el.removeEventListener('click', suppress, true))
  })

  window.addEventListener('pointercancel', () => {
    const el = active
    active = null
    if (el && moved) el.removeAttribute(DRAGGING)
  })
}

// Devuelve los props a esparcir sobre la fila desplazable. Instala los
// listeners globales una única vez.
export function useDragScroll(): { 'data-drag-scroll': '' } {
  ensureInstalled()
  return { [ATTR]: '' }
}
