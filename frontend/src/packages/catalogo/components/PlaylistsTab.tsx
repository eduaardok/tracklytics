import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Lock } from 'lucide-react'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { ErrorState } from '@shared/components/ErrorState'
import { EmptyState } from '@shared/components/EmptyState'
import { PlaylistCollage } from '@shared/components/PlaylistCollage'
import { bibliotecaApi } from '../api/biblioteca.api'
import { LibraryTrackRow } from './LibraryTrackRow'
import styles from '../pages/BibliotecaPage.module.css'

const PLAYLISTS_KEY = ['biblioteca', 'playlists']

function PlaylistDetail({ playlistId, onBack }: { playlistId: string; onBack: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName]   = useState('')
  const [showColaboradores, setShowColaboradores] = useState(false)
  const [colabEmail, setColabEmail] = useState('')

  const playlistKey = ['biblioteca', 'playlist', playlistId]

  const { data, isLoading } = useQuery({
    queryKey: playlistKey,
    queryFn:  () => bibliotecaApi.playlistDetalle(playlistId),
  })

  const rename = useMutation({
    mutationFn: (name: string) => bibliotecaApi.renombrarPlaylist(playlistId, name),
    onSuccess: () => {
      setRenaming(false)
      queryClient.invalidateQueries({ queryKey: playlistKey })
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY })
      toast.success('Playlist renombrada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo renombrar la playlist.')),
  })

  const remove = useMutation({
    mutationFn: () => bibliotecaApi.eliminarPlaylist(playlistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY })
      toast.success('Playlist eliminada')
      onBack()
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar la playlist.')),
  })

  const removeTrack = useMutation({
    mutationFn: (factId: number) => bibliotecaApi.quitarTrackDePlaylist(playlistId, factId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKey })
      toast.success('Canción quitada de la playlist')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo quitar la canción.')),
  })

  const reorder = useMutation({
    mutationFn: (factIds: number[]) => bibliotecaApi.reordenarPlaylist(playlistId, factIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playlistKey }),
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo reordenar la playlist.')),
  })

  const addColaborador = useMutation({
    mutationFn: (email: string) => bibliotecaApi.agregarColaborador(playlistId, email),
    onSuccess: (res) => {
      setColabEmail('')
      queryClient.invalidateQueries({ queryKey: playlistKey })
      toast.success(`${res.nombre} agregado como colaborador`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo agregar al colaborador.')),
  })

  const removeColaborador = useMutation({
    mutationFn: (usuarioId: string) => bibliotecaApi.quitarColaborador(playlistId, usuarioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKey })
      toast.success('Colaborador quitado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo quitar al colaborador.')),
  })

  const toggleVisibilidad = useMutation({
    mutationFn: (esPublica: boolean) => bibliotecaApi.actualizarVisibilidadPlaylist(playlistId, esPublica),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: playlistKey })
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY })
      toast.success(res.es_publica ? 'Playlist ahora es pública' : 'Playlist ahora es privada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar la visibilidad de la playlist.')),
  })

  function moveTrack(index: number, direction: -1 | 1) {
    if (!data) return
    const target = index + direction
    if (target < 0 || target >= data.data.length || reorder.isPending) return
    const factIds = data.data.map((t) => t.fact_id)
    const [moved] = factIds.splice(index, 1)
    factIds.splice(target, 0, moved)
    reorder.mutate(factIds)
  }

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
              onClick={() => setShowColaboradores((v) => !v)}
            >
              Colaboradores{data.colaboradores.length > 0 ? ` (${data.colaboradores.length})` : ''}
            </button>
            {data.is_owner && (
              <>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => toggleVisibilidad.mutate(!data.es_publica)}
                  disabled={toggleVisibilidad.isPending}
                  title="Las playlists públicas aparecen en tu perfil público"
                >
                  {data.es_publica
                    ? <><Globe size={14} aria-hidden="true" /> Pública</>
                    : <><Lock size={14} aria-hidden="true" /> Privada</>}
                </button>
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
                  onClick={async () => {
                    const ok = await confirm(`¿Eliminar la playlist "${data.name}"? Esta acción no se puede deshacer.`, { danger: true, confirmLabel: 'Eliminar' })
                    if (ok) remove.mutate()
                  }}
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {showColaboradores && (
        <div className={styles.colabPanel}>
          {data.colaboradores.length === 0 ? (
            <p className={styles.colabEmpty}>
              {data.is_owner ? 'Todavía no invitaste a nadie a colaborar.' : 'Esta playlist no tiene otros colaboradores.'}
            </p>
          ) : (
            <ul className={styles.colabList}>
              {data.colaboradores.map((c) => (
                <li key={c.usuario_id} className={styles.colabRow}>
                  <Link to={`/usuarios/${c.usuario_id}`} className={styles.colabName}>{c.nombre || c.email}</Link>
                  {data.is_owner && (
                    <button
                      type="button"
                      className={styles.colabRemove}
                      onClick={() => removeColaborador.mutate(c.usuario_id)}
                      title="Quitar colaborador"
                      aria-label={`Quitar a ${c.nombre || c.email} de la playlist`}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {data.is_owner && (
            <form
              className={styles.colabForm}
              onSubmit={(e) => {
                e.preventDefault()
                if (colabEmail.trim()) addColaborador.mutate(colabEmail.trim())
              }}
              noValidate
            >
              <input
                className={styles.input}
                type="email"
                maxLength={254}
                value={colabEmail}
                onChange={(e) => setColabEmail(e.target.value)}
                placeholder="Email del colaborador…"
              />
              <button type="submit" className={styles.btnPrimary} disabled={!colabEmail.trim() || addColaborador.isPending}>
                Invitar
              </button>
            </form>
          )}

          {addColaborador.isError && (
            <ErrorState compact message={apiErrorMessage(addColaborador.error, 'No se pudo agregar al colaborador.')} />
          )}
        </div>
      )}

      {data.data.length === 0 ? (
        <EmptyState
          icon="( ∅ )"
          title="Esta playlist está vacía."
          body="Agrega canciones desde el catálogo."
        />
      ) : (
        <ul className={styles.trackList} aria-label={`Canciones de ${data.name}`}>
          {data.data.map((t, i) => (
            <li key={t.fact_id} className={styles.reorderRow}>
              <div className={styles.reorderControls}>
                <button
                  type="button"
                  className={styles.reorderBtn}
                  onClick={() => moveTrack(i, -1)}
                  disabled={i === 0 || reorder.isPending}
                  title="Mover arriba"
                  aria-label={`Mover "${t.track_name}" arriba`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.reorderBtn}
                  onClick={() => moveTrack(i, 1)}
                  disabled={i === data.data.length - 1 || reorder.isPending}
                  title="Mover abajo"
                  aria-label={`Mover "${t.track_name}" abajo`}
                >
                  ↓
                </button>
              </div>
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
  const toast = useToast()
  const confirm = useConfirm()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: PLAYLISTS_KEY,
    queryFn:  () => bibliotecaApi.playlists(),
  })

  const create = useMutation({
    mutationFn: (n: string) => bibliotecaApi.crearPlaylist(n),
    onSuccess: (pl) => {
      setName('')
      setShowCreate(false)
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY })
      toast.success(`Playlist "${pl.name}" creada`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear la playlist.')),
  })

  const remove = useMutation({
    mutationFn: (playlistId: string) => bibliotecaApi.eliminarPlaylist(playlistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY })
      toast.success('Playlist eliminada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar la playlist.')),
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
        <EmptyState
          icon="( ∅ )"
          title="Aún no tienes playlists."
          body="¡Crea una y organiza tu música!"
        />
      ) : (
        <div className={styles.grid}>
          {playlists.map((pl) => (
            <button
              key={pl.playlist_id}
              type="button"
              className={styles.card}
              onClick={() => setSelectedId(pl.playlist_id)}
            >
              <span className={styles.cardArt}>
                <PlaylistCollage playlistId={pl.playlist_id} portadaUrls={pl.portada_urls} size={180} />
              </span>
              <span className={styles.cardName}>{pl.name}</span>
              <span className={styles.cardCount}>{pl.track_count} canción{pl.track_count !== 1 ? 'es' : ''}</span>
              <span
                className={styles.cardDelete}
                role="button"
                tabIndex={0}
                title="Eliminar playlist"
                aria-label={`Eliminar playlist ${pl.name}`}
                onClick={async (e) => {
                  e.stopPropagation()
                  const ok = await confirm(`¿Eliminar la playlist "${pl.name}"? Esta acción no se puede deshacer.`, { danger: true, confirmLabel: 'Eliminar' })
                  if (ok) remove.mutate(pl.playlist_id)
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
