import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MailWarning } from 'lucide-react'

import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { isAuthenticated } from '@shared/lib/session'

import { authApi } from '../api/auth.api'
import styles from './VerificacionEmailBanner.module.css'

/**
 * Banner persistente de verificación de correo (change p2-descubrimiento-comunidad).
 *
 * Flujo simulado: no hay envío real de correo, así que el enlace de
 * verificación se muestra directamente aquí — mismo patrón que la recuperación
 * de contraseña de P0. El banner se oculta solo cuando la cuenta queda
 * verificada; no es descartable a propósito, porque hay acciones del producto
 * (comentar, publicar, contratar un plan) que siguen bloqueadas hasta entonces.
 */
export function VerificacionEmailBanner() {
  const [tokenVisible, setTokenVisible] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()
  const autenticado = isAuthenticated()

  const perfil = useQuery({
    queryKey: ['seguridad', 'mi-perfil'],
    queryFn:  () => authApi.miPerfil(),
    enabled:  autenticado,
  })

  const reenviar = useMutation({
    mutationFn: () => authApi.reenviarVerificacion(perfil.data?.email ?? ''),
    onSuccess: (r) => {
      if (r.token_verificacion) setTokenVisible(r.token_verificacion)
      toast.success('Enlace de verificación regenerado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo reenviar la verificación.')),
  })

  const verificar = useMutation({
    mutationFn: (token: string) => authApi.verificarEmail(token),
    onSuccess: () => {
      setTokenVisible(null)
      queryClient.invalidateQueries({ queryKey: ['seguridad', 'mi-perfil'] })
      toast.success('Correo verificado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo verificar el correo.')),
  })

  // Mientras carga el perfil no se asume nada: mostrar el banner "por si acaso"
  // le diría a un usuario ya verificado que no lo está.
  if (!autenticado || !perfil.data || perfil.data.email_verificado) return null

  return (
    <div className={styles.banner} role="status">
      <MailWarning size={18} className={styles.icon} aria-hidden="true" />
      <div className={styles.text}>
        <strong className={styles.title}>Verifica tu correo</strong>
        <span className={styles.body}>
          Hasta verificar <code className={styles.email}>{perfil.data.email}</code> no
          podrás comentar, publicar tracks ni contratar un plan de pago.
        </span>
        {tokenVisible && (
          <span className={styles.simulado}>
            Entorno de demostración: no se envía correo real.{' '}
            <button
              type="button"
              className={styles.linkBtn}
              disabled={verificar.isPending}
              onClick={() => verificar.mutate(tokenVisible)}
            >
              {verificar.isPending ? 'Verificando…' : 'Verificar mi correo ahora'}
            </button>
          </span>
        )}
      </div>
      <button
        type="button"
        className={styles.action}
        disabled={reenviar.isPending}
        onClick={() => reenviar.mutate()}
      >
        {reenviar.isPending ? 'Generando…' : 'Reenviar enlace'}
      </button>
    </div>
  )
}
