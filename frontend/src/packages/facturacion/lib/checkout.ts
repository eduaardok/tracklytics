// Utilidades puras del checkout simulado (sin pasarela de pago real —
// ver design.md de la capability). Todo lo que toca el número de tarjeta
// completo, la expiración o el CVV vive únicamente acá y en el estado local
// del formulario: nunca se exporta hacia una llamada de red ni un log.

/** Algoritmo de Luhn — valida el formato del número de tarjeta (checksum),
 * no verifica que la tarjeta exista o esté activa (no hay pasarela real). */
export function luhnValido(numero: string): boolean {
  const digits = numero.replace(/\D/g, '')
  if (digits.length < 12) return false
  let suma = 0
  let doblar = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (doblar) {
      d *= 2
      if (d > 9) d -= 9
    }
    suma += d
    doblar = !doblar
  }
  return suma % 10 === 0
}

/** Inferencia cosmética de marca por prefijo — no es una base BIN real. */
export function inferirMarcaTarjeta(numero: string): string {
  const digits = numero.replace(/\D/g, '')
  if (/^4/.test(digits)) return 'visa'
  if (/^5[1-5]/.test(digits)) return 'mastercard'
  if (/^3[47]/.test(digits)) return 'amex'
  if (/^6(?:011|5)/.test(digits)) return 'discover'
  return 'tarjeta'
}

/** Formatea en grupos de 4 dígitos mientras el usuario escribe. */
export function formatearNumeroTarjeta(valor: string): string {
  const digits = valor.replace(/\D/g, '').slice(0, 19)
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

/** MM/AA no vacío y no vencido (comparación por mes/año, sin día). */
export function expiracionValida(mmYy: string): boolean {
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(mmYy.trim())
  if (!m) return false
  const mes = Number(m[1])
  const anio = 2000 + Number(m[2])
  if (mes < 1 || mes > 12) return false
  const ahora = new Date()
  const finMes = new Date(anio, mes, 0, 23, 59, 59)
  return finMes >= ahora
}
