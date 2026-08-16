import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAuthenticated } from '@shared/lib/session'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { bibliotecaApi } from '../api/biblioteca.api'
import type { LikesResultado } from '../types'

// Micro-batching (hallazgo real de rendimiento, S16 prompt 09): un listado de
// catálogo monta N TrackCard a la vez, y cada uno necesita saber su estado de
// likes — pedirlo uno por uno disparaba N GET simultáneos (20+ tracks por
// página), saturando el pool de conexiones de ClickHouse (503 reproducido
// bajo carga con Playwright). Todos los `factId` pedidos dentro de la misma
// ventana de 20ms (== todos los TrackCard que montan juntos en el mismo
// listado) se agrupan en una sola llamada a `/tracks/likes` — transparente
// para TrackCard/TrackDetailPage, que siguen llamando `useLikes(factId)`
// exactamente igual que antes.
let pendingIds = new Set<number>()
let batchPromise: Promise<Record<string, LikesResultado>> | null = null

function fetchBatched(factId: number): Promise<LikesResultado> {
  pendingIds.add(factId)
  if (!batchPromise) {
    batchPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        const ids = Array.from(pendingIds)
        pendingIds = new Set()
        batchPromise = null
        bibliotecaApi.likesBatch(ids).then(
          (res) => resolve(res.data),
          (err) => reject(err),
        )
      }, 20)
    })
  }
  const DEFAULT: LikesResultado = { likes: 0, dislikes: 0, voto: null }
  return batchPromise.then((all) => all[String(factId)] ?? DEFAULT)
}

// A diferencia de useFavoritos (un solo query compartido para TODOS los
// favoritos del usuario), aquí cada `factId` tiene su propia queryKey — pero
// la red real detrás va agrupada por `fetchBatched`, así que N TrackCard
// montando juntos generan N entradas de caché con UN solo round-trip.
export function useLikes(factId: number) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const authed = isAuthenticated()
  const queryKey = ['biblioteca', 'likes', factId]

  const { data } = useQuery({
    queryKey,
    queryFn:   () => fetchBatched(factId),
    enabled:   Number.isFinite(factId) && factId > 0,
    staleTime: 30_000,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const votar = useMutation({
    mutationFn: (voto: 'like' | 'dislike') =>
      voto === 'like' ? bibliotecaApi.likeTrack(factId) : bibliotecaApi.dislikeTrack(factId),
    onSuccess: invalidate,
    onError:   (err) => toast.error(apiErrorMessage(err, 'No se pudo registrar tu voto.')),
  })

  const quitar = useMutation({
    mutationFn: () => bibliotecaApi.quitarVoto(factId),
    onSuccess:  invalidate,
    onError:    (err) => toast.error(apiErrorMessage(err, 'No se pudo quitar tu voto.')),
  })

  const voto = data?.voto ?? null

  function like() {
    if (voto === 'like') quitar.mutate()
    else votar.mutate('like')
  }

  function dislike() {
    if (voto === 'dislike') quitar.mutate()
    else votar.mutate('dislike')
  }

  return {
    isAuthenticated: authed,
    likes: data?.likes ?? 0,
    voto,
    like,
    dislike,
  }
}
