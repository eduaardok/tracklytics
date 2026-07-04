import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAuthenticated } from '@shared/lib/session'
import { bibliotecaApi } from '../api/biblioteca.api'
import styles from './AddToPlaylistMenu.module.css'

const QUERY_KEY = ['biblioteca', 'playlists']

type Props = { factId: number }

const MENU_ESTIMATED_HEIGHT = 320

export function AddToPlaylistMenu({ factId }: Props) {
  const [open, setOpen]         = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [newName, setNewName]   = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  () => bibliotecaApi.playlists(),
    enabled:  open,
  })
  const playlists = data?.data ?? []

  const addTo = useMutation({
    mutationFn: (playlistId: string) => bibliotecaApi.agregarTrackAPlaylist(playlistId, factId),
    onSuccess: (res, playlistId) => {
      const pl = playlists.find((p) => p.playlist_id === playlistId)
      setFeedback(res.already_added ? `Ya está en "${pl?.name}"` : `✓ Agregado a "${pl?.name}"`)
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const createAndAdd = useMutation({
    mutationFn: async (name: string) => {
      const pl = await bibliotecaApi.crearPlaylist(name)
      await bibliotecaApi.agregarTrackAPlaylist(pl.playlist_id, factId)
      return pl
    },
    onSuccess: (pl) => {
      setFeedback(`✓ Playlist "${pl.name}" creada`)
      setNewName('')
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (!isAuthenticated()) return null

  function toggle(e: ReactMouseEvent) {
    e.stopPropagation()
    setFeedback(null)
    setOpen((v) => {
      const next = !v
      if (next && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        setOpenUpward(spaceBelow < MENU_ESTIMATED_HEIGHT)
      }
      return next
    })
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={toggle}
        aria-label="Agregar a playlist"
        title="Agregar a playlist"
      >
        ⋮
      </button>
      {open && (
        <div
          className={openUpward ? `${styles.menu} ${styles.menuUp}` : styles.menu}
          onClick={(e) => e.stopPropagation()}
        >
          {playlists.length === 0 ? (
            <p className={styles.empty}>Aún no tienes playlists.</p>
          ) : (
            <ul className={styles.list}>
              {playlists.map((pl) => (
                <li key={pl.playlist_id}>
                  <button type="button" className={styles.item} onClick={() => addTo.mutate(pl.playlist_id)}>
                    <span>{pl.name}</span>
                    <span className={styles.count}>{pl.track_count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className={styles.createForm}
            onSubmit={(e) => {
              e.preventDefault()
              if (newName.trim()) createAndAdd.mutate(newName.trim())
            }}
          >
            <input
              className={styles.input}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nueva playlist…"
              maxLength={60}
            />
            <button type="submit" className={styles.createBtn} disabled={!newName.trim() || createAndAdd.isPending}>
              Crear
            </button>
          </form>
          {feedback && <p className={styles.feedback}>{feedback}</p>}
        </div>
      )}
    </div>
  )
}
