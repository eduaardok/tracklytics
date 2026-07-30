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

// Espejo de la respuesta de `GET /app/v1/partners/metricas` (CU-O56) — vista
// interna de staff sobre `LOG_LLAMADAS_PARTNER`, no confundir con
// `PartnerProbeResult` de arriba (una sola llamada de prueba desde la
// consola). `nombre` cae al propio `partner_id` cuando el backend no pudo
// resolverlo contra PocketBase (partner ya no existe en el directorio).
export type PartnerMetricaTier = {
  tier:            string
  total_llamadas:  number
}

export type PartnerMetrica = {
  partner_id:                    string
  nombre:                        string
  total_llamadas:                number
  llamadas_exitosas:             number
  llamadas_error:                number
  tasa_exito_pct:                number
  latencia_promedio_ms_exitosas: number
  ultima_llamada:                string | null
  desglose_por_tier:             PartnerMetricaTier[]
}
