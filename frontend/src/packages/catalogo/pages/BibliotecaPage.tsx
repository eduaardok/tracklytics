import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRole } from '@shared/lib/session'
import { bibliotecaApi } from '../api/biblioteca.api'
import { FavoritosTab } from '../components/FavoritosTab'
import { HistorialTab } from '../components/HistorialTab'
import { PlaylistsTab } from '../components/PlaylistsTab'
import styles from './BibliotecaPage.module.css'

const TABS = [
  { id: 'favoritos', label: 'Favoritos' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'historial', label: 'Historial' },
] as const

type TabId = typeof TABS[number]['id']

export function BibliotecaPage() {
  const [tab, setTab] = useState<TabId>('favoritos')

  // RN-CAT-004 (mismo criterio que app/biblioteca/library.html): la biblioteca
  // personal es exclusiva de Usuario B2C — se verifica el rol de forma
  // proactiva en vez de esperar el 403 de cada una de las 3 llamadas.
  const isB2B = getRole() === 'analyst'

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

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Mi Biblioteca</h1>
      <span className={styles.subtitle}>// favoritos, playlists e historial de reproducción</span>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{favoritos.data?.total ?? '—'}</div>
          <div className={styles.statLabel}>Favoritos</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{playlists.data?.data.length ?? '—'}</div>
          <div className={styles.statLabel}>Playlists</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{historial.data?.total ?? '—'}</div>
          <div className={styles.statLabel}>Escuchadas</div>
        </div>
      </div>

      <div className={styles.tabBar} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles['tab--active'] : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'favoritos' && <FavoritosTab />}
      {tab === 'playlists' && <PlaylistsTab />}
      {tab === 'historial' && <HistorialTab />}
    </section>
  )
}
