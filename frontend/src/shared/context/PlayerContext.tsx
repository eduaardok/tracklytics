import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { experienciaApi } from '@packages/experiencia/api/experiencia.api'
import { isAuthenticated } from '@shared/lib/session'
import { useToast } from '@shared/context/ToastContext'

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
  progressMs:       number
  // RF-DIS-007 (bloqueo geográfico) es la única razón que queda para
  // deshabilitar el control de reproducción — decisión posterior del usuario
  // (ver comentario grande más abajo): un fallo de YouTube ya NO cae aquí,
  // cae a reproducción simulada. `playbackUnavailable` solo se activa desde
  // `reportPlaybackIssue`.
  playbackUnavailable: boolean
  playbackUnavailableReason: string | null
  play:             (track: PlayableTrack) => void
  togglePlay:       () => void
  seek:             (ms: number) => void
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
  volume:           number
  setVolume:        (volume: number) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

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
  const toast = useToast()
  const [currentTrack, setCurrentTrack]             = useState<PlayableTrack | null>(null)
  const [isPlaying, setIsPlaying]                   = useState(false)
  const [progressMs, setProgressMs]                 = useState(0)
  const [playbackUnavailable, setPlaybackUnavailable] = useState(false)
  const [playbackReason, setPlaybackReason]           = useState<string | null>(null)
  const [queue, setQueue]                             = useState<PlayableTrack[]>([])
  const [volume, setVolumeState]                      = useState(0.8)

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
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { volumeRef.current = volume }, [volume])
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

  const play = useCallback((track: PlayableTrack) => {
    // RN-EXP-gate-reproduccion: sin sesión, ni reproducción real ni
    // simulada — antes cualquier error (incluido el 401 de
    // `youtube-video-id`) caía al fallback de audio simulado, dejando ver
    // un player con progreso avanzando para alguien sin cuenta. El corte
    // ahora es explícito y antes de cualquier llamada de red.
    if (!isAuthenticated()) {
      toast.error('Inicia sesión gratis para escuchar — regístrate o inicia sesión para reproducir música.')
      return
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
  }, [clearTimer, destroyYtPlayer, stopSimulated, startSimulatedPlayback, toast])

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
  function advanceQueue() {
    const next = queueRef.current[0]
    if (!next) return
    setQueue((prev) => prev.slice(1))
    play(next)
  }

  useEffect(() => () => { clearTimer(); destroyYtPlayer(); stopSimulated() }, [clearTimer, destroyYtPlayer, stopSimulated])

  return (
    <PlayerContext.Provider
      value={{
        currentTrack, isPlaying, progressMs,
        playbackUnavailable, playbackUnavailableReason: playbackReason,
        play, togglePlay, seek, stop, reportPlaybackIssue,
        queue, enqueue, enqueueMany, replaceQueue, removeFromQueue, moveInQueue,
        volume, setVolume,
      }}
    >
      {children}
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
