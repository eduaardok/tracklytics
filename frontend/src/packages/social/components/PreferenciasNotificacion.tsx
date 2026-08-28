import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { socialApi } from '../api/social.api'
import styles from './NotificationBell.module.css'

/**
 * Preferencias de notificación (opt-out por tipo) — S16-P10.
 *
 * Antes vivía SOLO dentro del panel de la campanita (NotificationBell); la
 * revisión del dominio la marcó como brecha P2 porque un ajuste así es una
 * preferencia de cuenta, no un gesto de la campana: ahora también vive como
 * sección en ProfilePage. Mismo endpoint GET/PUT `/social/notificaciones/
 * preferencias*` y misma query key — abrir uno y cambiar el otro se refleja
 * en ambos por el invalidate compartido.
 */

// Etiqueta en español por tipo — mismo criterio del glosario técnico (S16-P4,
// InfoHint): el `Enum8` del backend usa los nombres internos, la UI muestra
// texto legible.
export const TIPO_LABEL: Record<string, string> = {
  nuevo_track_artista_seguido: 'Nueva canción de un artista que sigues',
  comentario_en_tu_contenido:  'Comentarios en tu contenido',
  nuevo_colaborador_playlist:  'Nuevo colaborador en tu playlist',
}

const PREFS_QUERY_KEY = ['social', 'notificaciones', 'preferencias']

export function PreferenciasNotificacion() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: PREFS_QUERY_KEY,
    queryFn:  () => socialApi.preferenciasNotificacion(),
  })
  const actualizar = useMutation({
    mutationFn: ({ tipo, activo }: { tipo: string; activo: boolean }) =>
      socialApi.actualizarPreferenciaNotificacion(tipo, activo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PREFS_QUERY_KEY }),
  })

  if (isLoading) return <p className={styles.prefsHint}>Cargando preferencias…</p>
  if (isError) return <p className={styles.prefsHint}>No se pudieron cargar tus preferencias.</p>

  return (
    <ul className={styles.prefsList}>
      {(data?.data ?? []).map((p) => (
        <li key={p.tipo} className={styles.prefsRow}>
          <span>{TIPO_LABEL[p.tipo] ?? p.tipo}</span>
          <label className={styles.prefsSwitch}>
            <input
              type="checkbox"
              checked={p.activo}
              onChange={(e) => actualizar.mutate({ tipo: p.tipo, activo: e.target.checked })}
              aria-label={TIPO_LABEL[p.tipo] ?? p.tipo}
            />
            <span className={styles.prefsSlider} aria-hidden="true" />
          </label>
        </li>
      ))}
    </ul>
  )
}
