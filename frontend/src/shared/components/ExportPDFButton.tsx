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
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const revertir = aplicarTemaClaro(el)
  // Deja que el navegador aplique las custom properties antes de capturar
  // (sin este frame, html2canvas a veces lee los estilos previos al cambio).
  await new Promise((resolve) => requestAnimationFrame(resolve))

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      // El propio botón vive dentro del contenedor que captura (misma fila
      // que el título, arriba a la derecha) — sin esto, el PDF se
      // fotografiaría a sí mismo pidiendo generarse.
      ignoreElements: (node) => node.getAttribute?.('data-pdf-export-ignore') === 'true',
    })
  } finally {
    revertir()
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

  const totalPaginas = Math.max(1, Math.ceil(imgHeightMm / contentHeightMm))
  const generadoEn = fmtGeneradoEn(new Date())

  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    if (pagina > 1) pdf.addPage()
    dibujarEncabezado(pdf, pageWidth, title, generadoEn)
    // Misma imagen completa en cada página, desplazada hacia arriba — el
    // contenido que cae fuera del rectángulo [contentTop, pageHeight-margin]
    // de ESA página queda fuera del MediaBox y simplemente no se dibuja
    // (patrón estándar de paginación html2canvas + jsPDF).
    const yOffsetMm = contentTopMm - (pagina - 1) * contentHeightMm
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
    } catch {
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
