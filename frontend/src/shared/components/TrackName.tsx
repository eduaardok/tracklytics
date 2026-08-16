import styles from './TrackName.module.css'

type TrackNameProps = {
  name: string
  esFeaturing?: boolean
  sourceType?: string | null
  // Cada consumidor (TrackCard, TrackGridCard, LibraryTrackRow, ...) trae su
  // propio tamaño de badge "feat." ya definido en su propio CSS module — se
  // pasa acá para no perder esos ajustes finos al consolidar la condición.
  // El badge "(Sint)" sí es nuevo en todo el proyecto, por eso tiene un único
  // estilo propio (`styles.syntheticBadge`) en vez de pedirle uno a cada
  // consumidor.
  featBadgeClassName?: string
  // S16: DIM_EXPLICIT_TYPE.explicit_id (1=Clean, 2=Explicit) — opcional,
  // no todas las queries de listado lo exponen todavía (ver types.ts).
  explicitId?: number
}

// Nombre de track + badges de estado — punto único donde se decide si un
// track lleva "feat." y/o el marcador "(Sint)" de track sintético (S13-P6).
// Antes esta misma condición (`es_featuring && <span>feat.</span>`) estaba
// copiada en TrackCard/TrackGridCard/LibraryTrackRow y faltaba por completo
// en TrackDetailPage/SearchResultsPage — consolidarla acá hace que cualquier
// vista nueva de tracks la herede gratis con un solo import.
export function TrackName({ name, esFeaturing, sourceType, featBadgeClassName, explicitId }: TrackNameProps) {
  return (
    <>
      {name}
      {esFeaturing && <span className={featBadgeClassName}>feat.</span>}
      {sourceType === 'synthetic' && <span className={styles.syntheticBadge}>(Sint)</span>}
      {explicitId === 2 && <span className={styles.explicitBadge} title="Contenido explícito" aria-label="Contenido explícito">E</span>}
    </>
  )
}

type FeaturingCaptionProps = {
  esFeaturing?: boolean
  artistasFeat?: string[] | null
  className?: string
}

// Segunda línea "con X, Y" bajo el nombre — mismo criterio de consolidación
// que `TrackName`, ya duplicada 3 veces antes de esta capability.
export function FeaturingCaption({ esFeaturing, artistasFeat, className }: FeaturingCaptionProps) {
  if (!esFeaturing || !artistasFeat || artistasFeat.length === 0) return null
  return <div className={className}>con {artistasFeat.join(', ')}</div>
}
