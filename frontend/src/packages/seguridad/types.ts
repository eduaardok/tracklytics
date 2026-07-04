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
  accion:         string
  tabla_afectada: string
  antes:          string
  despues:        string
  timestamp:      string
}

export type ErrorSistemaEntry = {
  error_id:   string
  codigo:     string
  mensaje:    string
  servicio:   string
  usuario_id: string | null
  timestamp:  string
  resolved:   boolean
}

export type AsignarPermisoBody = {
  usuario_id: string
  recurso:    string
  accion:     string
  permitido:  boolean
}
