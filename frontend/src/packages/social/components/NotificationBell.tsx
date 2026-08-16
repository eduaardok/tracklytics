import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff } from 'lucide-react'
import { isAuthenticated } from '@shared/lib/session'
import { EmptyState } from '@shared/components/EmptyState'
import { socialApi } from '../api/social.api'
import type { Notificacion } from '../types'
import styles from './NotificationBell.module.css'

const QUERY_KEY = ['social', 'notificaciones']

// Campana de notificaciones (S10 ronda 2, punto 1) — montada directo en
// AppShell.tsx por ruta explícita (no vía el barrel `@packages/social`, que
// arrastraría los dashboards con Recharts de ese paquete al bundle principal,
// mismo criterio ya documentado en AppShell.tsx para UserMenu/PlayerBarActions).
export function NotificationBell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const authed = isAuthenticated()

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  () => socialApi.notificaciones(30),
    enabled:  authed,
    refetchInterval: 45_000,
  })

  const marcarLeida = useMutation({
    mutationFn: (factId: number) => socialApi.marcarNotificacionLeida(factId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const marcarTodas = useMutation({
    mutationFn: () => socialApi.marcarTodasLeidas(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (!authed) return null

  const items = data?.data ?? []
  const noLeidas = data?.no_leidas ?? 0

  function abrir(n: Notificacion) {
    if (!n.leido) marcarLeida.mutate(n.fact_id)
    setOpen(false)
    if (n.referencia_tipo === 'track') navigate(`/catalogo/track/${n.referencia_id}`)
    else if (n.referencia_tipo === 'playlist') navigate('/biblioteca')
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-label={noLeidas > 0 ? `Notificaciones — ${noLeidas} sin leer` : 'Notificaciones'}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={18} aria-hidden="true" />
        {noLeidas > 0 && (
          <span className={styles.badge}>{noLeidas > 9 ? '9+' : noLeidas}</span>
        )}
      </button>

      {open && (
        <div className={styles.panel} role="menu" aria-label="Notificaciones">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notificaciones</span>
            {noLeidas > 0 && (
              <button
                type="button"
                className={styles.markAllBtn}
                onClick={() => marcarTodas.mutate()}
                disabled={marcarTodas.isPending}
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyState icon={<BellOff size={22} aria-hidden="true" />} title="No tienes notificaciones todavía." />
          ) : (
            <ul className={styles.list}>
              {items.map((n) => (
                <li key={n.fact_id}>
                  <button
                    type="button"
                    className={n.leido ? styles.item : `${styles.item} ${styles.itemUnread}`}
                    onClick={() => abrir(n)}
                  >
                    {!n.leido && <span className={styles.dot} aria-hidden="true" />}
                    <span className={styles.itemBody}>
                      <span className={styles.itemMessage}>{n.mensaje}</span>
                      <span className={styles.itemDate}>{formatFecha(n.fecha_creacion)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function formatFecha(iso: string): string {
  const fecha = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  const diffMin = Math.round((Date.now() - fecha.getTime()) / 60_000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  const diffD = Math.round(diffH / 24)
  return `hace ${diffD} d`
}
