import { useEffect, useState } from 'react'
import { publicidadApi } from '../api/publicidad.api'
import styles from './AdBanner.module.css'

type BannerState = { impresionId: string; cpm: number; urlDestino: string } | null

// Trigger de display (monetizacion-retencion-mejoras) — independiente del
// reproductor: pide una impresión al montar (una sola vez por sesión de
// pestaña, no en cada remount) y se queda oculto si no hay campaña display
// elegible, sin bloquear el resto del shell (ver design.md, decisión 3).
// `collapsed`: el sidebar colapsado (64px) no tiene espacio para un texto
// legible — se oculta visualmente sin dejar de rastrear la impresión ya
// pedida, mismo criterio que el resto de `.navText` en ese estado.
export function AdBanner({ collapsed = false }: { collapsed?: boolean }) {
  const [banner, setBanner] = useState<BannerState>(null)
  const [clicked, setClicked] = useState(false)

  useEffect(() => {
    let cancelled = false
    publicidadApi.impresionDisplay()
      .then((res) => {
        if (cancelled || !res.campana || !res.impresion_id) return
        setBanner({ impresionId: res.impresion_id, cpm: res.campana.cpm, urlDestino: res.campana.url_destino })
      })
      .catch(() => {
        // Un fallo de red al pedir el banner no debe romper la navegación.
      })
    return () => { cancelled = true }
  }, [])

  if (!banner || collapsed) return null

  function handleClick() {
    if (!banner) return
    if (!clicked) {
      setClicked(true)
      publicidadApi.registrarClick(banner.impresionId).catch(() => {
        // El ingreso real ya se intentó reconocer server-side; un fallo de
        // red aquí no debe impedir la redirección.
      })
    }
  }

  return (
    <a
      href={banner.urlDestino}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.banner}
      onClick={handleClick}
    >
      <span className={styles.badge}>Publicidad</span>
      <span className={styles.text}>
        Tracklytics Free se financia con anuncios reales — pasa a Premium para quitarlos.
      </span>
    </a>
  )
}
