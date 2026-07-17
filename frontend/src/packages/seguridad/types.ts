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

// ── Gestión administrativa de usuarios (change roles-gestion-usuarios) ─────────

export type EstadoCuenta = 'activa' | 'suspendido' | 'eliminado'

export type UsuarioAdmin = {
  usuario_id:     string
  nombre:         string
  email:          string
  rol:            string
  fecha_registro: string
  estado_cuenta:  EstadoCuenta
}

export type RolAdmin = {
  rol_admin:    string
  nombre:       string
  capabilities: string[]
  descripcion:  string
}

export type RolAdminAsignado = {
  rol_admin:    string
  nombre:       string | null
  asignado_por: string
  fecha:        string
}

export type Usuario360 = {
  perfil: {
    usuario_id:     string
    nombre:         string
    email:          string
    pais:           string
    rol:            string
    perfil_publico: boolean
    fecha_registro: string
    estado_cuenta:  EstadoCuenta
  }
  roles_admin:         RolAdminAsignado[]
  suscripcion_activa:  Record<string, unknown> | null
  transacciones:       { transaccion_id: string; monto: number; moneda: string; estado: string; suscripcion_id: string; fecha: string }[]
  sesiones_activas:    { sesion_id: string; dispositivo_id: string; fecha_inicio: string; tipo: string | null; os: string | null }[]
  permisos:            Permiso[]
  ultimo_login:        string | null
}
