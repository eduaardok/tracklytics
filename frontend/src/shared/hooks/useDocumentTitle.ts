import { useEffect } from 'react'

// `title` puede llegar vacío mientras un query todavía está cargando (p.ej.
// nombre de un track/artista/álbum) — en ese caso se conserva el título
// genérico en vez de parpadear a "· Tracklytics" a secas.
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const previous = document.title
    document.title = title ? `${title} · Tracklytics` : 'Tracklytics'
    return () => {
      document.title = previous
    }
  }, [title])
}
