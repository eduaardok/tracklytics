import { useState, type RefObject } from 'react'
import type { jsPDF } from 'jspdf'
import { Download, Loader2 } from 'lucide-react'
import { useToast } from '@shared/context/ToastContext'
import styles from './ExportPDFButton.module.css'

type Props = {
  // El contenedor a capturar — típicamente el `<section>` raíz de la página
  // o de la pestaña, envuelto por el consumidor en un `ref` propio (S13-P5,
  // ver AUDITORIA_S13.md, Fase 1). Debe cubrir KPIs + gráficos + tabla.
  targetRef: RefObject<HTMLElement>
  // Nombre de archivo sin extensión — se le agrega la fecha y `.pdf`.
  fileName: string
  // Título del informe mostrado en el encabezado del PDF. Sin él, el
  // encabezado solo muestra la marca y la fecha de generación.
  title?: string
}

const MARGIN_MM = 20
const HEADER_BAND_MM = 16
const FOOTER_BAND_MM = 12

// Paleta forzada a claro para la captura — sobreescribe las custom
// properties del design system (index.css) en el contenedor exportado antes
// de llamar a html2canvas. Como las CSS custom properties heredan hacia
// abajo, alcanza con setearlas UNA vez en el nodo raíz del ref para que
// todo el árbol (badges, tablas, textos vía var(--color-ink) etc.) capture
// en claro sin tocar ningún módulo CSS de cada página. Se revierte apenas
// termina la captura, nunca queda aplicado a la UI real (tema dark).
const LIGHT_OVERRIDES: Record<string, string> = {
  '--color-bg':             '#ffffff',
  '--color-surface':        '#f7f7fb',
  '--color-surface-raised': '#eeeef4',
  '--color-ink':            '#1a1a22',
  '--color-muted':          '#6b6b7a',
  '--color-border':         '#dcdce3',
  '--color-primary':        '#6d28d9',
  '--color-primary-light':  '#8b5cf6',
}

function aplicarTemaClaro(el: HTMLElement): () => void {
  const previos: Record<string, string> = {}
  for (const [prop, valor] of Object.entries(LIGHT_OVERRIDES)) {
    previos[prop] = el.style.getPropertyValue(prop)
    el.style.setProperty(prop, valor)
  }
  const bgPrevio = el.style.backgroundColor
  el.style.backgroundColor = '#ffffff'
  return () => {
    for (const [prop, valor] of Object.entries(previos)) {
      if (valor) el.style.setProperty(prop, valor)
      else el.style.removeProperty(prop)
    }
    el.style.backgroundColor = bgPrevio
  }
}

// Fix de columnas cortadas en rankings anchos (P12, abierto desde S16-P3):
// `RankingTable`/tablas similares envuelven la tabla en un div con
// `overflow-x: auto` (scroll horizontal en pantalla) — html2canvas clona y
// renderiza el DOM tal cual está pintado, así que respeta ese overflow y
// solo captura el ancho VISIBLE del contenedor, recortando las columnas que
// hoy requieren scroll para verse. La paginación vertical (más abajo) nunca
// tocaba esto porque el problema es horizontal, no de alto de página.
//
// Fix: antes de capturar, se detectan los contenedores con overflow-x real
// (scrollWidth > clientWidth) dentro de `el`, se fuerza su `width` inline al
// ancho completo del contenido y `overflow-x: visible` (así la tabla se
// pinta entera, sin clip) — y se le pide a html2canvas capturar un lienzo
// tan ancho como el punto más a la derecha de cualquier descendiente
// (`anchoTotalNecesario`), no solo el ancho renderizado de `el`. Todo se
// revierte apenas termina la captura, nunca queda aplicado a la UI real.
function ensancharOverflowHorizontal(el: HTMLElement): () => void {
  const restauraciones: Array<() => void> = []
  for (const nodo of el.querySelectorAll<HTMLElement>('*')) {
    if (nodo.scrollWidth > nodo.clientWidth + 1) {
      const overflowXPrevio = nodo.style.overflowX
      const widthPrevio = nodo.style.width
      nodo.style.overflowX = 'visible'
      nodo.style.width = `${nodo.scrollWidth}px`
      restauraciones.push(() => {
        nodo.style.overflowX = overflowXPrevio
        nodo.style.width = widthPrevio
      })
    }
  }
  return () => restauraciones.forEach((fn) => fn())
}

function anchoTotalNecesario(el: HTMLElement): number {
  const izquierda = el.getBoundingClientRect().left
  let maxDerecha = el.getBoundingClientRect().right
  for (const nodo of el.querySelectorAll<HTMLElement>('*')) {
    const derecha = nodo.getBoundingClientRect().right
    if (derecha > maxDerecha) maxDerecha = derecha
  }
  return Math.ceil(maxDerecha - izquierda)
}

function fmtGeneradoEn(d: Date): string {
  const fecha = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const hora  = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fecha}, ${hora}`
}

function dibujarEncabezado(pdf: jsPDF, pageWidth: number, title: string | undefined, generadoEn: string) {
  const left  = MARGIN_MM
  const right = pageWidth - MARGIN_MM

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.setTextColor(26, 26, 34)
  pdf.text('TRACKLYTICS', left, MARGIN_MM + 4)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(107, 107, 122)
  pdf.text(generadoEn, right, MARGIN_MM + 4, { align: 'right' })

  if (title) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(26, 26, 34)
    pdf.text(title, left, MARGIN_MM + 11)
  }

  pdf.setDrawColor(139, 92, 246)
  pdf.setLineWidth(0.6)
  pdf.line(left, MARGIN_MM + HEADER_BAND_MM - 2, right, MARGIN_MM + HEADER_BAND_MM - 2)
}

function dibujarPie(pdf: jsPDF, pageWidth: number, pageHeight: number, pagina: number, totalPaginas: number) {
  const left    = MARGIN_MM
  const right   = pageWidth - MARGIN_MM
  const lineaY  = pageHeight - MARGIN_MM - FOOTER_BAND_MM + 4
  const textoY  = lineaY + 5

  pdf.setDrawColor(220, 220, 227)
  pdf.setLineWidth(0.3)
  pdf.line(left, lineaY, right, lineaY)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(120, 120, 130)
  pdf.text('Generado por Tracklytics — Confidencial', left, textoY)
  pdf.text(`Página ${pagina} de ${totalPaginas}`, right, textoY, { align: 'right' })
}

async function exportarComoPdf(el: HTMLElement, fileName: string, title: string | undefined) {
  // Import dinámico (S13-P5, hallazgo de build): `html2canvas`/`jspdf` pesan
  // ~180 kB minificados juntos — un import estático acá los metía en el
  // bundle principal a través de CUALQUIER página que use este botón,
  // incluidas las que `router.tsx` carga eager (ej. `ErroresPage`), doblando
  // su tamaño (542 kB → 1,14 MB, verificado con `npm run build`). Se bajan
  // recién al primer clic, mismo criterio que el resto del proyecto usa para
  // Recharts (ver comentarios de `lazyNamed` en `router.tsx`).
  //
  // `html2canvas-pro` (no `html2canvas`) — S13-P8: el `html2canvas` original
  // no reconoce la sintaxis CSS Color 4 (`oklch(...)`), que es la que usa
  // TODA la paleta del proyecto (custom properties de index.css, y los
  // fill/stroke literales de Recharts en `charts/colors.ts`, que además
  // están literales a propósito, no vía `var()` — ver comentario ahí). El
  // error real: "Attempting to parse an unsupported color function 'oklch'"
  // en `parseBackgroundColor`, reproducido en la página de ingesta (charts +
  // badges), pero afecta a CUALQUIER página con un gráfico Recharts o un
  // badge de estado, no solo a esta. `html2canvas-pro` es un fork mantenido
  // con soporte para oklch/lab/lch/color(), mismo API — drop-in replacement,
  // sin tocar el resto de este archivo.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])

  const revertirTema = aplicarTemaClaro(el)
  const revertirOverflow = ensancharOverflowHorizontal(el)
  // Deja que el navegador aplique las custom properties/anchos antes de
  // capturar (sin este frame, html2canvas a veces lee los estilos previos al
  // cambio).
  await new Promise((resolve) => requestAnimationFrame(resolve))

  let canvas: HTMLCanvasElement
  try {
    const anchoCaptura = Math.max(el.clientWidth, anchoTotalNecesario(el))
    canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      // Ancho de lienzo/ventana de renderizado ampliado al punto más a la
      // derecha de cualquier descendiente (ver `ensancharOverflowHorizontal`
      // arriba) — sin esto, html2canvas seguiría recortando al ancho
      // renderizado normal de `el` aunque el overflow-x ya esté neutralizado.
      width: anchoCaptura,
      windowWidth: anchoCaptura,
      // El propio botón vive dentro del contenedor que captura (misma fila
      // que el título, arriba a la derecha) — sin esto, el PDF se
      // fotografiaría a sí mismo pidiendo generarse.
      ignoreElements: (node) => node.getAttribute?.('data-pdf-export-ignore') === 'true',
    })
  } finally {
    revertirOverflow()
    revertirTema()
  }

  const aspect = canvas.width / canvas.height
  const orientation: 'landscape' | 'portrait' = aspect > 1.3 ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  const pageWidth  = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const contentWidthMm  = pageWidth - MARGIN_MM * 2
  const contentTopMm    = MARGIN_MM + HEADER_BAND_MM
  const contentHeightMm = pageHeight - MARGIN_MM * 2 - HEADER_BAND_MM - FOOTER_BAND_MM

  const imgWidthMm  = contentWidthMm
  const imgHeightMm = imgWidthMm / aspect
  const imgData     = canvas.toDataURL('image/png')

  // Page breaks conscientes de filas de tabla (Fase 5.4, S14-FINAL): html2canvas
  // rasteriza `el` como una sola imagen continua y jsPDF la corta a intervalos
  // fijos de `contentHeightMm` — `page-break-inside` de CSS no pasa por ningún
  // motor de paginación acá (esto no es @media print), así que declararlo en
  // los módulos CSS de las tablas no tendría ningún efecto real. En su lugar,
  // se miden los límites verticales reales de cada `<tr>` de `el` (en mm,
  // proporcional a `imgHeightMm`) y el corte de cada página se retrocede al
  // borde superior de la fila si el corte "natural" caería a la mitad.
  const mmPorPx = el.scrollHeight > 0 ? imgHeightMm / el.scrollHeight : 0
  const elTop = el.getBoundingClientRect().top
  const filasMm: Array<[number, number]> = mmPorPx > 0
    ? Array.from(el.querySelectorAll('tr')).map((tr) => {
        const top = tr.getBoundingClientRect().top - elTop
        return [top * mmPorPx, (top + tr.clientHeight) * mmPorPx] as [number, number]
      })
    : []

  const breaks: number[] = [0]
  let cursor = 0
  while (cursor < imgHeightMm - 0.01) {
    let siguiente = Math.min(cursor + contentHeightMm, imgHeightMm)
    const filaCortada = filasMm.find(([top, bottom]) => siguiente > top && siguiente < bottom && top > cursor + 0.01)
    if (filaCortada) siguiente = filaCortada[0]
    // Salvaguarda: una fila más alta que una página completa no puede
    // evitarse sin partirla — se avanza igual para no loopear infinito.
    if (siguiente <= cursor) siguiente = Math.min(cursor + contentHeightMm, imgHeightMm)
    breaks.push(siguiente)
    cursor = siguiente
  }
  const totalPaginas = Math.max(1, breaks.length - 1)
  const generadoEn = fmtGeneradoEn(new Date())

  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    if (pagina > 1) pdf.addPage()
    dibujarEncabezado(pdf, pageWidth, title, generadoEn)
    // Misma imagen completa en cada página, desplazada hacia arriba — el
    // contenido que cae fuera del rectángulo [contentTop, pageHeight-margin]
    // de ESA página queda fuera del MediaBox y simplemente no se dibuja
    // (patrón estándar de paginación html2canvas + jsPDF).
    const yOffsetMm = contentTopMm - breaks[pagina - 1]
    pdf.addImage(imgData, 'PNG', MARGIN_MM, yOffsetMm, imgWidthMm, imgHeightMm)
    dibujarPie(pdf, pageWidth, pageHeight, pagina, totalPaginas)
  }

  const fechaArchivo = new Date().toISOString().slice(0, 10)
  pdf.save(`${fileName}-${fechaArchivo}.pdf`)
}

// Botón de exportación reutilizable (S13-P5) — captura `targetRef` con
// html2canvas y arma un PDF paginado con jsPDF. Usado tanto por los 30
// informes compuestos (una sola vez, en `ReportLayout`) como por los 27
// informes simples y los paneles operativos con tabla (uno por página).
export function ExportPDFButton({ targetRef, fileName, title }: Props) {
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  async function handleClick() {
    const el = targetRef.current
    if (!el || loading) return
    setLoading(true)
    try {
      await exportarComoPdf(el, fileName, title)
    } catch (err) {
      console.error('DIAG export pdf error:', err)
      toast.error('No se pudo generar el PDF. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className={styles.exportBtn}
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      data-pdf-export-ignore="true"
    >
      {loading
        ? <Loader2 size={15} className={styles.spinner} aria-hidden="true" />
        : <Download size={15} aria-hidden="true" />}
      {loading ? 'Generando…' : 'Exportar PDF'}
    </button>
  )
}
