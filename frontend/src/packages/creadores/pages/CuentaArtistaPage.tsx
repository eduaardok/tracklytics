import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Coins, LineChart, Users } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { catalogoApi } from '@packages/catalogo'
import { regaliasApi } from '@packages/regalias'
import { ApiError, apiErrorMessage, fieldErrorsFromApiError } from '@shared/lib/api-client'
import { ErrorState } from '@shared/components/ErrorState'
import { AlbumArt } from '@shared/components/AlbumArt'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { creadoresApi } from '../api/creadores.api'
import { ArtistaHubTabs, type ArtistaHubVista } from '../components/ArtistaHubTabs'
import { PanelAnaliticaArtista } from '../components/PanelAnaliticaArtista'
import type { EstadoCuenta, EstadoRevision, SubidaTrack } from '../types'
import styles from './CreadoresPages.module.css'

// Helpers puros del preview de subida (S17) — mismo formato mm:ss que
// TrackCard/TrackGridCard usan para `duration_ms`, acá sobre segundos crudos.
function formatDurationPreview(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function genreNames(generos: { genre_id: number; name: string }[], ids: number[]): string {
  return ids
    .map((id) => generos.find((g) => g.genre_id === id)?.name)
    .filter((n): n is string => !!n)
    .join(', ')
}

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

type UploadStep = 'subiendo' | 'analizando' | 'verificando' | 'publicado'

const UPLOAD_STEPS: { key: UploadStep; label: string }[] = [
  { key: 'subiendo',    label: 'Subiendo archivo' },
  { key: 'analizando',  label: 'Analizando audio' },
  { key: 'verificando', label: 'Verificando derechos' },
  { key: 'publicado',   label: 'Pendiente de revisión' },
]

// Simulación de procesamiento tipo YouTube (S16, FASE 5) — puramente de
// percepción de producto: el track ya quedó guardado en el backend con la
// llamada real (ver mutación `subir`), esto es solo la capa visual de pasos
// sobre esa misma llamada, nunca un segundo intento ni un estado inventado
// que no corresponda al flujo real de aprobación (el paso final es
// "Pendiente de revisión", el estado real con el que la subida siempre
// queda hasta que un admin la aprueba).
function UploadProgress({ step }: { step: UploadStep }) {
  const activeIndex = UPLOAD_STEPS.findIndex((s) => s.key === step)
  return (
    <div className={styles.uploadProgress} role="status" aria-live="polite">
      <div className={styles.uploadProgressBarTrack}>
        <div
          className={styles.uploadProgressBarFill}
          style={{ transform: `scaleX(${(activeIndex + 1) / UPLOAD_STEPS.length})` }}
        />
      </div>
      <ul className={styles.uploadProgressSteps}>
        {UPLOAD_STEPS.map((s, i) => (
          <li
            key={s.key}
            className={
              i < activeIndex ? styles.uploadStepDone
                : i === activeIndex ? styles.uploadStepActive
                : styles.uploadStepPending
            }
          >
            {i < activeIndex ? <CheckIcon /> : <span className={styles.uploadStepDot} aria-hidden="true" />}
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  )
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
  // F2: pestaña activa del hub — ?vista=comentarios muestra el índice de
  // hilos por track publicado; S16-P9 (R2) suma ?vista=analitica con el
  // panel de engagement propio. Música es la vista default y Ganancias vive
  // en /regalias/ganancias (ruta existente, solo se agrupa aquí).
  const vistaParam = searchParams.get('vista')
  const vista: ArtistaHubVista =
    vistaParam === 'comentarios' || vistaParam === 'analitica' ? vistaParam : 'musica'
  // F2: el formulario de subida pasaba siempre desplegado arriba de todo,
  // empujando la gestión de tracks ya publicados (uso más frecuente) bajo
  // el pliegue. Ahora arranca colapsado y la lista manda.
  const [mostrarFormSubida, setMostrarFormSubida] = useState(false)
  const [nombreArtistico, setNombreArtistico] = useState(searchParams.get('nombre') ?? '')
  const [trackName, setTrackName]             = useState('')
  const [albumName, setAlbumName]             = useState('')
  // Multi-género (S16): antes un único `genreId` con un <select>.
  const [genreIds, setGenreIds]               = useState<number[]>([])
  const [durationSeconds, setDurationSeconds] = useState('')
  const [explicit, setExplicit]               = useState(false)
  // Errores por campo del formulario de subida (S16 — auditoría de
  // revisores): antes cualquier 422 caía a un `ErrorState` genérico fijo
  // ("No se pudo subir el track. Intenta de nuevo.") que ni siquiera leía el
  // error real de la mutación.
  const [uploadFieldErrors, setUploadFieldErrors] = useState<Record<string, string>>({})
  // Simulación de procesamiento tipo YouTube (S16, FASE 5) — puramente de
  // percepción de producto, no un paso real adicional: el track ya se
  // guarda en STG_ARTIST_UPLOADS con la llamada real de siempre, esto solo
  // agrega feedback visual de pasos alrededor de esa misma llamada. Mismo
  // patrón cosmético ya establecido en FacturacionPage.tsx (`procesando`,
  // "Validando…"/"Autorizando…" antes del cobro real).
  const [uploadStep, setUploadStep] = useState<null | 'subiendo' | 'analizando' | 'verificando' | 'publicado'>(null)

  const queryClient = useQueryClient()
  const toast = useToast()

  const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

  // Resumen de métricas propias (F2): streams LIQUIDADOS de regalías
  // (mis-ganancias-artista, mismo queryKey que MisGananciasPage — cache
  // compartida). El engagement EN VIVO por track propio (plays/likes/
  // favoritos/oyentes) vive en la vista Analítica del hub — endpoint
  // mi-analitica desde S16-P9, que cubrió el gap que esta nota reportaba.
  const ganancias = useQuery({
    queryKey: ['regalias', 'mis-ganancias-artista'],
    queryFn:  () => regaliasApi.misGananciasArtista(),
    enabled:  cuenta.data?.estado_cuenta === 'aprobada',
    retry:    false,
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
    mutationFn: async () => {
      // Secuencia de pasos (FASE 5) alrededor de la única llamada real —
      // el track ya queda guardado en STG_ARTIST_UPLOADS/FACT_SUBIDA_TRACK
      // en cuanto `subirTrack` resuelve, los pasos de antes/después son
      // solo feedback visual (no bloquean ni repiten nada del backend).
      setUploadStep('subiendo')
      await esperar(500)
      setUploadStep('analizando')
      await esperar(700)
      setUploadStep('verificando')
      await esperar(500)
      const res = await creadoresApi.subirTrack({
        track_name:  trackName,
        album_name:  albumName,
        genre_ids:   genreIds,
        duration_ms: Math.round(Number(durationSeconds) * 1000),
        explicit,
      })
      setUploadStep('publicado')
      await esperar(500)
      return res
    },
    onSuccess: () => {
      setTrackName(''); setAlbumName(''); setGenreIds([]); setDurationSeconds(''); setExplicit(false)
      setUploadFieldErrors({})
      setUploadStep(null)
      queryClient.invalidateQueries({ queryKey: ['creadores', 'tracks'] })
      toast.success('Track subido — pendiente de revisión')
    },
    onError: (err) => {
      setUploadStep(null)
      // Antes: `<ErrorState message="No se pudo subir el track. Intenta de
      // nuevo." />` fijo, ignoraba el error real de la mutación por completo
      // (auditoría S16). `genre_ids`/`duration_ms` llegan con `loc` anidado
      // (`['body','genre_ids']`), `fieldErrorsFromApiError` ya lo resuelve al
      // último segmento no numérico.
      const porCampo = fieldErrorsFromApiError(err)
      setUploadFieldErrors(porCampo ?? {})
      toast.error(apiErrorMessage(err, 'No se pudo subir el track.'))
    },
  })

  const [editTrack, setEditTrack] = useState<SubidaTrack | null>(null)
  const confirm = useConfirm()

  const editar = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { track_name: string; album_name: string; genre_ids: number[]; descripcion: string } }) =>
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
  const porEstado = tracksData.reduce<Record<string, number>>((acc, t) => {
    acc[t.estado_nombre] = (acc[t.estado_nombre] ?? 0) + 1
    return acc
  }, {})
  const streamsLiquidados = (ganancias.data?.data ?? []).reduce((s, g) => s + g.streams_periodo, 0)
  const tracksConHilo = tracksData.filter((t) => t.fact_id_promovido != null)

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

          {/* Beneficios reales (S17, TASK 4) — no inventados: regalías por
              reproducción (paquete `regalias`, ya visible más abajo en
              "Tus ganancias"), el panel de audiencia propio
              (`PanelAnaliticaArtista`, ya usado en esta misma página para
              cuentas aprobadas) y el alcance del catálogo compartido de
              Tracklytics. */}
          <div className={styles.applyBenefits}>
            <div className={styles.applyBenefitItem}>
              <span className={styles.applyBenefitIcon} aria-hidden="true"><Coins size={15} /></span>
              <span className={styles.applyBenefitText}>
                <strong>Regalías por reproducción</strong> — cada vez que alguien escucha tu música, se
                calculan tus ganancias reales, visibles en "Tus ganancias".
              </span>
            </div>
            <div className={styles.applyBenefitItem}>
              <span className={styles.applyBenefitIcon} aria-hidden="true"><LineChart size={15} /></span>
              <span className={styles.applyBenefitText}>
                <strong>Panel de audiencia propio</strong> — reproducciones, oyentes y tendencia de 30
                días por cada track que publiques, solo para artistas aprobados.
              </span>
            </div>
            <div className={styles.applyBenefitItem}>
              <span className={styles.applyBenefitIcon} aria-hidden="true"><Users size={15} /></span>
              <span className={styles.applyBenefitText}>
                <strong>Alcance del catálogo</strong> — tu música queda disponible junto al resto del
                catálogo de Tracklytics, descubrible desde la búsqueda y el catálogo general.
              </span>
            </div>
          </div>

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
              <ArtistaHubTabs activa={vista} />

              {vista === 'analitica' ? (
                <>
                  {/* R2 (S16-P9): engagement real sobre tracks promovidos
                      propios — KPIs con count-up, serie de 30 días y tabla
                      por track. El endpoint hace el gating (403 sin cuenta). */}
                  <p className={styles.sectionLabel}>Tu audiencia</p>
                  <PanelAnaliticaArtista aprobada />
                </>
              ) : vista === 'comentarios' ? (
                <>
                  {/* F2: índice de hilos de comentarios por track publicado.
                      Reusa /social/track/:factId (UI existente) — acá solo se
                      concentra la puerta de entrada, una por track. */}
                  <p className={styles.sectionLabel}>Comentarios recibidos</p>
                  {tracks.isLoading ? (
                    <ul className={styles.trackList}>
                      <SkelTrackRow /><SkelTrackRow />
                    </ul>
                  ) : tracksConHilo.length === 0 ? (
                    <div className={styles.emptyState}>
                      <span className={styles.emptyTitle}>Todavía no tienes tracks con hilo de comentarios</span>
                      <span className={styles.emptyBody}>
                        Los comentarios se activan cuando un track tuyo es aprobado y promovido al catálogo.
                      </span>
                    </div>
                  ) : (
                    <ul className={styles.trackList}>
                      {tracksConHilo.map((t) => (
                        <li key={t.subida_id} className={styles.trackRow}>
                          <div className={styles.trackInfo}>
                            <span className={styles.trackName}>{t.track_name}</span>
                            <span className={styles.trackMeta}>{fmtDuration(t.duration_ms)} · {fmtDate(t.fecha_subida)}</span>
                          </div>
                          <div className={styles.trackActions}>
                            <Link to={`/social/track/${t.fact_id_promovido}`} className={styles.btnGhost}>
                              Ver hilo
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  {/* F2: resumen propio arriba, por frecuencia de uso. Los
                      streams vienen de las liquidaciones ya existentes; los
                      conteos, de misTracks. */}
                  <div className={styles.hubStatsGrid}>
                    <div className={styles.kpiPanel}>
                      <span className={styles.kpiValue}>{porEstado.aprobado ?? 0}</span>
                      <span className={styles.kpiLabel}>Tracks publicados</span>
                    </div>
                    <div className={styles.kpiPanel}>
                      <span className={styles.kpiValue}>{porEstado.pendiente ?? 0}</span>
                      <span className={styles.kpiLabel}>En revisión</span>
                    </div>
                    <div className={styles.kpiPanel}>
                      <span className={styles.kpiValue}>{streamsLiquidados.toLocaleString('es-ES')}</span>
                      <span className={styles.kpiLabel}>Streams liquidados</span>
                    </div>
                    <div className={styles.kpiPanel}>
                      <span className={styles.kpiValue}>{tracksConHilo.length}</span>
                      <span className={styles.kpiLabel}>Hilos de comentarios</span>
                    </div>
                  </div>

                  <p className={styles.sectionLabel}>Mis tracks subidos</p>
                  {tracks.isLoading ? (
                    <ul className={styles.trackList}>
                      <SkelTrackRow /><SkelTrackRow /><SkelTrackRow />
                    </ul>
                  ) : tracksData.length === 0 ? (
                    <div className={styles.emptyState}>
                      <UploadTrayIcon />
                      <span className={styles.emptyTitle}>Sin tracks subidos todavía</span>
                      <span className={styles.emptyBody}>Usa «Subir un track» aquí abajo para enviar el primero — quedará pendiente de revisión.</span>
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
                            {/* Comentarios recibidos (S16 — vista de artista): reusa
                                la página de comentarios ya existente por track
                                (`/social/track/:factId`), en vez de duplicar la UI
                                de hilos acá. Solo tiene sentido si el track ya fue
                                aprobado y promovido — antes de eso no tiene fact_id
                                en el catálogo real. */}
                            {t.fact_id_promovido != null && (
                              <Link to={`/social/track/${t.fact_id_promovido}`} className={styles.btnGhost}>
                                Comentarios
                              </Link>
                            )}
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

                  {!mostrarFormSubida && (
                    <button type="button" className={styles.btnGhost} onClick={() => setMostrarFormSubida(true)}>
                      + Subir un track nuevo
                    </button>
                  )}
                  {mostrarFormSubida && (
                    <>
                      <p className={styles.sectionLabel}>Subir un track</p>
                      <form
                className={styles.uploadForm}
                onSubmit={(e) => {
                  e.preventDefault()
                  const errores: Record<string, string> = {}
                  if (!trackName.trim()) errores.track_name = 'Ingresa el nombre del track.'
                  if (genreIds.length === 0) errores.genre_ids = 'Selecciona al menos un género.'
                  if (!durationSeconds) errores.duration_ms = 'Ingresa la duración.'
                  if (Object.keys(errores).length > 0) {
                    setUploadFieldErrors(errores)
                    return
                  }
                  setUploadFieldErrors({})
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
                    onChange={(e) => { setTrackName(e.target.value); setUploadFieldErrors((f) => ({ ...f, track_name: '' })) }}
                    required
                  />
                  {uploadFieldErrors.track_name && <span className={styles.fieldHint}>{uploadFieldErrors.track_name}</span>}
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
                {/* Multi-género (S16): FACT_TRACKS ya modela N:M track-género
                    vía filas repetidas por track_id — antes la subida solo
                    permitía elegir uno. */}
                <div className={`${styles.field} ${styles['field--wide']}`}>
                  <span className={styles.fieldLabel}>Géneros</span>
                  <div className={styles.genreMultiSelect} role="group" aria-label="Géneros del track">
                    {generosData.map((g) => (
                      <label key={g.genre_id} className={styles.genreCheckboxItem}>
                        <input
                          type="checkbox"
                          checked={genreIds.includes(g.genre_id)}
                          onChange={(e) => {
                            setGenreIds((prev) => e.target.checked
                              ? [...prev, g.genre_id]
                              : prev.filter((id) => id !== g.genre_id))
                            setUploadFieldErrors((f) => ({ ...f, genre_ids: '' }))
                          }}
                        />
                        {g.name}
                      </label>
                    ))}
                  </div>
                  {uploadFieldErrors.genre_ids && <span className={styles.fieldHint}>{uploadFieldErrors.genre_ids}</span>}
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
                    onChange={(e) => { setDurationSeconds(e.target.value); setUploadFieldErrors((f) => ({ ...f, duration_ms: '' })) }}
                    placeholder="198"
                    required
                  />
                  {uploadFieldErrors.duration_ms && <span className={styles.fieldHint}>{uploadFieldErrors.duration_ms}</span>}
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
                {/* S17: preview en vivo mientras se llena el formulario — mismo
                    tratamiento visual que TrackGridCard (AlbumArt con fallback
                    de género + nombre/artista), sin reusar el componente tal
                    cual porque este está atado a PlayerContext/navegación
                    (Play real, ir al detalle) que no aplican a un track que
                    todavía no existe en el catálogo. */}
                <div className={styles.uploadPreview}>
                  <p className={styles.fieldLabel}>Vista previa en el catálogo</p>
                  <div className={styles.uploadPreviewCard}>
                    <AlbumArt src={null} alt="" size={64} genreSeed={generosData.find((g) => genreIds.includes(g.genre_id))?.name} />
                    <div className={styles.uploadPreviewInfo}>
                      <p className={styles.uploadPreviewName}>{trackName.trim() || 'Nombre del track'}</p>
                      <p className={styles.uploadPreviewMeta}>
                        {nombreArtistico.trim() || 'Tu nombre artístico'}
                        {' · '}
                        {genreIds.length > 0
                          ? genreNames(generosData, genreIds)
                          : 'Sin género'}
                      </p>
                      <p className={styles.uploadPreviewMeta}>
                        {durationSeconds ? formatDurationPreview(Number(durationSeconds)) : '—:—'}
                        {albumName.trim() && ` · ${albumName.trim()}`}
                        {explicit && ' · E'}
                      </p>
                    </div>
                  </div>
                </div>

                <button className={`${styles.btnPrimary} ${styles['btnPrimary--full']}`} type="submit" disabled={subir.isPending}>
                  {subir.isPending ? 'Procesando…' : 'Subir track'}
                </button>
              </form>
                      {uploadStep && <UploadProgress step={uploadStep} />}
                      {subir.isError && Object.keys(uploadFieldErrors).length === 0 && (
                        <ErrorState message={apiErrorMessage(subir.error, 'No se pudo subir el track. Intenta de nuevo.')} />
                      )}
                    </>
                  )}
                </>
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
  onSave: (body: { track_name: string; album_name: string; genre_ids: number[]; descripcion: string }) => void
}) {
  const [nombre, setNombre] = useState(track.track_name)
  const [album, setAlbum] = useState(track.album_name)
  // Multi-género (S16) — precarga desde `genre_ids` si el backend ya lo trae,
  // con `genre_id` como respaldo (tracks editados antes de este cambio).
  const [genreIds, setGenreIds] = useState<number[]>(track.genre_ids?.length ? track.genre_ids : [track.genre_id])
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
          if (!nombre.trim() || genreIds.length === 0) return
          onSave({ track_name: nombre.trim(), album_name: album.trim(), genre_ids: genreIds, descripcion: descripcion.trim() })
        }}>
          <label className={styles.modalField}><span className={styles.fieldLabel}>Nombre</span><input className={styles.input} maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <label className={styles.modalField}><span className={styles.fieldLabel}>Álbum</span><input className={styles.input} maxLength={200} value={album} onChange={(e) => setAlbum(e.target.value)} /></label>
          <div className={styles.modalField}>
            <span className={styles.fieldLabel}>Géneros</span>
            <div className={styles.genreMultiSelect} role="group" aria-label="Géneros del track">
              {generos.map((g) => (
                <label key={g.genre_id} className={styles.genreCheckboxItem}>
                  <input
                    type="checkbox"
                    checked={genreIds.includes(g.genre_id)}
                    onChange={(e) => setGenreIds((prev) => e.target.checked
                      ? [...prev, g.genre_id]
                      : prev.filter((id) => id !== g.genre_id))}
                  />
                  {g.name}
                </label>
              ))}
            </div>
          </div>
          <label className={styles.modalField}><span className={styles.fieldLabel}>Descripción</span><textarea className={styles.textarea} rows={3} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={pending || !nombre.trim() || genreIds.length === 0}>{pending ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
