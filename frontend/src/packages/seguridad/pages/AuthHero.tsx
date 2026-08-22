import styles from './AuthPages.module.css'

// Barras de ecualizador puramente decorativas (mismo motivo visual que
// PlayerBar.module.css `.eq`/`.eqBar`) — señal ambiente de "esto es música,
// esto está vivo" junto a la marca.
function MiniEqualizer() {
  return (
    <span className={styles.miniEq} aria-hidden="true">
      <span className={styles.miniEqBar} />
      <span className={styles.miniEqBar} />
      <span className={styles.miniEqBar} />
      <span className={styles.miniEqBar} />
    </span>
  )
}

// Fondo de marca de login/register (rediseño de navegación de dos niveles +
// login contextual): antes `AuthHero` era un panel lateral de grid con
// tagline, headline, tech tags y un contador de tracks en vivo — contenido
// de landing, no de una pantalla de autenticación que ahora aparece en
// mitad de una tarea (reproducir sin sesión). Se retira todo ese contenido
// promocional; lo único que sobrevive es el SVG decorativo de ondas, ahora
// como una capa de ambiente muy sutil detrás de toda la pantalla centrada
// en vez de protagonista de un panel propio.
export function AuthHero() {
  return (
    <svg className={styles.heroAmbient} aria-hidden="true" viewBox="0 0 320 220" preserveAspectRatio="xMidYMax slice">
      {/* Ondas base: se dibujan al entrar y quedan fijas. Tres alturas dan
          profundidad de "cordillera de señal" sin subir la opacidad. */}
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 190 Q 40 120 76 190 T 148 190 T 220 190 T 292 190" />
        <path d="M4 168 Q 44 118 84 168 T 164 168 T 244 168 T 304 168" />
        <path d="M4 210 Q 50 160 96 210 T 188 210 T 280 210" />
      </g>
      {/* Pulsos que viajan por las ondas (mismos trazos, punteado redondo
          desplazándose en bucle) — la capa sigue viva después de la entrada,
          no solo en el primer segundo. */}
      <g className={styles.heroFlow} fill="none" stroke="currentColor">
        <path d="M4 190 Q 40 120 76 190 T 148 190 T 220 190 T 292 190" />
        <path d="M4 210 Q 50 160 96 210 T 188 210 T 280 210" />
      </g>
      <g fill="currentColor">
        <circle cx="76" cy="190" r="3.5" />
        <circle cx="148" cy="190" r="3.5" />
        <circle cx="220" cy="190" r="3.5" />
        <circle cx="96" cy="210" r="3" />
        <circle cx="188" cy="210" r="3" />
      </g>
    </svg>
  )
}

// Marca compacta arriba del card (reemplaza el bloque grande de branding del
// panel lateral anterior) — mismo logo con anillo de gradiente + ecualizador,
// a escala reducida porque ahora comparte pantalla con el formulario en vez
// de tener un panel propio.
export function AuthBrand() {
  return (
    <div className={styles.brandRow}>
      {/* Logo tal cual (feedback de usuario: sin anillo de gradiente alrededor). */}
      <img src="/logo.png" alt="" className={styles.brandLogo} width={40} height={40} />
      <span className={styles.brandName}>Tracklytics</span>
      <MiniEqualizer />
    </div>
  )
}
