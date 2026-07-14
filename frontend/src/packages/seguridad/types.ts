export type Permiso = {
  recurso:          string
  accion:           string
  permitido:        boolean
  fecha_asignacion: string
  asignado_por:     string
}

export type AuditLogEntry = {
  audit_id:       string
  usuario_id:     string
  usuario_nombre: string | null
  usuario_email:  string | null
  accion:         string
  tabla_afectada: string
  antes:          string
  despues:        string
  timestamp:      string
}

export type ErrorSistemaEntry = {
  error_id:       string
  codigo:         string
  mensaje:        string
  servicio:       string
  usuario_id:     string | null
  usuario_nombre: string | null
  usuario_email:  string | null
  timestamp:      string
  resolved:       boolean
}

export type AsignarPermisoBody = {
  usuario_id: string
  recurso:    string
  accion:     string
  permitido:  boolean
}

export type CatalogoPermisos = {
  recursos: string[]
  acciones: string[]
}

export type DashboardSeguridad = {
  acciones_por_dia:         { dia: string; total: number }[]
  errores_24h:              number
  sesiones_abiertas_total:  number
}
