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
  // Historial de sanciones (change p2-descubrimiento-comunidad). Opcional por
  // compatibilidad con respuestas anteriores al cambio.
  strikes?:            Strike[]
}

// ── Sanciones (change p2-descubrimiento-comunidad) ───────────────────────────

export type Strike = {
  strike_id:   number
  motivo:      string
  origen_tipo: 'denuncia' | 'manual'
  origen_id:   string
  emitido_por: string
  activo:      number
  created_at:  string
}

export type StrikeEmitidoResultado = {
  status:            string
  strike_id:         number
  strikes_activos:   number
  cuenta_suspendida: boolean
}

// ── Reportes administrativos (S12) ──────────────────────────────────────────

export type UsuarioReporte = {
  usuario_id:        string
  nombre:            string
  email:             string
  pais:              string
  estado_cuenta:     EstadoCuenta
  ultimo_acceso:     string | null
  rol:               string
  canal_adquisicion: string
  plan_activo:       string
}

// Obj 30 / OT-30 (S13-P2): listado global de sesiones abiertas.
// Sin `ip`: el pipeline no la captura hoy (ni FACT_SESION ni DIM_DISPOSITIVO
// tienen esa columna) — se documenta como ausente en vez de fabricarla.
export type SesionActiva = {
  sesion_id:         string
  usuario_id:        string
  nombre:            string | null
  email:             string | null
  rol:               string
  dispositivo_tipo:  string | null
  dispositivo_os:    string | null
  fecha_inicio:      string
  duracion_segundos: number
}

export type StrikeGlobal = {
  strike_id:      number
  usuario_id:     string
  usuario_nombre: string | null
  usuario_email:  string | null
  motivo:         string
  origen_tipo:    'denuncia' | 'manual'
  origen_id:      string
  emitido_por:    string
  created_at:     string
}

// ── Exportación de datos personales (change p2-descubrimiento-comunidad) ─────

export type MisDatos = {
  generado_en: string
  usuario_id:  string
  datos:       Record<string, unknown>
}
