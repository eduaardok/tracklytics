import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Heart, History, ListMusic } from 'lucide-react'
import { getRole } from '@shared/lib/session'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { bibliotecaApi } from '../api/biblioteca.api'
import { FavoritosTab } from '../components/FavoritosTab'
import { HistorialTab } from '../components/HistorialTab'
import { PlaylistsTab } from '../components/PlaylistsTab'
import styles from './BibliotecaPage.module.css'

const TABS = [
  { id: 'favoritos', label: 'Favoritos', Icon: Heart },
  { id: 'playlists', label: 'Playlists', Icon: ListMusic },
  { id: 'historial', label: 'Escuchadas', Icon: History },
] as const

type TabId = typeof TABS[number]['id']

export function BibliotecaPage() {
  useDocumentTitle('Mi Biblioteca')
  const [tab, setTab] = useState<TabId>('favoritos')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // RN-CAT-004 (mismo criterio que app/biblioteca/library.html): la biblioteca
  // personal es exclusiva de Usuario B2C — se verifica el rol de forma
  // proactiva en vez de esperar el 403 de cada una de las 3 llamadas.
  const isB2B = getRole() === 'analyst'

  // Las 3 consultas viven acá (y no dentro de cada tab) para alimentar los
  // contadores de los chips sin duplicar queries — los tabs reusan la misma
  // queryKey vía caché de react-query.
  const favoritos = useQuery({
    queryKey: ['biblioteca', 'favoritos'],
    queryFn:  () => bibliotecaApi.favoritos(),
    enabled:  !isB2B,
  })
  const historial = useQuery({
    queryKey: ['biblioteca', 'historial'],
    queryFn:  () => bibliotecaApi.historial(200),
    enabled:  !isB2B,
  })
  const playlists = useQuery({
    queryKey: ['biblioteca', 'playlists'],
    queryFn:  () => bibliotecaApi.playlists(),
    enabled:  !isB2B,
  })

  if (isB2B) {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Mi Biblioteca</h1>
        <div className={styles.blocked} role="alert">
          Esta sección (favoritos, historial y playlists personales) es exclusiva de Usuario B2C.
          Tu cuenta tiene rol de Cliente B2B — usa el panel de Analítica en su lugar.
        </div>
      </section>
    )
  }

  const COUNTS: Record<TabId, { valor: number | undefined; cargando: boolean }> = {
    favoritos: { valor: favoritos.data?.total, cargando: favoritos.isLoading },
    playlists: { valor: playlists.data?.data.length, cargando: playlists.isLoading },
    historial: { valor: historial.data?.total, cargando: historial.isLoading },
  }

  // Navegación por teclado del tablist (roving tabindex): ←/→ mueven la
  // selección y el foco juntos, como espera WAI-ARIA.
  function onTablistKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === tab)
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const nextIdx = (i + dir + TABS.length) % TABS.length
    const next = TABS[nextIdx]
    setTab(next.id)
    tabRefs.current[nextIdx]?.focus()
  }

  return (
    <section className={styles.page}>
      <span className={styles.kicker} aria-hidden="true">// tu espacio personal</span>
      <h1 className={styles.heading}>Mi Biblioteca</h1>

      {/* Chips = stats + navegación en un solo control (antes eran statCards
          anónimos arriba y una barra de tabs aparte — dos puntos de decisión
          redundantes para lo mismo). */}
      <div className={styles.chipRow} role="tablist" aria-label="Secciones de tu biblioteca" onKeyDown={onTablistKeyDown}>
        {TABS.map(({ id, label, Icon }, i) => {
          const activo = tab === id
          const { valor, cargando } = COUNTS[id]
          return (
            <button
              key={id}
              ref={(el) => { tabRefs.current[i] = el }}
              type="button"
              role="tab"
              id={`bib-tab-${id}`}
              aria-selected={activo}
              aria-controls="bib-panel"
              tabIndex={activo ? 0 : -1}
              className={`${styles.chip} ${styles[`chip--${id}`]} ${activo ? styles['chip--active'] : ''}`}
              onClick={() => setTab(id)}
            >
              <span className={styles.chipIcon} aria-hidden="true"><Icon size={16} strokeWidth={2.2} /></span>
              <span className={styles.chipMeta}>
                <span className={styles.chipNumber} aria-hidden="true">
                  {cargando ? <span className={styles.chipSkeleton} /> : (valor ?? 0)}
                </span>
                <span className={styles.chipLabel}>{label}</span>
              </span>
              <span className={styles.visuallyHidden}>{valor != null ? `${valor} ${label.toLowerCase()}` : label}</span>
            </button>
          )
        })}
      </div>

      <div key={tab} id="bib-panel" role="tabpanel" aria-labelledby={`bib-tab-${tab}`} className={styles.panel}>
        {tab === 'favoritos' && <FavoritosTab />}
        {tab === 'playlists' && <PlaylistsTab />}
        {tab === 'historial' && <HistorialTab />}
      </div>
    </section>
  )
}
