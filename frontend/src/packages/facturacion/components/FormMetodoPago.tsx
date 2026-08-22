import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { distribucionApi } from '@packages/distribucion/api/distribucion.api'
import type { Pais } from '@packages/distribucion/types'
import { facturacionApi } from '../api/facturacion.api'
import {
  codigoPostalValido, expiracionValida, formatearExpiracion, formatearNumeroTarjeta,
  inferirMarcaTarjeta, luhnValido, mesExpiracionFueraDeRango,
} from '../lib/checkout'
import styles from '../pages/FacturacionPages.module.css'

// F7 (auditoría de lógica y flujos): el alta de método de pago vivía dos
// veces con rigor distinto — FacturacionPage exigía titular + Luhn +
// expiración + CVV + país/código postal, mientras que el formulario inline
// de PlanesPage aceptaba solo tipo + 4 dígitos para EL MISMO objeto
// (DIM_METODO_PAGO). Este componente unifica ambos puntos de entrada al
// nivel del más estricto. Igual que en FacturacionPage: el número completo,
// la expiración y el CVV viven SOLO en este estado local — nunca viajan al
// backend (solo `ultimos_4_digitos`, ya extraído).
export function FormMetodoPago({ onRegistrado }: { onRegistrado?: (metodoPagoId: string) => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [nombreTitular, setNombreTitular] = useState('')
  const [numeroTarjeta, setNumeroTarjeta] = useState('')
  const [expiracion, setExpiracion]       = useState('')
  const [cvv, setCvv]                     = useState('')
  const [direccion, setDireccion]         = useState('')
  const [ciudad, setCiudad]               = useState('')
  const [paisId, setPaisId]               = useState('')
  const [codigoPostal, setCodigoPostal]   = useState('')
  const [paises, setPaises]               = useState<Pais[]>([])

  useEffect(() => {
    distribucionApi.paisesPublico().then((res) => setPaises(res.data ?? [])).catch(() => setPaises([]))
  }, [])

  const ultimos4 = numeroTarjeta.replace(/\D/g, '').slice(-4)
  const tipoInferido = inferirMarcaTarjeta(numeroTarjeta)

  const registrarMetodo = useMutation({
    mutationFn: () =>
      facturacionApi.registrarMetodoPago({
        tipo: tipoInferido,
        ultimos_4_digitos: ultimos4,
        pais: paisId,
        nombre_titular: nombreTitular.trim(),
        direccion: direccion.trim(),
        ciudad: ciudad.trim(),
        codigo_postal: codigoPostal.trim(),
      }),
    onSuccess: (res) => {
      setNombreTitular(''); setNumeroTarjeta(''); setExpiracion(''); setCvv('')
      setDireccion(''); setCiudad(''); setPaisId(''); setCodigoPostal('')
      queryClient.invalidateQueries({ queryKey: ['facturacion', 'metodos-pago'] })
      toast.success('Método de pago agregado')
      onRegistrado?.(res.metodo_pago_id)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo agregar el método de pago.')),
  })

  return (
    <form
      className={styles.addForm}
      onSubmit={(e) => {
        e.preventDefault()
        if (!nombreTitular.trim()) {
          toast.error('Ingresa el nombre del titular de la tarjeta.')
          return
        }
        if (!luhnValido(numeroTarjeta)) {
          toast.error('El número de tarjeta no es válido.')
          return
        }
        if (!expiracionValida(expiracion)) {
          toast.error('La fecha de expiración no es válida o ya venció.')
          return
        }
        if (!/^\d{3,4}$/.test(cvv)) {
          toast.error('El CVV debe tener 3 o 4 dígitos.')
          return
        }
        if (!paisId) {
          toast.error('Selecciona el país de facturación.')
          return
        }
        if (!codigoPostalValido(codigoPostal)) {
          toast.error('El código postal debe tener entre 3 y 12 caracteres.')
          return
        }
        registrarMetodo.mutate()
      }}
      noValidate
    >
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="nombreTitular">titular</label>
        <input
          id="nombreTitular"
          className={styles.input}
          type="text"
          autoComplete="cc-name"
          value={nombreTitular}
          onChange={(e) => setNombreTitular(e.target.value)}
          placeholder="Como aparece en la tarjeta"
          maxLength={200}
          required
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="numeroTarjeta">número de tarjeta</label>
        <input
          id="numeroTarjeta"
          className={styles.input}
          type="text"
          autoComplete="cc-number"
          inputMode="numeric"
          value={numeroTarjeta}
          onChange={(e) => setNumeroTarjeta(formatearNumeroTarjeta(e.target.value))}
          maxLength={23}
          placeholder="4242 4242 4242 4242"
          required
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="expiracion">expiración (MM/AA)</label>
        <input
          id="expiracion"
          className={styles.input}
          type="text"
          inputMode="numeric"
          autoComplete="cc-exp"
          value={expiracion}
          onChange={(e) => setExpiracion(formatearExpiracion(e.target.value))}
          maxLength={5}
          placeholder="12/29"
          required
        />
        {/* Feedback inline (no solo al submit) — apenas el mes queda
            completo con 2 dígitos, antes de que el usuario termine de
            escribir el año. */}
        {mesExpiracionFueraDeRango(expiracion) && (
          <span className={styles.fieldHint}>El mes debe estar entre 01 y 12.</span>
        )}
        {!mesExpiracionFueraDeRango(expiracion) && expiracion.length === 5 && !expiracionValida(expiracion) && (
          <span className={styles.fieldHint}>Esa fecha ya venció.</span>
        )}
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="cvv">CVV</label>
        <input
          id="cvv"
          className={styles.input}
          type="password"
          autoComplete="cc-csc"
          inputMode="numeric"
          value={cvv}
          onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
          maxLength={4}
          placeholder="•••"
          required
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="direccion">dirección</label>
        <input
          id="direccion"
          className={styles.input}
          type="text"
          autoComplete="address-line1"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          placeholder="Calle y número"
          maxLength={300}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="ciudad">ciudad</label>
        <input
          id="ciudad"
          className={styles.input}
          type="text"
          autoComplete="address-level2"
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value)}
          placeholder="Madrid"
          maxLength={150}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="paisFacturacion">país</label>
        <select
          id="paisFacturacion"
          className={styles.input}
          autoComplete="country"
          value={paisId}
          onChange={(e) => setPaisId(e.target.value)}
          required
        >
          <option value="">Selecciona…</option>
          {paises.map((p) => (
            <option key={p.pais_id} value={p.codigo_iso}>{p.nombre}</option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="codigoPostal">código postal</label>
        <input
          id="codigoPostal"
          className={styles.input}
          type="text"
          autoComplete="postal-code"
          value={codigoPostal}
          onChange={(e) => setCodigoPostal(e.target.value)}
          placeholder="28001"
          maxLength={12}
        />
        {/* 12 caracteres, no 20 (S16): cubre con margen los formatos reales
            más largos (ej. ZIP+4 de EE.UU. = 10) sin bloquear ningún código
            postal legítimo. */}
        {!codigoPostalValido(codigoPostal) && (
          <span className={styles.fieldHint}>Debe tener entre 3 y 12 caracteres.</span>
        )}
      </div>
      <button
        className={styles.btnPrimary}
        type="submit"
        disabled={registrarMetodo.isPending}
      >
        {registrarMetodo.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
