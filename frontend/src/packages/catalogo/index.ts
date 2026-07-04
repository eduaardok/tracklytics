// Public API del paquete catalogo.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { CatalogPage }      from './pages/CatalogPage'
export { TrackDetailPage }  from './pages/TrackDetailPage'
export { ArtistDetailPage } from './pages/ArtistDetailPage'
export { AlbumDetailPage }  from './pages/AlbumDetailPage'
export { BibliotecaPage }   from './pages/BibliotecaPage'
export { TrackCard }         from './components/TrackCard'
export { PlayerBarActions }  from './components/PlayerBarActions'
export { catalogoApi }   from './api/catalogo.api'
export { bibliotecaApi } from './api/biblioteca.api'
export type {
  Track, TrackDetail, Artist, Album, Genre, TracksSearchParams,
  LibraryTrack, Favoritos, Historial, HistorialEntry, Playlist, PlaylistDetail,
} from './types'
