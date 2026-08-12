import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { catalogoApi } from '@packages/catalogo'
import { ApiError, apiErrorMessage } from '@shared/lib/api-client'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { creadoresApi } from '../api/creadores.api'
import type { EstadoCuenta, EstadoRevision, SubidaTrack } from '../types'
import styles from './CreadoresPages.module.css'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function MicIcon() {
  return (
    <svg className={styles.icon} width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 9.5a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 15.5v2.5M7 18h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.2l2.4 2.4L9.5 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function UploadTrayIcon() {
  return (
    <svg className={styles.icon} width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 4v13M14 4l-4.5 4.5M14 4l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18v3.5a1.5 1.5 0 0 0 1.5 1.5h15a1.5 1.5 0 0 0 1.5-1.5V18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EstadoBadge({ estado }: { estado: EstadoCuenta | EstadoRevision }) {
  const isOk      = estado === 'aprobada' || estado === 'aprobado'
  const isPending = estado === 'pendiente'
  const cls = isOk ? styles.badgeOk : isPending ? styles.badgePending : styles.badgeError

  return (
    <span className={`${styles.badge} ${cls}`}>
      {isPending
        ? <span className={`${styles.badgeDot} ${styles.pulseDot}`} aria-hidden="true" />
        : isOk
        ? <CheckIcon />
        : <XIcon />}
      {estado}
    </span>
  )
}

// Antes comparaba `error.message.startsWith('API 404')` — funcionaba porque
// el mensaje genérico tenía ese formato por casualidad, pero era frágil
// (dependía de un string, no de datos). `ApiError.status` es explícito.
function esNoEncontrado(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

function SkelTrackRow() {
  return (
    <li className={styles.trackRow} aria-hidden="true">
      <span className={styles.trackInfo}>
        <span className={styles.skel} style={{ width: '55%', height: 14 }} />
        <span className={styles.skel} style={{ width: '30%', height: 11, marginTop: 4 }} />
      </span>
      <span className={styles.skel} style={{ width: 64, height: 20, borderRadius: 999 }} />
    </li>
  )
}

export function CuentaArtistaPage() {
  useDocumentTitle('Creadores')
  // Llega precargado cuando el registro entra por la tarjeta "Artista"
  // (RegisterPage → `/creadores?onboarding=artista&nombre=...`) — el nombre
  // artístico arranca en blanco de todos modos si el visitante llega
  // directo a `/creadores` sin pasar por ese flujo.
  const [searchParams] = useSearchParams()
  const [nombreArtistico, setNombreArtistico] = useState(searchParams.get('nombre') ?? '')
  const [trackName, setTrackName]             = useState('')
  const [albumName, setAlbumName]             = useState('')
  const [genreId, setGenreId]                 = useState('')
  const [durationSeconds, setDurationSeconds] = useState('')
  const [explicit, setExplicit]               = useState(false)

  const queryClient = useQueryClient()
  const toast = useToast()

  const cuenta = useQuery({
    queryKey: ['creadores', 'cuenta'],
    queryFn:  () => creadoresApi.miCuenta(),
    retry:    false,
  })

  const generos = useQuery({
    queryKey: ['catalogo', 'generos'],
    queryFn:  () => catalogoApi.genresList(),
    enabled:  cuenta.data?.estado_cuenta === 'aprobada',
  })

  const tracks = useQuery({
    queryKey: ['creadores', 'tracks'],
    queryFn:  () => creadoresApi.misTracks(),
    enabled:  cuenta.data?.estado_cuenta === 'aprobada',
  })

  const solicitar = useMutation({
    mutationFn: () => creadoresApi.solicitarCuenta({ nombre_artistico: nombreArtistico }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creadores', 'cuenta'] })
      toast.success('Solicitud de cuenta de artista enviada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo enviar la solicitud de cuenta de artista.')),
  })

  const subir = useMutation({
    mutationFn: () =>
      creadoresApi.subirTrack({
        track_name:  trackName,
        album_name:  albumName,
        genre_id:    Number(genreId),
        duration_ms: Math.round(Number(durationSeconds) * 1000),
        explicit,
      }),
    onSuccess: () => {
      setTrackName(''); setAlbumName(''); setGenreId(''); setDurationSeconds(''); setExplicit(false)
      queryClient.invalidateQueries({ queryKey: ['creadores', 'tracks'] })
      toast.success('Track subido — pendiente de revisión')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo subir el track.')),
  })

  const [editTrack, setEditTrack] = useState<SubidaTrack | null>(null)
  const confirm = useConfirm()

  const editar = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { track_name: string; album_name: string; genre_id: number; descripcion: string } }) =>
      creadoresApi.editarTrack(id, body),
    onSuccess: (res) => {
      setEditTrack(null)
      queryClient.invalidateQueries({ queryKey: ['creadores', 'tracks'] })
      toast.success(res.estado === 'pendiente' ? 'Track actualizado — vuelve a revisión' : 'Track actualizado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar el track.')),
  })
  const retirar = useMutation({
    mutationFn: (id: string) => creadoresApi.retirarTrack(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creadores', 'tracks'] })
      toast.success('Track retirado del catálogo')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo retirar el track.')),
  })
  async function pedirRetirar(t: SubidaTrack) {
    if (await confirm(`"${t.track_name}" dejará de estar disponible en el catálogo. Esta acción retira el track.`, { title: 'Retirar track', danger: true })) {
      retirar.mutate(t.subida_id)
    }
  }

  const noTieneCuenta = cuenta.isError && esNoEncontrado(cuenta.error)
  const tracksData: SubidaTrack[] = tracks.data?.data ?? []
  const generosData = generos.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Creadores</h1>

      {cuenta.isLoading && (
        <div className={styles.panel} style={{ maxWidth: 480 }}>
          <span className={styles.skel} style={{ width: '60%', height: 16, marginBottom: 8 }} />
          <span className={styles.skel} style={{ width: '85%', height: 12 }} />
        </div>
      )}

      {cuenta.isError && !noTieneCuenta && (
        <ErrorState message="No se pudo cargar tu cuenta de artista — ¿hay sesión activa?" />
      )}

      {noTieneCuenta && (
        <div className={styles.applyPanel}>
          <div className={styles.applyIcon}><MicIcon /></div>
          <h2 className={styles.applyTitle}>Publica tu música en Tracklytics</h2>
          <p className={styles.applyBody}>
            Solicita una cuenta de artista para subir tus tracks al catálogo. Un administrador revisa
            cada solicitud antes de aprobarla.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!nombreArtistico.trim()) {
                toast.error('Escribe un nombre artístico.')
                return
              }
              solicitar.mutate()
            }}
            noValidate
          >
            <div className={styles.field} style={{ marginBottom: 'var(--space-md)' }}>
              <label className={styles.fieldLabel} htmlFor="nombre_artistico">Nombre artístico</label>
              <input
                id="nombre_artistico"
                className={styles.input}
                type="text"
                maxLength={150}
                value={nombreArtistico}
                onChange={(e) => setNombreArtistico(e.target.value)}
                placeholder="DJ Nova"
                required
              />
            </div>
            <button className={`${styles.btnPrimary} ${styles['btnPrimary--full']}`} type="submit" disabled={solicitar.isPending}>
              {solicitar.isPending ? 'Enviando…' : 'Solicitar cuenta de artista'}
            </button>
          </form>
          {solicitar.isError && (
            <ErrorState
              message="No se pudo enviar la solicitud. Intenta de nuevo."
              style={{ marginTop: 'var(--space-md)' }}
            />
          )}
        </div>
      )}

      {cuenta.data && (
        <>
          <div className={styles.statusPanel}>
            <div className={styles.statusInfo}>
              <div className={styles.statusName}>{cuenta.data.nombre_artistico}</div>
              <div className={styles.statusMeta}>solicitada {fmtDate(cuenta.data.fecha_solicitud)}</div>
              {cuenta.data.estado_cuenta === 'pendiente' && (
                <p className={styles.statusHint}>
                  Tu solicitud está pendiente de revisión por un administrador. Te habilitaremos la
                  subida de tracks en cuanto se apruebe.
                </p>
              )}
              {cuenta.data.estado_cuenta === 'rechazada' && (
                <p className={styles.statusHint}>Tu solicitud fue rechazada.</p>
              )}
            </div>
            <EstadoBadge estado={cuenta.data.estado_cuenta} />
          </div>

          {cuenta.data.estado_cuenta === 'aprobada' && (
            <>
              <p className={styles.sectionLabel}>Subir un track</p>
              <form
                className={styles.uploadForm}
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!trackName.trim() || !genreId || !durationSeconds) {
                    toast.error('Completa nombre, género y duración del track.')
                    return
                  }
                  subir.mutate()
                }}
                noValidate
              >
                <div className={`${styles.field} ${styles['field--wide']}`}>
                  <label className={styles.fieldLabel} htmlFor="track_name">Nombre del track</label>
                  <input
                    id="track_name"
                    className={styles.input}
                    type="text"
                    maxLength={200}
                    value={trackName}
                    onChange={(e) => setTrackName(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="album_name">Álbum (opcional)</label>
                  <input
                    id="album_name"
                    className={styles.input}
                    type="text"
                    maxLength={200}
                    value={albumName}
                    onChange={(e) => setAlbumName(e.target.value)}
                    placeholder="Sencillo"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="genre_id">Género</label>
                  <select
                    id="genre_id"
                    className={styles.select}
                    value={genreId}
                    onChange={(e) => setGenreId(e.target.value)}
                    required
                  >
                    <option value="" disabled>Selecciona…</option>
                    {generosData.map((g) => (
                      <option key={g.genre_id} value={g.genre_id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="duration_seconds">Duración (segundos)</label>
                  <input
                    id="duration_seconds"
                    className={styles.input}
                    type="number"
                    min={1}
                    max={10800}
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(e.target.value)}
                    placeholder="198"
                    required
                  />
                </div>
                <div className={`${styles.field} ${styles.checkboxField}`}>
                  <input
                    id="explicit"
                    type="checkbox"
                    checked={explicit}
                    onChange={(e) => setExplicit(e.target.checked)}
                  />
                  <label className={styles.fieldLabel} htmlFor="explicit">Contenido explícito</label>
                </div>
                <button className={`${styles.btnPrimary} ${styles['btnPrimary--full']}`} type="submit" disabled={subir.isPending}>
                  {subir.isPending ? 'Subiendo…' : 'Subir track'}
                </button>
              </form>
              {subir.isError && <ErrorState message="No se pudo subir el track. Intenta de nuevo." />}

              <p className={styles.sectionLabel}>Mis tracks subidos</p>
              {tracks.isLoading ? (
                <ul className={styles.trackList}>
                  <SkelTrackRow /><SkelTrackRow /><SkelTrackRow />
                </ul>
              ) : tracksData.length === 0 ? (
                <div className={styles.emptyState}>
                  <UploadTrayIcon />
                  <span className={styles.emptyTitle}>Sin tracks subidos todavía</span>
                  <span className={styles.emptyBody}>Sube tu primer track con el formulario de arriba — quedará pendiente de revisión.</span>
                </div>
              ) : (
                <ul className={styles.trackList}>
                  {tracksData.map((t) => (
                    <li key={t.subida_id} className={styles.trackRow}>
                      <div className={styles.trackInfo}>
                        <span className={styles.trackName}>{t.track_name}</span>
                        <span className={styles.trackMeta}>{fmtDuration(t.duration_ms)} · {fmtDate(t.fecha_subida)}</span>
                      </div>
                      <div className={styles.trackActions}>
                        <EstadoBadge estado={t.estado_nombre} />
                        {t.estado_nombre !== 'retirado' && (
                          <>
                            <button type="button" className={styles.btnGhost} onClick={() => setEditTrack(t)}>Editar</button>
                            <button type="button" className={styles.btnGhostDanger} onClick={() => pedirRetirar(t)}>Retirar</button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {editTrack && (
        <TrackEditDialog
          track={editTrack}
          generos={generosData}
          pending={editar.isPending}
          onClose={() => setEditTrack(null)}
          onSave={(body) => editar.mutate({ id: editTrack.subida_id, body })}
        />
      )}
    </section>
  )
}

// Edición de metadata de un track propio (change p1-ciclos-vida). Un track
// aprobado editado vuelve a `pendiente` para revisión editorial.
function TrackEditDialog({ track, generos, pending, onClose, onSave }: {
  track: SubidaTrack
  generos: { genre_id: number; name: string }[]
  pending: boolean
  onClose: () => void
  onSave: (body: { track_name: string; album_name: string; genre_id: number; descripcion: string }) => void
}) {
  const [nombre, setNombre] = useState(track.track_name)
  const [album, setAlbum] = useState(track.album_name)
  const [genreId, setGenreId] = useState(String(track.genre_id))
  const [descripcion, setDescripcion] = useState(track.descripcion ?? '')

  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Editar track" onMouseDown={(e) => e.stopPropagation()}>
        <p className={styles.modalTitle}>Editar track</p>
        {track.estado_nombre === 'aprobado' && (
          <p className={styles.modalBody}>Este track está aprobado: al guardar volverá a revisión editorial.</p>
        )}
        <form className={styles.modalForm} onSubmit={(e) => {
          e.preventDefault()
          if (!nombre.trim()) return
          onSave({ track_name: nombre.trim(), album_name: album.trim(), genre_id: Number(genreId), descripcion: descripcion.trim() })
        }}>
          <label className={styles.modalField}><span className={styles.fieldLabel}>Nombre</span><input className={styles.input} maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <label className={styles.modalField}><span className={styles.fieldLabel}>Álbum</span><input className={styles.input} maxLength={200} value={album} onChange={(e) => setAlbum(e.target.value)} /></label>
          <label className={styles.modalField}><span className={styles.fieldLabel}>Género</span>
            <select className={styles.input} value={genreId} onChange={(e) => setGenreId(e.target.value)}>
              {generos.map((g) => <option key={g.genre_id} value={g.genre_id}>{g.name}</option>)}
            </select>
          </label>
          <label className={styles.modalField}><span className={styles.fieldLabel}>Descripción</span><textarea className={styles.textarea} rows={3} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={pending || !nombre.trim()}>{pending ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
