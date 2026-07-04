export type PartnerTier = 'basico' | 'pro' | 'enterprise'

// Endpoint probado desde la consola — espejo de `_TRACK_FIELDS`/`_TIER_ORDER`
// y de las 9 rutas reales en `api/paquetes/partners/router.py`, no una lista
// inventada. `minTier` es el tier declarado en el backend para ese endpoint
// (label informativo — la consola no reimplementa esa regla, solo la muestra).
export type PartnerEndpointId =
  | 'tracks' | 'tracksExport' | 'trackDetail'
  | 'artistas' | 'artistaDetail'
  | 'albumes' | 'albumDetail'
  | 'generos' | 'generoDetail'

export type PartnerEndpoint = {
  id:        PartnerEndpointId
  method:    'GET'
  label:     string
  minTier:   PartnerTier
  // Construye el path real a partir de params opcionales del formulario
  // (page/limit/id) — cada endpoint declara los que necesita.
  buildPath: (params: { page: string; limit: string; id: string }) => string
}

export type PartnerProbeResult = {
  status:    number
  ok:        boolean
  ms:        number
  body:      unknown
}
