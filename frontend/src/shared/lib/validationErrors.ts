// Forma real de un item de `detail` en un 422 de FastAPI/Pydantic v2 — no
// documentado en ningún tipo del proyecto hasta ahora (auditoría S16: el
// array llegaba crudo hasta `ApiError.detailBody` sin que nada lo tipara ni
// lo consumiera).
export type ValidationErrorItem = {
  loc:  (string | number)[]
  msg:  string
  type: string
}

// Nombres de campo → etiqueta en español, para los campos que se repiten
// entre formularios (registro, perfil, checkout, subida de track). Un campo
// que no está acá cae a su propio nombre capitalizado — nunca se bloquea la
// traducción del mensaje por no tener una etiqueta bonita.
const ETIQUETAS_CAMPO: Record<string, string> = {
  email:                'Correo electrónico',
  password:             'Contraseña',
  nombre:                'Nombre',
  nombre_titular:        'Titular',
  name:                  'Nombre',
  pais:                  'País',
  rol:                   'Rol',
  role:                  'Rol',
  track_name:            'Nombre del track',
  artist_name:           'Artista',
  genero_ids:            'Géneros',
  genre_ids:             'Géneros',
  archivo:               'Archivo',
  numero_tarjeta:        'Número de tarjeta',
  fecha_expiracion:      'Fecha de expiración',
  codigo_postal:         'Código postal',
  ciudad:                'Ciudad',
  direccion:             'Dirección',
  cvv:                   'CVV',
  metodo_pago_id:        'Método de pago',
  email_institucional:   'Email institucional',
  plan_id:               'Plan',
}

function etiquetaCampo(loc: (string | number)[]): string {
  // Pydantic antepone 'body'/'query'/'path' al path real, e índices
  // numéricos cuando el campo inválido está dentro de una lista — el nombre
  // de campo útil para el usuario es el último segmento no numérico.
  const nombre = [...loc].reverse().find((seg) => typeof seg === 'string' && seg !== 'body' && seg !== 'query' && seg !== 'path')
  if (!nombre) return 'Campo'
  const clave = String(nombre)
  return ETIQUETAS_CAMPO[clave] ?? (clave.charAt(0).toUpperCase() + clave.slice(1).replace(/_/g, ' '))
}

// Traduce el `type`/`msg` de un error de Pydantic v2 a un mensaje legible en
// español. Prioridad: si el error viene de un `@field_validator` propio del
// backend (`raise ValueError("mensaje en español")`), Pydantic v2 lo envuelve
// como `type: 'value_error'` con `msg: "Value error, <mensaje original>"` —
// ese mensaje YA está en español y ya es específico (ej. "El código postal
// debe tener al menos 3 caracteres"), así que se usa tal cual quitando el
// prefijo en vez de reemplazarlo por un genérico. Los `type` restantes son
// los de validación estructural de Pydantic (tipo, longitud, rango), sin
// mensaje humano propio del backend.
export function traducirErrorValidacion(item: ValidationErrorItem): { campo: string; mensaje: string } {
  const campo = etiquetaCampo(item.loc)
  const msg = item.msg ?? ''

  if (item.type === 'value_error' || item.type?.startsWith('value_error.')) {
    const limpio = msg.replace(/^Value error,\s*/i, '').trim()
    if (limpio) return { campo, mensaje: limpio }
  }

  const numMatch = msg.match(/(\d+)/)
  const n = numMatch ? numMatch[1] : null

  switch (item.type) {
    case 'missing':
      return { campo, mensaje: 'Este campo es obligatorio.' }
    case 'string_too_short':
      return { campo, mensaje: n ? `Debe tener al menos ${n} caracteres.` : 'Es demasiado corto.' }
    case 'string_too_long':
      return { campo, mensaje: n ? `No puede superar los ${n} caracteres.` : 'Es demasiado largo.' }
    case 'string_type':
    case 'string_pattern_mismatch':
      return { campo, mensaje: 'El formato no es válido.' }
    case 'int_parsing':
    case 'int_type':
    case 'float_parsing':
    case 'float_type':
    case 'decimal_parsing':
      return { campo, mensaje: 'Debe ser un número válido.' }
    case 'bool_parsing':
    case 'bool_type':
      return { campo, mensaje: 'Debe ser verdadero o falso.' }
    case 'greater_than':
      return { campo, mensaje: n ? `Debe ser mayor que ${n}.` : 'El valor es demasiado bajo.' }
    case 'greater_than_equal':
      return { campo, mensaje: n ? `Debe ser mayor o igual a ${n}.` : 'El valor es demasiado bajo.' }
    case 'less_than':
      return { campo, mensaje: n ? `Debe ser menor que ${n}.` : 'El valor es demasiado alto.' }
    case 'less_than_equal':
      return { campo, mensaje: n ? `Debe ser menor o igual a ${n}.` : 'El valor es demasiado alto.' }
    case 'enum':
      return { campo, mensaje: 'El valor elegido no es válido.' }
    case 'list_type':
      return { campo, mensaje: 'Debe ser una lista de valores.' }
    case 'too_short':
      return { campo, mensaje: n ? `Selecciona al menos ${n}.` : 'Faltan elementos.' }
    default:
      // Último recurso: nunca mostrar el `type` crudo de Pydantic (jerga
      // técnica en inglés) — un genérico específico al campo es preferible.
      return { campo, mensaje: msg && !/^[a-z_]+\.[a-z_]+$/i.test(msg) ? msg : 'El valor no es válido.' }
  }
}

/** Un mensaje por línea, uno por cada error — para el toast/banner genérico
 * de cualquier formulario que todavía no tiene UI por campo (mejora gratis
 * para los 39+ call sites de `apiErrorMessage` sin tocarlos uno por uno). */
export function resumirErroresValidacion(errores: ValidationErrorItem[]): string {
  if (errores.length === 0) return 'Los datos enviados no son válidos.'
  return errores.map((e) => {
    const { campo, mensaje } = traducirErrorValidacion(e)
    return `${campo}: ${mensaje}`
  }).join(' · ')
}

/** Mapa campo -> mensaje a partir de la lista cruda de `ValidationErrorItem`
 * (ver `ApiError.validationErrors`) — separado de `fieldErrorsFromApiError`
 * (api-client.ts) para que este módulo no dependa de la clase `ApiError` y
 * evitar un import circular (api-client.ts ya importa de acá). */
export function fieldErrorsFromItems(errores: ValidationErrorItem[]): Record<string, string> | null {
  const mapa: Record<string, string> = {}
  for (const item of errores) {
    const nombre = [...item.loc].reverse().find((seg) => typeof seg === 'string' && seg !== 'body' && seg !== 'query' && seg !== 'path')
    if (!nombre) continue
    const { mensaje } = traducirErrorValidacion(item)
    mapa[String(nombre)] = mensaje
  }
  return Object.keys(mapa).length > 0 ? mapa : null
}
