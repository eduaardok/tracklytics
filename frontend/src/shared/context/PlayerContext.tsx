import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { experienciaApi } from '@packages/experiencia/api/experiencia.api'
import { isAuthenticated } from '@shared/lib/session'
import { useAuthPrompt } from '@shared/context/AuthPromptContext'

export type PlayableTrack = {
  fact_id:     number
  track_name:  string
  artist_name: string
  duration_ms: number
  // RF-EXP-009: portada real (álbum si existe, si no la del artista) — igual
  // que `Track.imagen_url` (packages/catalogo/types.ts). Antes este tipo no
  // lo declaraba: aunque los call-sites de `play()` ya pasaban un `Track`
  // completo (que sí trae el campo), `PlayerBar` no podía leerlo porque el
  // tipo lo descartaba estructuralmente — causa raíz de que el reproductor
  // nunca mostrara portada.
  imagen_url?: string | null
  // Fallback en tiempo real de portada (AlbumArt `trackId`) — mismo criterio
  // que `imagen_url` arriba: opcional porque no todos los llamadores de
  // `play()` lo exponen todavía, pero PlayerBar/QueuePanel sí lo necesitan.
  track_id?:   string
  // S13-P6: mismos campos opcionales de `Track` (packages/catalogo/types.ts)
  // — cuando el llamador los tiene disponibles, el reproductor/cola también
  // muestran el badge "feat."/"(Sint)" vía `TrackName`. Sin ellos (ej. mix
  // diario, que no los expone hoy) el badge simplemente no aparece.
  es_featuring?:  boolean
  artistas_feat?: string[]
  source_type?:   string | null
}

type PlayerContextValue = {
  currentTrack:     PlayableTrack | null
  isPlaying:        boolean
  // Nota: `progressMs` NO vive acá — es el único estado que cambia 2 veces/
  // seg durante la reproducción, y exponerlo en este contexto re-renderizaba
  // a todos los consumidores por el ticker (hallazgo del repaso S17). Se lee
  // con `usePlayerProgress()` (contexto separado, ver más abajo), que solo
  // usa PlayerBar.
  // RF-DIS-007 (bloqueo geográfico) es la única razón que queda para
  // deshabilitar el control de reproducción — decisión posterior del usuario
  // (ver comentario grande más abajo): un fallo de YouTube ya NO cae aquí,
  // cae a reproducción simulada. `playbackUnavailable` solo se activa desde
  // `reportPlaybackIssue`.
  playbackUnavailable: boolean
  playbackUnavailableReason: string | null
  play:             (track: PlayableTrack) => void
  // Reproduce `tracks[startIndex]` y encola el resto vía `replaceQueue` —
  // mismo patrón que ya usaba `useRadio.ts` (play(cola[0]) + replaceQueue
  // (cola.slice(1))), centralizado acá para que cualquier listado (catálogo,
  // álbum, artista, playlist, búsqueda, favoritos, historial) reproduzca "en
  // contexto" en vez de un track suelto que se corta al terminar. También
  // guarda `tracks` como snapshot de sesión para `repeat-all` (ver
  // `repeatMode`) — reencolar desde el principio requiere recordar la lista
  // completa, no solo lo que quedaba por sonar.
  playList:         (tracks: PlayableTrack[], startIndex?: number) => void
  togglePlay:       () => void
  seek:             (ms: number) => void
  // Transporte anterior/siguiente (botones de PlayerBar). `playNext` es el
  // mismo avance que ya dispara automáticamente el fin de un track;
  // `playPrevious` retrocede sobre un historial en memoria de lo ya sonado
  // (no persistido, igual que `queue`). `hasNext`/`hasPrevious` habilitan el
  // deshabilitado visual de cada botón cuando no hay a dónde ir.
  playNext:         () => void
  playPrevious:     () => void
  hasNext:          boolean
  hasPrevious:      boolean
  // Corta la reproducción por completo y limpia el track actual — a
  // diferencia de `togglePlay` (pausa, conserva `currentTrack`/cola), esto
  // deja el reproductor como si nunca se hubiera tocado play. Usado desde
  // `UserMenu::handleLogout`: sin esto, cerrar sesión mientras algo suena
  // dejaba el audio (o el tono simulado) corriendo detrás del login con una
  // sesión ya invalidada, y el siguiente track de la cola intentaba
  // reproducirse contra un token que el backend ya no reconoce.
  stop:             () => void
  // Los call-sites de `registrarReproduccion` (TrackCard/TrackDetailPage/
  // LibraryTrackRow) llaman esto cuando el backend devuelve 403 — antes ese
  // error se descartaba en silencio y el track seguía "reproduciéndose" sin
  // que el usuario supiera que estaba bloqueado.
  reportPlaybackIssue: (reason: string) => void
  // Cola de reproducción (iteración de diseño): en memoria únicamente, no
  // persistida — se vacía al recargar, igual que el resto del estado del
  // reproductor (ver comentario de `PlayerProvider` más abajo).
  queue:            PlayableTrack[]
  enqueue:          (track: PlayableTrack) => void
  // Encolar/reemplazar en bloque (change p2-descubrimiento-comunidad): la radio
  // y el mix diario producen ~25-30 tracks de una vez. `replaceQueue` es lo que
  // hace que "iniciar radio" sustituya la cola en vez de acumularse sobre lo
  // que ya hubiera, que es el comportamiento esperado de una radio.
  enqueueMany:      (tracks: PlayableTrack[]) => void
  replaceQueue:     (tracks: PlayableTrack[]) => void
  removeFromQueue:  (index: number) => void
  moveInQueue:      (index: number, direction: -1 | 1) => void
  // Shuffle inteligente (P2, S16): reordena la cola restante evitando que dos
  // tracks del MISMO artista queden adyacentes — no es un `Math.random()`
  // uniforme (ese podía repetir artista dos veces seguidas por azar), es la
  // heurística real que distingue un shuffle "inteligente" de uno crudo.
  shuffleQueue:     () => void
  // Shuffle PERSISTENTE (S16-P10, brecha P2): mientras está activo, cada
  // avance AUTOMÁTICO de cola elige un track al azar del resto (con la misma
  // heurística anti-racha respecto al track actual) en vez del primero. El
  // `shuffleQueue` de arriba es un one-shot que reordena una vez; este modo
  // sobrevive a encolados nuevos y no reordena nada visible — solo cambia de
  // qué posición sale el próximo track.
  shuffleMode:      boolean
  setShuffleMode:   (on: boolean) => void
  volume:           number
  setVolume:        (volume: number) => void
  // 'none' (default) = se detiene al agotar la cola, igual que antes.
  // 'all' = al agotar la cola, la reencola desde el principio (snapshot de
  // `playList`) en vez de detenerse. 'one' = al terminar el track actual,
  // lo reinicia en vez de avanzar — la cola no se toca.
  repeatMode:       RepeatMode
  setRepeatMode:    (mode: RepeatMode) => void
}

export type RepeatMode = 'none' | 'all' | 'one'

const PlayerContext = createContext<PlayerContextValue | null>(null)

// Contexto de PROGRESO separado del resto del estado del reproductor — el
// único campo que cambia varias veces por segundo (`progressMs`, cada
// `TICK_MS` durante la reproducción). Si viviera en el value del
// PlayerContext (objeto recreado en cada render del provider), TODOS los
// consumidores de `usePlayer()` — cada TrackCard/TrackGridCard de un listado
// de 50 tracks — se re-renderizarían 2 veces/seg mientras suena algo, aunque
// ninguna de ellas leyera el progreso (stutter real en demo, hallazgo del
// repaso S17). Solo consume esto quien de verdad necesita el progreso en vivo
// (PlayerBar); el resto lee `usePlayer()`, cuyo value va memoizado con
// `useMemo` para que los consumidores no se re-rendericen por el ticker.
const PlayerProgressContext = createContext<{ progressMs: number } | null>(null)

const TICK_MS = 500
// Diagnosticado con Playwright contra la API real (docs/decisiones-refactorizacion.md):
// `listType: 'search'` a veces "tiene éxito" desde la perspectiva de la IFrame API —
// `onReady` dispara, `onError` nunca dispara — pero el <video> interno del iframe nunca
// resuelve ningún medio real (se queda en el estado UNSTARTED, sin avanzar a PLAYING). Sin este
// watchdog, ese caso no cae en el fallback simulado porque técnicamente no es un error.
const YT_PLAYBACK_WATCHDOG_MS = 4500

// ── Carga perezosa de la YouTube IFrame Player API (una sola vez, global) ───
// RF-EXP-010, corrección post-lanzamiento: la implementación original pasaba
// `playerVars.listType = 'search'` directo al IFrame Player API para
// resolver "artista + track" a un video sin backend ni API key. YouTube
// deprecó ese valor de `listType` el 15/11/2020 — el player lo sigue
// aceptando (onReady dispara, onError no) pero el <video> interno nunca
// resuelve media real (ver `YT_PLAYBACK_WATCHDOG_MS` más abajo, que
// diagnosticó justo ese síntoma). La búsqueda de texto ahora se resuelve en
// el backend vía `experienciaApi.resolverYoutubeVideoId` (YouTube Data API
// v3, `search.list`) antes de instanciar el player con un `videoId` real.
declare global {
  interface Window {
    YT?: {
      Player: new (el: string | HTMLElement, opts: Record<string, unknown>) => YTPlayerInstance
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
    webkitAudioContext?: typeof AudioContext
  }
}

type YTPlayerInstance = {
  destroy: () => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  setVolume: (volume: number) => void
}

let ytApiPromise: Promise<void> | null = null

// Antes esta promesa nunca tenía vía de rechazo: si el script de YouTube
// fallaba al cargar o tardaba indefinidamente, `play()` quedaba esperando un
// `.then()` que nunca llega. Ahora rechaza en `script.onerror` y con un
// timeout, para que `play()` pueda capturarlo y arrancar la reproducción
// simulada (ver `startSimulatedPlayback`) en vez de quedarse colgado.
const YT_API_LOAD_TIMEOUT_MS = 8000

function loadYouTubeApi(): Promise<void> {
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise<void>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve()
      return
    }
    const timeout = setTimeout(() => reject(new Error('Timeout cargando la API de YouTube')), YT_API_LOAD_TIMEOUT_MS)
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      clearTimeout(timeout)
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('No se pudo cargar el script de YouTube'))
    }
    document.head.appendChild(script)
  }).catch((err) => {
    // No se cachea una promesa rechazada — un siguiente `play()` (ej. tras
    // recuperar conexión) debe poder reintentar la carga del script en vez
    // de quedar permanentemente roto por el primer fallo.
    ytApiPromise = null
    throw err
  })
  return ytApiPromise
}

// ── Reproducción simulada (RF-EXP-010, revisión posterior — ver nota) ──────
// Un `AudioContext` por sesión de navegación (perezoso, igual que
// `ytApiPromise`): los navegadores limitan contextos concurrentes y no hace
// falta uno nuevo por track — solo el par oscilador/ganancia se recrea en
// cada `play()`, porque un `OscillatorNode` es de un solo uso (no se puede
// reiniciar tras `stop()`).
let sharedAudioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext
    sharedAudioCtx = new Ctor()
  }
  return sharedAudioCtx
}

type SimulatedNodes = { osc: OscillatorNode; gain: GainNode }

// Estado del reproductor a nivel de sesión de navegación (React Context, no
// localStorage) — se resetea en un full reload, a diferencia del legacy
// (tl_player en localStorage).
export function PlayerProvider({ children }: { children: ReactNode }) {
  const authPrompt = useAuthPrompt()
  const [currentTrack, setCurrentTrack]             = useState<PlayableTrack | null>(null)
  const [isPlaying, setIsPlaying]                   = useState(false)
  const [progressMs, setProgressMs]                 = useState(0)
  const [playbackUnavailable, setPlaybackUnavailable] = useState(false)
  const [playbackReason, setPlaybackReason]           = useState<string | null>(null)
  const [queue, setQueue]                             = useState<PlayableTrack[]>([])
  const [volume, setVolumeState]                      = useState(0.8)
  const [repeatMode, setRepeatModeState]               = useState<RepeatMode>('none')
  const [shuffleMode, setShuffleModeState]             = useState(false)

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const ytPlayerRef      = useRef<YTPlayerInstance | null>(null)
  // Contenedor que React sí posee (nunca lo mutan directamente ni YT ni
  // nadie): el hijo que YT.Player reemplaza por su <iframe> se crea abajo con
  // `document.createElement`, fuera del árbol virtual — así React jamás
  // intenta reconciliar un nodo que la IFrame API ya reemplazó por su cuenta.
  // Antes se le pasaba a `new YT.Player(id, ...)` el id de un <div> renderizado
  // por JSX: la API reemplaza ESE nodo por un <iframe> in-place sin que React
  // se entere, y el próximo re-render de `PlayerProvider` (el ticker de
  // progreso corre cada `TICK_MS`) hacía crashear la app entera con
  // "NotFoundError: insertBefore/removeChild ... not a child of this node" —
  // invisible mientras `listType: 'search'` nunca llegaba a reproducir de
  // verdad, pero garantizado en cuanto la reproducción real funciona y sigue
  // corriendo más allá del primer tick.
  const ytHostRef        = useRef<HTMLDivElement | null>(null)
  const simulatedRef     = useRef<SimulatedNodes | null>(null)
  // Espejos en ref de `queue`/`volume`: los callbacks de larga vida (el timer
  // de progreso simulado, los handlers del YT.Player) se crean una vez por
  // `play()` y quedarían con el valor de cola/volumen de ESE momento si
  // leyeran el state directamente (closure obsoleta) — el ref siempre lee el
  // valor más reciente sin importar cuándo se creó el closure que lo usa.
  const queueRef         = useRef<PlayableTrack[]>([])
  const volumeRef        = useRef(volume)
  const repeatModeRef    = useRef<RepeatMode>('none')
  // Espejo del shuffle persistente: `advanceQueue` corre desde closures de
  // larga vida (ticker simulado / onStateChange de YT) — mismo motivo que
  // `repeatModeRef`.
  const shuffleModeRef   = useRef(false)
  // Track actualmente sonando, en ref — igual motivo que `queueRef`: leído
  // desde `advanceQueue` para `repeat-one`, que puede ejecutarse desde un
  // closure de larga vida (ticker simulado) que no ve el `currentTrack` más
  // reciente si lo leyera directo del state.
  const currentTrackRef  = useRef<PlayableTrack | null>(null)
  // Snapshot inmutable de la lista completa que originó la sesión de
  // reproducción actual (`playList`) — a diferencia de `queue` (que se va
  // vaciando con cada `advanceQueue`), esto no cambia hasta el próximo
  // `playList`/`play` suelto, y es lo único que permite reencolar desde el
  // principio en `repeat-all`. Un `enqueue()` manual posterior (ej. desde
  // QueuePanel) no se refleja acá a propósito — repeat-all reencola la
  // sesión original, no cualquier agregado manual sobre la marcha.
  const sessionQueueRef  = useRef<PlayableTrack[]>([])
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { volumeRef.current = volume }, [volume])
  useEffect(() => { repeatModeRef.current = repeatMode }, [repeatMode])
  useEffect(() => { shuffleModeRef.current = shuffleMode }, [shuffleMode])
  useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])
  // Historial de "anterior" — en memoria únicamente, mismo criterio que
  // `queue` (se vacía al recargar). Un ref porque solo `playPrevious` lo lee
  // en el momento del click; `historyLength` es el espejo reactivo que deja
  // a `hasPrevious` disparar un re-render cuando el historial cambia (un ref
  // por sí solo no lo haría).
  const historyRef                          = useRef<PlayableTrack[]>([])
  const [historyLength, setHistoryLength]   = useState(0)
  // Progreso simulado por reloj de pared, independiente del audio (que es
  // silencioso/casi inaudible a propósito — ver `startSimulatedPlayback`):
  // `elapsedBase` es lo ya transcurrido antes de la pausa actual,
  // `resumedAt` el timestamp del último play/resume. progreso = elapsedBase
  // + (Date.now() - resumedAt) mientras isPlaying.
  const simElapsedBaseRef = useRef(0)
  const simResumedAtRef   = useRef(0)
  const playTokenRef     = useRef(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const destroyYtPlayer = useCallback(() => {
    ytPlayerRef.current?.destroy()
    ytPlayerRef.current = null
    // `destroy()` ya remueve el <iframe>, pero si la creación del player
    // falló a mitad de camino (ej. `new YT.Player` lanzó después de haber
    // insertado el div hijo) puede quedar un nodo huérfano — se limpia el
    // contenedor explícitamente para que el próximo `play()` arranque de un
    // wrapper vacío, nunca con dos hijos superpuestos.
    if (ytHostRef.current) ytHostRef.current.innerHTML = ''
  }, [])

  const stopSimulated = useCallback(() => {
    const sim = simulatedRef.current
    if (sim) {
      try { sim.osc.stop() } catch { /* ya detenido */ }
      sim.osc.disconnect()
      sim.gain.disconnect()
    }
    simulatedRef.current = null
  }, [])

  // Arranca (o reanuda) el ticker de progreso — usado tanto al iniciar la
  // simulación como al despausarla desde `togglePlay`.
  const startSimTicker = useCallback((durationMs: number) => {
    clearTimer()
    timerRef.current = setInterval(() => {
      const elapsed = simElapsedBaseRef.current + (Date.now() - simResumedAtRef.current)
      if (elapsed >= durationMs) {
        setProgressMs(durationMs)
        setIsPlaying(false)
        clearTimer()
        stopSimulated()
        advanceQueue()
        return
      }
      setProgressMs(elapsed)
    }, TICK_MS)
  }, [clearTimer, stopSimulated])

  // RF-EXP-010, revisión posterior a la propuesta original (decisión del
  // usuario, no del propuesto original de esta capability): cuando YouTube
  // falla — sin resultado, sin conexión, script bloqueado, o cualquier
  // excepción de la IFrame API — el reproductor YA NO se deshabilita. En vez
  // de eso, simula la reproducción completa (progreso avanzando en tiempo
  // real, play/pause funcional, mismo aspecto visual) usando Web Audio API
  // nativa (sin dependencia nueva): un tono simple y muy bajo (0.025 de
  // ganancia sobre una onda seno de 220Hz, con fade-in/out de 50ms para
  // evitar el "click" audible típico de Web Audio al arrancar/detener en
  // seco) durante `duration_ms` exacto del track. `playbackUnavailable`
  // queda reservado exclusivamente para el bloqueo geográfico real
  // (RF-DIS-007, ver `reportPlaybackIssue`) — esa sí es una razón de negocio
  // para impedir la reproducción, no una limitación técnica del directorio
  // externo que deba notarse.
  const startSimulatedPlayback = useCallback((track: PlayableTrack, token: number) => {
    if (token !== playTokenRef.current) return
    destroyYtPlayer()
    stopSimulated()

    const ctx = getAudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 220
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(volumeRef.current * 0.025, ctx.currentTime + 0.05)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    simulatedRef.current = { osc, gain }

    simElapsedBaseRef.current = 0
    simResumedAtRef.current = Date.now()
    setIsPlaying(true)
    startSimTicker(track.duration_ms || 180_000)
  }, [destroyYtPlayer, stopSimulated, startSimTicker])

  const play = useCallback((track: PlayableTrack, opts?: { skipHistory?: boolean; keepSession?: boolean }) => {
    // RN-EXP-gate-reproduccion: sin sesión, ni reproducción real ni
    // simulada — antes cualquier error (incluido el 401 de
    // `youtube-video-id`) caía al fallback de audio simulado, dejando ver
    // un player con progreso avanzando para alguien sin cuenta. El corte
    // ahora es explícito y antes de cualquier llamada de red.
    if (!isAuthenticated()) {
      // Modal en vez de toast (S16 — auditoría de revisores): un toast se
      // desvanece solo sin dar ninguna acción; esto es lo primero que un
      // visitante anónimo intenta en el catálogo público, así que merece un
      // CTA real a login/registro en vez de un aviso transitorio.
      // El track viaja junto al mensaje (rediseño de navegación — login
      // contextual) para que, si el visitante elige "Iniciar sesión" en el
      // modal, LoginPage pueda retomar esta reproducción justo después de
      // autenticarse en vez de solo devolverlo a la página de origen.
      authPrompt('Regístrate gratis o inicia sesión para reproducir música.', track)
      return
    }
    // Snapshot de sesión para `repeat-all` (ver `sessionQueueRef`): un
    // `play()` suelto (sin pasar por `playList`/`advanceQueue`/
    // `playPrevious`, que pasan `keepSession: true`) es una sesión nueva de
    // 1 track — sin este reset, reproducir un track suelto después de una
    // sesión de álbum/playlist dejaría `repeat-all` reencolando la sesión
    // vieja en vez de repetir el track que realmente está sonando.
    if (!opts?.keepSession) sessionQueueRef.current = [track]
    // Historial de "anterior": empuja el track que está a punto de ser
    // REEMPLAZADO (no el nuevo) — el historial representa lo que ya sonó.
    // `skipHistory` lo salta cuando `playPrevious` llama a `play()` para
    // retroceder: sin este flag, retroceder empujaría el track actual de
    // vuelta al historial y alternar siguiente/anterior quedaría atrapado
    // en un ciclo de 2 tracks.
    if (!opts?.skipHistory && currentTrack) {
      historyRef.current.push(currentTrack)
      setHistoryLength(historyRef.current.length)
    }
    const token = ++playTokenRef.current
    clearTimer()
    destroyYtPlayer()
    stopSimulated()
    setCurrentTrack(track)
    setProgressMs(0)
    setPlaybackUnavailable(false)
    setPlaybackReason(null)
    setIsPlaying(false)

    if (!navigator.onLine) {
      startSimulatedPlayback(track, token)
      return
    }

    const query = `${track.artist_name} ${track.track_name}`
    // Resolver el videoId (backend) y cargar la IFrame API en paralelo — son
    // independientes, y esperar a una antes de empezar la otra solo suma
    // latencia al arranque de la reproducción.
    Promise.all([
      experienciaApi.resolverYoutubeVideoId(query).then((r) => r.video_id),
      loadYouTubeApi(),
    ]).then(([videoId]) => {
      // Un play() posterior (u otro track) ya invalidó este intento — no
      // pisar el estado del track actualmente activo.
      if (token !== playTokenRef.current || !window.YT || !ytHostRef.current) return

      // Cerradas sobre esta invocación de play() específica (una por token) —
      // no hace falta un ref, cada intento tiene su propia closure.
      let startedPlaying = false
      // Evita que onError y el watchdog disparen el fallback dos veces (el
      // segundo, si ambos ocurren, reiniciaría el tono simulado desde 0 en
      // vez de dejar sonando el que ya arrancó con el primero).
      let fallbackTriggered = false
      const triggerFallback = () => {
        if (fallbackTriggered) return
        fallbackTriggered = true
        startSimulatedPlayback(track, token)
      }
      // Nodo creado fuera de React (nunca vía JSX): es el que la IFrame API
      // reemplaza por su <iframe>, así que React no debe conocerlo ni
      // intentar reconciliarlo — ver comentario de `ytHostRef` más arriba.
      ytHostRef.current.innerHTML = ''
      const playerHost = document.createElement('div')
      ytHostRef.current.appendChild(playerHost)
      try {
        const player = new window.YT.Player(playerHost, {
          height: '0',
          width:  '0',
          videoId,
          playerVars: { autoplay: 1 },
          events: {
            onReady: () => {
              player.playVideo()
              player.setVolume(volumeRef.current * 100)
              // Watchdog adicional a onError (no lo reemplaza): si en
              // YT_PLAYBACK_WATCHDOG_MS no se llegó a PLAYING ni una vez, se
              // asume el fallo silencioso descrito arriba y se cae al mismo
              // fallback simulado. Cualquiera de los dos disparadores que
              // ocurra primero activa el fallback (`triggerFallback` evita
              // que el segundo lo dispare otra vez).
              setTimeout(() => {
                if (token !== playTokenRef.current) return
                if (!startedPlaying) triggerFallback()
              }, YT_PLAYBACK_WATCHDOG_MS)
            },
            onError: () => {
              if (token !== playTokenRef.current) return
              triggerFallback()
            },
            onStateChange: (e: { data: number }) => {
              if (token !== playTokenRef.current || !window.YT) return
              if (e.data === window.YT.PlayerState.PLAYING) {
                startedPlaying = true
                setIsPlaying(true)
                clearTimer()
                timerRef.current = setInterval(() => {
                  setProgressMs(player.getCurrentTime() * 1000)
                }, TICK_MS)
              } else if (e.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false)
                clearTimer()
              } else if (e.data === window.YT.PlayerState.ENDED) {
                setIsPlaying(false)
                clearTimer()
                advanceQueue()
              }
            },
          },
        })
        ytPlayerRef.current = player
      } catch {
        // `new YT.Player(...)` puede lanzar de forma síncrona (ej. un
        // parámetro que la API ya no soporta) — antes esto se propagaba como
        // excepción no capturada en vez de caer a un estado manejado.
        startSimulatedPlayback(track, token)
      }
    }).catch(() => {
      // Rechazo de cualquiera de las dos promesas: `resolverYoutubeVideoId`
      // (sin resultados, sin `YOUTUBE_API_KEY` configurada en el backend, o
      // fallo de red — el backend responde 404 en los tres casos) o
      // `loadYouTubeApi()` (script bloqueado/timeout, ver arriba).
      startSimulatedPlayback(track, token)
    })
  }, [clearTimer, destroyYtPlayer, stopSimulated, startSimulatedPlayback, authPrompt, currentTrack])

  const stop = useCallback(() => {
    // Invalida cualquier `play()` en vuelo (ej. la promesa de
    // `resolverYoutubeVideoId` que todavía no resolvió) — sin esto, esa
    // respuesta llegaría después y arrancaría el player igual, ignorando el
    // stop.
    playTokenRef.current += 1
    clearTimer()
    destroyYtPlayer()
    stopSimulated()
    setCurrentTrack(null)
    setIsPlaying(false)
    setProgressMs(0)
    setPlaybackUnavailable(false)
    setPlaybackReason(null)
  }, [clearTimer, destroyYtPlayer, stopSimulated])

  // Detiene la reproducción (real o simulada) y expone el motivo dado por el
  // backend — único caso real de "no disponible" que queda (RF-DIS-007).
  const reportPlaybackIssue = useCallback((reason: string) => {
    ytPlayerRef.current?.pauseVideo()
    stopSimulated()
    clearTimer()
    setIsPlaying(false)
    setPlaybackUnavailable(true)
    setPlaybackReason(reason)
  }, [stopSimulated, clearTimer])

  const togglePlay = useCallback(() => {
    if (playbackUnavailable || !currentTrack) return

    if (ytPlayerRef.current) {
      if (isPlaying) ytPlayerRef.current.pauseVideo()
      else ytPlayerRef.current.playVideo()
      return
    }

    if (simulatedRef.current) {
      if (isPlaying) {
        simElapsedBaseRef.current += Date.now() - simResumedAtRef.current
        simulatedRef.current.gain.gain.setTargetAtTime(0, simulatedRef.current.osc.context.currentTime, 0.02)
        setIsPlaying(false)
        clearTimer()
      } else {
        simResumedAtRef.current = Date.now()
        const target = simulatedRef.current.osc.context.currentTime
        simulatedRef.current.gain.gain.setTargetAtTime(volumeRef.current * 0.025, target, 0.02)
        setIsPlaying(true)
        startSimTicker(currentTrack.duration_ms || 180_000)
      }
    }
  }, [isPlaying, currentTrack, playbackUnavailable, clearTimer, startSimTicker])

  const seek = useCallback((ms: number) => {
    if (ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(ms / 1000, true)
    } else if (simulatedRef.current) {
      simElapsedBaseRef.current = ms
      simResumedAtRef.current = Date.now()
    }
    setProgressMs(ms)
  }, [])

  const enqueue = useCallback((track: PlayableTrack) => {
    setQueue((prev) => [...prev, track])
  }, [])

  const enqueueMany = useCallback((tracks: PlayableTrack[]) => {
    setQueue((prev) => [...prev, ...tracks])
  }, [])

  const replaceQueue = useCallback((tracks: PlayableTrack[]) => {
    setQueue(tracks)
  }, [])

  // Reproducción "en contexto" (Fase 1, hueco de producto de mayor severidad
  // de la auditoría): mismo patrón que ya usaba `useRadio.ts` a mano
  // (play(cola[0]) + replaceQueue(cola.slice(1))), centralizado para que
  // cualquier card de listado lo use con una sola llamada. `keepSession:
  // true` evita que el propio `play()` pise el snapshot que se guarda dos
  // líneas abajo.
  const playList = useCallback((tracks: PlayableTrack[], startIndex = 0) => {
    if (tracks.length === 0 || startIndex < 0 || startIndex >= tracks.length) return
    play(tracks[startIndex], { keepSession: true })
    sessionQueueRef.current = tracks
    replaceQueue(tracks.slice(startIndex + 1))
  }, [play, replaceQueue])

  const setRepeatMode = useCallback((mode: RepeatMode) => {
    setRepeatModeState(mode)
  }, [])

  const setShuffleMode = useCallback((on: boolean) => {
    setShuffleModeState(on)
  }, [])

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const moveInQueue = useCallback((index: number, direction: -1 | 1) => {
    setQueue((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [])

  // Fisher-Yates + una pasada de "declumping": si dos tracks consecutivos
  // quedaron del mismo artista tras el shuffle uniforme, busca el próximo
  // índice con un artista distinto y lo intercambia — evita la racha que un
  // shuffle puramente aleatorio deja pasar seguido en catálogos con pocos
  // artistas muy prolíficos.
  const shuffleQueue = useCallback(() => {
    setQueue((prev) => {
      if (prev.length < 2) return prev
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      for (let i = 1; i < shuffled.length; i++) {
        if (shuffled[i].artist_name !== shuffled[i - 1].artist_name) continue
        const swapWith = shuffled.findIndex(
          (t, idx) => idx > i && t.artist_name !== shuffled[i - 1].artist_name,
        )
        if (swapWith !== -1) [shuffled[i], shuffled[swapWith]] = [shuffled[swapWith], shuffled[i]]
      }
      return shuffled
    })
  }, [])

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    setVolumeState(clamped)
    ytPlayerRef.current?.setVolume(clamped * 100)
    if (simulatedRef.current) {
      const target = simulatedRef.current.osc.context.currentTime
      simulatedRef.current.gain.gain.setTargetAtTime(clamped * 0.025, target, 0.02)
    }
  }, [])

  // Declaración de función (no `useCallback`) a propósito: se referencia por
  // nombre desde dentro de `startSimTicker` y del handler `onStateChange` de
  // YouTube (ambos definidos arriba, antes que `play`) — al ser una
  // declaración de función se "hoistea" y su cuerpo solo se ejecuta cuando
  // efectivamente se invoca (evento asíncrono posterior al render), momento
  // en el que `play` ya existe. Lee `queueRef` (no `queue`) por la misma
  // razón que el resto de refs de este archivo: evita closures obsoletas en
  // esos dos callbacks de larga vida.
  // `manual` distingue el clic en "Siguiente" (`playNext`, debe avanzar
  // SIEMPRE, incluso con repeat-one activo — nadie espera que "Siguiente"
  // repita la misma canción) del fin natural del track (ticker/onStateChange
  // ENDED, donde repeat-one sí debe reiniciar en vez de avanzar).
  function advanceQueue(opts?: { manual?: boolean }) {
    if (!opts?.manual && repeatModeRef.current === 'one') {
      const track = currentTrackRef.current
      if (track) play(track, { skipHistory: true, keepSession: true })
      return
    }

    const cola = queueRef.current
    // Shuffle persistente (S16-P10): el próximo track sale de una posición al
    // azar del resto de la cola — con la misma heurística anti-racha del
    // `shuffleQueue` one-shot aplicada al par (actual → elegido). El avance
    // MANUAL ("Siguiente") respeta el modo a propósito: si el usuario activó
    // aleatorio, "Siguiente" también debería sorprender.
    let idx = 0
    if (shuffleModeRef.current && cola.length > 1) {
      idx = Math.floor(Math.random() * cola.length)
      const artistaActual = currentTrackRef.current?.artist_name
      if (artistaActual && cola[idx].artist_name === artistaActual) {
        const alt = cola.findIndex((t, i) => i !== idx && t.artist_name !== artistaActual)
        if (alt !== -1) idx = alt
      }
    }
    const next = cola[idx]
    if (next) {
      setQueue((prev) => prev.filter((_, i) => i !== idx))
      play(next, { keepSession: true })
      return
    }

    // Cola agotada: repeat-all reencola desde el principio de la sesión
    // (snapshot de `playList`, no de lo que quedaba en `queue`) en vez de
    // detenerse — sin sesión guardada (ej. nunca se llamó `playList`), no
    // hay nada sensato que reencolar y se cae al comportamiento de siempre
    // (detención limpia, sin crash ni audio fantasma).
    if (repeatModeRef.current === 'all' && sessionQueueRef.current.length > 0) {
      const [first, ...rest] = sessionQueueRef.current
      setQueue(rest)
      play(first, { keepSession: true })
    }
  }

  // Alias expuesto al consumidor (botón "siguiente" de PlayerBar) — misma
  // función, mismo motivo de ser declaración y no `useCallback` que
  // `advanceQueue`, para no quedar con un `play` obsoleto en el closure.
  // Se exponen AHORA como `useCallback` de identidad ESTABLE a través de un
  // ref que se refresca tras cada render: son parte del value memoizado del
  // PlayerContext (ver abajo), y si cambiaran de identidad en cada render el
  // `useMemo` se invalidaría en cada tick del ticker de progreso.
  const playNextRef = useRef<() => void>(() => {})
  const playPreviousRef = useRef<() => void>(() => {})
  useEffect(() => {
    playNextRef.current = () => advanceQueue({ manual: true })
    playPreviousRef.current = () => {
      // Retrocede sobre `historyRef`: saca el último track sonado y lo
      // reproduce con `skipHistory` para no volver a empujarlo — ver el
      // comentario grande en `play()` sobre por qué, si no, "siguiente"/
      // "anterior" alternados quedarían atrapados en un ciclo de 2 tracks.
      const previous = historyRef.current.pop()
      if (!previous) return
      setHistoryLength(historyRef.current.length)
      play(previous, { skipHistory: true, keepSession: true })
    }
  })
  const playNext = useCallback(() => { playNextRef.current() }, [])
  const playPrevious = useCallback(() => { playPreviousRef.current() }, [])

  useEffect(() => () => { clearTimer(); destroyYtPlayer(); stopSimulated() }, [clearTimer, destroyYtPlayer, stopSimulated])

  // ── Atajos de teclado globales del reproductor ─────────────────────────
  // Espacio (play/pause), ←/→ (anterior/siguiente), ↑/↓ (volumen),
  // M (mute/unmute). Se omiten cuando el foco está en un input, textarea,
  // select o elemento contentEditable para no interferir con la escritura.
  const savedVolumeRef = useRef(0.8)
  useEffect(() => {
    function isEditable(el: Element | null): boolean {
      if (!el || !(el instanceof HTMLElement)) return false
      if (el.isContentEditable) return true
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isEditable(document.activeElement)) return

      const key = e.key

      if (key === ' ') {
        e.preventDefault()
        togglePlay()
        return
      }
      if (key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        playNext()
        return
      }
      if (key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        playPrevious()
        return
      }
      if (key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setVolume(Math.min(1, volumeRef.current + 0.05))
        return
      }
      if (key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setVolume(Math.max(0, volumeRef.current - 0.05))
        return
      }
      if (key === 'm' || key === 'M') {
        e.preventDefault()
        if (volumeRef.current > 0) {
          savedVolumeRef.current = volumeRef.current
          setVolume(0)
        } else {
          setVolume(savedVolumeRef.current || 0.8)
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [togglePlay, playNext, playPrevious, setVolume])

  // Con repeat-all, "Siguiente" sigue teniendo a dónde ir aunque la cola en
  // vivo esté vacía (reencola la sesión) — sin esto el botón se veía
  // deshabilitado justo cuando repeat-all garantiza que SÍ hay siguiente.
  const hasNext = queue.length > 0 || (repeatMode === 'all' && sessionQueueRef.current.length > 0)

  const playerValue = useMemo<PlayerContextValue>(() => ({
    currentTrack, isPlaying,
    playbackUnavailable, playbackUnavailableReason: playbackReason,
    play, playList, togglePlay, seek, stop, reportPlaybackIssue,
    playNext, playPrevious, hasNext, hasPrevious: historyLength > 0,
    queue, enqueue, enqueueMany, replaceQueue, removeFromQueue, moveInQueue, shuffleQueue,
    shuffleMode, setShuffleMode,
    volume, setVolume, repeatMode, setRepeatMode,
  }), [
    currentTrack, isPlaying, playbackUnavailable, playbackReason,
    play, playList, togglePlay, seek, stop, reportPlaybackIssue,
    playNext, playPrevious, hasNext, historyLength,
    queue, enqueue, enqueueMany, replaceQueue, removeFromQueue, moveInQueue, shuffleQueue,
    shuffleMode, setShuffleMode,
    volume, setVolume, repeatMode, setRepeatMode,
  ])

  return (
    <PlayerContext.Provider value={playerValue}>
      {/* El progreso vive en un provider ANIDADO y NO en `playerValue`: es el
          único estado que cambia 2 veces/seg durante la reproducción, y al
          estar aislado aquí, los consumidores de `usePlayer()` no se
          re-renderizan por el ticker — ver comentario de
          `PlayerProgressContext` arriba. */}
      <PlayerProgressContext.Provider value={{ progressMs }}>
        {children}
      </PlayerProgressContext.Provider>
      {/* Wrapper de audio real — 0x0, nunca visible. React solo posee ESTE
          nodo; el <div> hijo que reemplaza el <iframe> de YT se crea fuera de
          JSX en cada `play()` (ver `ytHostRef` arriba), así React nunca
          intenta reconciliar un nodo que la IFrame API ya mutó por su cuenta.
          RF-EXP-010: solo audio de fondo, sin UI de video propia. */}
      <div ref={ytHostRef} style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden' }} />
    </PlayerContext.Provider>
  )
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer debe usarse dentro de <PlayerProvider>')
  return ctx
}

export function usePlayerProgress(): { progressMs: number } {
  const ctx = useContext(PlayerProgressContext)
  if (!ctx) throw new Error('usePlayerProgress debe usarse dentro de <PlayerProvider>')
  return ctx
}
