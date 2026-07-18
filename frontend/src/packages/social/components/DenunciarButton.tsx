import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { socialApi } from '../api/social.api'
import type { MotivoDenuncia, TipoObjetoDenuncia } from '../types'
import styles from './DenunciarButton.module.css'

const MOTIVOS: { value: MotivoDenuncia; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'contenido_inapropiado', label: 'Contenido inapropiado' },
  { value: 'derechos_de_autor', label: 'Derechos de autor' },
  { value: 'otro', label: 'Otro' },
]

// Botón + modal de denuncia de contenido (change p1-ciclos-vida). Reutilizable
// para un comentario o un track — la denuncia entra a la bandeja de moderación.
export function DenunciarButton({ tipoObjeto, objetoId, label = 'Denunciar', className }: {
  tipoObjeto: TipoObjetoDenuncia
  objetoId: string
  label?: string
  className?: string
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState<MotivoDenuncia>('spam')
  const [descripcion, setDescripcion] = useState('')

  const enviar = useMutation({
    mutationFn: () => socialApi.denunciar({ tipo_objeto: tipoObjeto, objeto_id: objetoId, motivo, descripcion: descripcion.trim() }),
    onSuccess: () => {
      setOpen(false); setDescripcion(''); setMotivo('spam')
      toast.success('Gracias — tu denuncia fue registrada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo enviar la denuncia.')),
  })

  return (
    <>
      <button type="button" className={className ?? styles.trigger} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className={styles.modalBackdrop} onMouseDown={() => setOpen(false)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Denunciar contenido" onMouseDown={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>Denunciar {tipoObjeto === 'comentario' ? 'comentario' : 'track'}</p>
            <form className={styles.modalForm} onSubmit={(e) => { e.preventDefault(); enviar.mutate() }}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Motivo</span>
                <select className={styles.select} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoDenuncia)}>
                  {MOTIVOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Descripción (opcional)</span>
                <textarea className={styles.textarea} rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Cuéntanos qué ocurre…" />
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={() => setOpen(false)}>Cancelar</button>
                <button type="submit" className={styles.btnPrimary} disabled={enviar.isPending}>{enviar.isPending ? 'Enviando…' : 'Enviar denuncia'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
