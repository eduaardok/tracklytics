import { Eye, Pencil, Trash2 } from 'lucide-react'
import styles from './CrudActionButtons.module.css'

type Props = {
  onView?:      () => void
  onEdit?:      () => void
  onDelete?:    () => void
  // Nombre real de la acción destructiva/terminal por entidad — no todas
  // "eliminan" un registro (partners se desactivan, licencias se revocan,
  // tickets se resuelven) pero visualmente comparten el mismo botón rojo.
  deleteLabel?: string
}

// Columna de acciones reutilizable para las tablas CRUD (S13-P2) — mismo
// set de 3 íconos (Eye/Pencil/Trash2 de lucide-react) en toda entidad
// administrativa, en vez de que cada tabla arme sus propios botones de texto.
// Cualquier acción omitida (ej. sin `onEdit`) simplemente no renderiza su
// botón, no lo deshabilita — evita un tooltip "editar" sobre un botón que
// nunca podría hacer nada.
export function CrudActionButtons({ onView, onEdit, onDelete, deleteLabel = 'Eliminar' }: Props) {
  return (
    <div className={styles.actions}>
      {onView && (
        <button type="button" className={styles.btn} onClick={onView} title="Ver detalle" aria-label="Ver detalle">
          <Eye size={15} aria-hidden="true" />
        </button>
      )}
      {onEdit && (
        <button type="button" className={styles.btn} onClick={onEdit} title="Editar" aria-label="Editar">
          <Pencil size={15} aria-hidden="true" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={onDelete}
          title={deleteLabel}
          aria-label={deleteLabel}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
