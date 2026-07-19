import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiErrorMessage } from '@shared/lib/api-client'
import { useConfirm } from '@shared/context/ConfirmContext'
import { useToast } from '@shared/context/ToastContext'
import { getUser } from '@shared/lib/session'

import { socialApi } from '../api/social.api'
import styles from './DenunciarButton.module.css'

/**
 * "Bloquear usuario" desde un comentario (change p2-descubrimiento-comunidad).
 *
 * Es una herramienta del propio usuario, no de moderación: no pide motivo ni
 * pasa por un admin. Sí confirma, porque el efecto (dejar de ver a alguien) no
 * es evidente de antemano y conviene explicarlo antes, no después.
 *
 * No se renderiza sobre uno mismo: bloquearse a uno mismo no existe y el
 * backend lo rechaza con 422.
 */
export function BloquearButton({ usuarioId, nombre, className }: {
  usuarioId: string
  nombre?:   string
  className?: string
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const yo = getUser()?.id

  const bloquear = useMutation({
    mutationFn: () => socialApi.bloquear(usuarioId),
    onSuccess: () => {
      // Los comentarios y el feed se filtran en el backend por bloqueo: hay que
      // refrescarlos para que el bloqueado desaparezca sin recargar la página.
      queryClient.invalidateQueries({ queryKey: ['social'] })
      toast.success('Usuario bloqueado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo bloquear al usuario.')),
  })

  if (!yo || yo === usuarioId) return null

  async function handleClick() {
    const etiqueta = nombre ?? `Usuario ${usuarioId.slice(0, 6)}`
    const ok = await confirm(
      `Dejarás de ver los comentarios de ${etiqueta} y no podrá responder a los tuyos. ` +
      'Puedes deshacerlo cuando quieras desde tu perfil.',
      { title: 'Bloquear usuario', confirmLabel: 'Bloquear', danger: true },
    )
    if (ok) bloquear.mutate()
  }

  return (
    <button
      type="button"
      className={className ?? styles.trigger}
      disabled={bloquear.isPending}
      onClick={handleClick}
    >
      {bloquear.isPending ? 'Bloqueando…' : 'Bloquear'}
    </button>
  )
}
