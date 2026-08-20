// Categorías de la vista completa (`?ver=`) de `/catalogo` — separado de
// CatalogPage.tsx para que `CatalogDiscovery.tsx` (home de descubrimiento)
// pueda importar el tipo sin crear un ciclo CatalogPage → CatalogDiscovery
// → CatalogPage.
export type Tab = 'canciones' | 'playlists' | 'artistas' | 'generos'

export const TAB_LABEL: Record<Tab, string> = {
  canciones: 'Canciones',
  playlists: 'Playlists',
  artistas:  'Artistas',
  generos:   'Géneros',
}
