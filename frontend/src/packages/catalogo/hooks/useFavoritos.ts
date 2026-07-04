import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAuthenticated } from '@shared/lib/session'
import { apiErrorMessage } from '@shared/lib/api-client'
import { bibliotecaApi } from '../api/biblioteca.api'

const QUERY_KEY = ['biblioteca', 'favoritos']

// Un solo query compartido por react-query (misma queryKey) entre todos los
// TrackCard/TrackDetailPage montados a la vez — evita N llamadas a
// /biblioteca/favoritos por N filas de track en pantalla.
export function useFavoritos() {
  const queryClient = useQueryClient()
  const authed = isAuthenticated()

  const { data } = useQuery({
    queryKey:  QUERY_KEY,
    queryFn:   () => bibliotecaApi.favoritos(),
    enabled:   authed,
    staleTime: 30_000,
  })

  const favSet = new Set((data?.data ?? []).map((t) => t.fact_id))

  const toggleMutation = useMutation({
    mutationFn: (factId: number) =>
      favSet.has(factId) ? bibliotecaApi.quitarFavorito(factId) : bibliotecaApi.agregarFavorito(factId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  return {
    isAuthenticated: authed,
    isFavorite:      (factId: number) => favSet.has(factId),
    toggle:          (factId: number) => toggleMutation.mutate(factId),
    // Antes el 403 del límite de favoritos Free (`add_favorito`, backend)
    // fallaba en silencio para quien tocara el corazón fuera de `FavoritosTab`
    // (que sí mostraba el contador proactivo, pero no el error del toggle en
    // sí) — ver TrackCard/TrackDetailPage, que ahora consumen este campo.
    toggleError: toggleMutation.isError
      ? apiErrorMessage(toggleMutation.error, 'No se pudo actualizar tus favoritos.')
      : null,
  }
}
