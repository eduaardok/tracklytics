import { useEffect, useState } from 'react'
import { Image as ImageIcon, Megaphone } from 'lucide-react'
import { publicidadApi } from '../api/publicidad.api'
import type { FormatoCampana } from '../types'
import styles from './AdBanner.module.css'

type BannerState = {
  impresionId: string
  cpm:         number
  urlDestino:  string
  nombre:      string
  formato:     FormatoCampana
  imagenUrl:   string | null
} | null

// Distinción clara por tipo de anuncio (pedido directo): 'display' y
// 'banner' comparten el mismo trigger técnico (`tipo_anuncio='display'`,
// ver `_FORMATO_A_TIPO` en el backend) y el mismo componente — sin esto se
// veían idénticos aunque el admin los haya configurado como formatos
// distintos. 'audio' nunca llega acá (tiene su propio modal bloqueante en
// AdContext.tsx), pero se cubre por completitud del tipo.
const BADGE_POR_FORMATO: Record<FormatoCampana, { label: string; icon: typeof Megaphone; cls: string }> = {
  display: { label: 'Anuncio',            icon: Megaphone, cls: styles['badge--display'] },
  banner:  { label: 'Banner publicitario', icon: ImageIcon, cls: styles['badge--banner'] },
  audio:   { label: 'Anuncio',            icon: Megaphone, cls: styles['badge--display'] },
}

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
  const [imagenRota, setImagenRota] = useState(false)

  useEffect(() => {
    let cancelled = false
    publicidadApi.impresionDisplay()
      .then((res) => {
        if (cancelled || !res.campana || !res.impresion_id) return
        setBanner({
          impresionId: res.impresion_id, cpm: res.campana.cpm, urlDestino: res.campana.url_destino,
          nombre: res.campana.nombre, formato: res.campana.formato, imagenUrl: res.campana.imagen_url,
        })
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

  const { label, icon: Icon, cls } = BADGE_POR_FORMATO[banner.formato]

  return (
    <a
      href={banner.urlDestino}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.banner}
      onClick={handleClick}
    >
      <span className={`${styles.badge} ${cls}`}>
        <Icon size={11} aria-hidden="true" />
        {label}
      </span>
      {banner.imagenUrl && !imagenRota && (
        <img
          src={banner.imagenUrl}
          alt=""
          className={styles.creativo}
          onError={() => setImagenRota(true)}
        />
      )}
      <span className={styles.nombre}>{banner.nombre}</span>
      <span className={styles.text}>
        Tracklytics Free se financia con anuncios reales — pasa a Premium para quitarlos.
      </span>
    </a>
  )
}
