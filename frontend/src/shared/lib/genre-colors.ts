// Color determinista por género (S13 polish visual): mismo género → mismo
// tono siempre, sin depender de una tabla mantenida a mano (el catálogo trae
// decenas de géneros y solo viaja `genre_name`, no un id estable en todos los
// contextos — TrackCard/GenreChip usan el nombre). Se usa tanto para el
// gradiente de fallback de portada (AlbumArt) como para el fondo de los
// chips de género del catálogo.
const HUES = [290, 250, 210, 195, 160, 130, 95, 70, 40, 15, 340, 320] as const

function hueFor(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return HUES[hash % HUES.length]
}

export function genreGradient(seed: string): string {
  const h = hueFor(seed)
  return `linear-gradient(135deg, oklch(0.42 0.13 ${h}) 0%, oklch(0.24 0.09 ${(h + 30) % 360}) 100%)`
}

export function genreAccent(seed: string, alpha = 1): string {
  const h = hueFor(seed)
  return alpha >= 1 ? `oklch(0.64 0.14 ${h})` : `oklch(0.64 0.14 ${h} / ${alpha})`
}
