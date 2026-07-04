import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bibliotecaApi } from '../api/biblioteca.api'
import { LibraryTrackRow } from './LibraryTrackRow'
import styles from '../pages/BibliotecaPage.module.css'

const PLAYLISTS_KEY = ['biblioteca', 'playlists']

function PlaylistDetail({ playlistId, onBack }: { playlistId: string; onBack: () => void }) {
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName]   = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['biblioteca', 'playlist', playlistId],
    queryFn:  () => bibliotecaApi.playlistDetalle(playlistId),
  })

  const rename = useMutation({
    mutationFn: (name: string) => bibliotecaApi.renombrarPlaylist(playlistId, name),
    onSuccess: () => {
      setRenaming(false)
      queryClient.invalidateQueries({ queryKey: ['biblioteca', 'playlist', playlistId] })
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY })
    },
  })

  const remove = useMutation({
    mutationFn: () => bibliotecaApi.eliminarPlaylist(playlistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY })
      onBack()
    },
  })

  const removeTrack = useMutation({
    mutationFn: (factId: number) => bibliotecaApi.quitarTrackDePlaylist(playlistId, factId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['biblioteca', 'playlist', playlistId] }),
  })

  if (isLoading) return <p className={styles.loading}>// cargando…</p>
  if (!data) return null

  return (
    <div>
      <div className={styles.detailHeader}>
        <button type="button" className={styles.btnGhost} onClick={onBack}>← Volver</button>
        <div className={styles.detailTitle}>
          {renaming ? (
            <form
              onSubmit={(e) => { e.preventDefault(); if (newName.trim()) rename.mutate(newName.trim()) }}
              style={{ display: 'flex', gap: 6 }}
            >
              <input
                className={styles.input}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <button type="submit" className={styles.btnPrimary} disabled={rename.isPending}>Guardar</button>
            </form>
          ) : (
            <>
              <span className={styles.detailName}>{data.name}</span>
              <span className={styles.detailCount}>{data.total} canción{data.total !== 1 ? 'es' : ''}</span>
            </>
          )}
        </div>
        {!renaming && (
          <div className={styles.detailActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => { setNewName(data.name); setRenaming(true) }}
            >
              Renombrar
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                if (confirm(`¿Eliminar la playlist "${data.name}"? Esta acción no se puede deshacer.`)) remove.mutate()
              }}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      {data.data.length === 0 ? (
        <div className={styles.empty}>
          <p>Esta playlist está vacía. Agrega canciones desde el catálogo.</p>
        </div>
      ) : (
        <ul className={styles.trackList} aria-label={`Canciones de ${data.name}`}>
          {data.data.map((t, i) => (
            <li key={t.fact_id}>
              <LibraryTrackRow
                track={t}
                position={i + 1}
                onRemove={() => removeTrack.mutate(t.fact_id)}
                removeTitle="Quitar de la playlist"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PlaylistsTab() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: PLAYLISTS_KEY,
    queryFn:  () => bibliotecaApi.playlists(),
  })

  const create = useMutation({
    mutationFn: (n: string) => bibliotecaApi.crearPlaylist(n),
    onSuccess: () => {
      setName('')
      setShowCreate(false)
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY })
    },
  })

  const remove = useMutation({
    mutationFn: (playlistId: string) => bibliotecaApi.eliminarPlaylist(playlistId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY }),
  })

  if (selectedId) {
    return <PlaylistDetail playlistId={selectedId} onBack={() => setSelectedId(null)} />
  }

  if (isLoading) return <p className={styles.loading}>// cargando…</p>
  if (isError) return <div className={styles.blocked} role="alert">No se pudieron cargar las playlists.</div>

  const playlists = data?.data ?? []

  return (
    <div>
      <div className={styles.playlistHead}>
        <span className={styles.playlistCountLabel}>
          {playlists.length ? `${playlists.length} playlist${playlists.length !== 1 ? 's' : ''}` : ''}
        </span>
        <button type="button" className={styles.btnPrimary} onClick={() => setShowCreate((v) => !v)}>
          + Nueva playlist
        </button>
      </div>

      {showCreate && (
        <form
          className={styles.createForm}
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(name.trim()) }}
        >
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de la playlist…"
            maxLength={60}
            autoFocus
          />
          <button type="submit" className={styles.btnPrimary} disabled={!name.trim() || create.isPending}>Crear</button>
        </form>
      )}

      {playlists.length === 0 ? (
        <div className={styles.empty}>
          <p>Aún no tienes playlists. ¡Crea una y organiza tu música!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {playlists.map((pl) => (
            <button
              key={pl.playlist_id}
              type="button"
              className={styles.card}
              onClick={() => setSelectedId(pl.playlist_id)}
            >
              <span className={styles.cardIcon} aria-hidden="true">♪</span>
              <span className={styles.cardName}>{pl.name}</span>
              <span className={styles.cardCount}>{pl.track_count} canción{pl.track_count !== 1 ? 'es' : ''}</span>
              <span
                className={styles.cardDelete}
                role="button"
                tabIndex={0}
                title="Eliminar playlist"
                aria-label={`Eliminar playlist ${pl.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`¿Eliminar la playlist "${pl.name}"? Esta acción no se puede deshacer.`)) {
                    remove.mutate(pl.playlist_id)
                  }
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.stopPropagation()}
              >
                ✕
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
