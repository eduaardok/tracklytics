import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { useConfirm } from '@shared/context/ConfirmContext'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { ingestaApi, IngestaApiError } from '../api/ingesta.api'
import { DIM_TABLE_OPTIONS, type DimRow } from '../types'
import styles from './CrudDimensionesPage.module.css'

const FACTS_OPTION = '__facts__'
const PAGE_LIMIT = 20

// Longitud máxima de un campo de texto libre en este formulario — refleja
// `_MAX_STR_LEN` en `api/paquetes/gestion_datos/router.py` (auditoría de
// validación de entrada de datos: antes no había ningún límite, ni aquí ni
// en el backend).
const MAX_TEXT_LEN = 500

// Formulario genérico: los campos se derivan de las keys de una fila real
// (primera fila cargada, o la fila en edición) — no hay endpoint de esquema
// para 11 tablas heterogéneas, así que "crear" solo está disponible una vez
// que la tabla ya tiene al menos un registro que sirva de plantilla de campos.
// Se asume la primera key devuelta por `SELECT *` como PK (mismo criterio que
// `dim_pk_sql` en el backend: ORDER BY position LIMIT 1) — se muestra pero no
// se deja editar en modo edición. El backend ahora rechaza explícitamente
// (400) cualquier intento de incluir la PK en el payload de `dim_update`, en
// vez de descartarla en silencio como antes (auditoría de validación) — este
// disabled es solo la capa de UX/feedback inmediato, la protección real vive
// en el backend.
function DimForm({ fields, initial, pkKey, isEdit, onSubmit, onCancel, pending, error }: {
  fields:   string[]
  initial:  DimRow
  pkKey:    string | null
  isEdit:   boolean
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
  pending:  boolean
  error:    string | null
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f, initial[f] == null ? '' : String(initial[f])])),
  )
  const [localError, setLocalError] = useState<string | null>(null)

  // El id lo asigna siempre el backend (nunca el cliente) — al crear, ni
  // siquiera se muestra el campo (antes se precargaba con el id de la fila
  // usada como plantilla de campos, invitando a enviarlo tal cual: hallazgo
  // real, dos álbumes con el mismo album_id). Al editar sigue visible pero
  // bloqueado, como recordatorio de qué registro es.
  const displayFields = isEdit ? fields : fields.filter((f) => f !== pkKey)

  function inputType(v: unknown): 'number' | 'checkbox' | 'text' {
    if (typeof v === 'number') return 'number'
    if (typeof v === 'boolean') return 'checkbox'
    return 'text'
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const data: Record<string, unknown> = {}
    for (const f of fields) {
      if (f === pkKey) continue
      const raw = values[f]
      const kind = inputType(initial[f])
      if (kind === 'number') {
        const n = Number(raw)
        if (raw.trim() === '' || Number.isNaN(n)) {
          setLocalError(`"${f}" debe ser un número válido.`)
          return
        }
        if (n < 0) {
          setLocalError(`"${f}" no puede ser negativo.`)
          return
        }
        data[f] = n
      } else if (kind === 'checkbox') {
        data[f] = raw === 'true'
      } else {
        const trimmed = raw.trim()
        if (trimmed.length > MAX_TEXT_LEN) {
          setLocalError(`"${f}" excede la longitud máxima permitida (${MAX_TEXT_LEN} caracteres).`)
          return
        }
        data[f] = trimmed
      }
    }
    setLocalError(null)
    onSubmit(data)
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {(localError || error) && <p className={styles.errorText}>{localError ?? error}</p>}
      <div className={styles.formGrid}>
        {displayFields.map((f) => {
          const kind = inputType(initial[f])
          const locked = isEdit && f === pkKey
          return (
            <div key={f} className={styles.field}>
              <label className={styles.label}>{f}{locked ? ' (PK)' : ''}</label>
              {kind === 'checkbox' ? (
                <select
                  className={styles.input}
                  value={values[f]}
                  disabled={locked}
                  onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  className={styles.input}
                  type={kind === 'number' ? 'number' : 'text'}
                  value={values[f]}
                  disabled={locked}
                  min={kind === 'number' ? 0 : undefined}
                  maxLength={kind === 'text' ? MAX_TEXT_LEN : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                />
              )}
            </div>
          )
        })}
      </div>
      <div className={styles.formActions}>
        <button type="submit" className={styles.btnPrimary} disabled={pending}>
          {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'}
        </button>
        <button type="button" className={styles.btnGhost} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

function ConfirmModal({ title, body, onConfirm, onCancel }: { title: string; body: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <p className={styles.modalTitle}>{title}</p>
        <p className={styles.modalBody}>{body}</p>
        <div className={styles.formActions}>
          <button type="button" className={styles.btnDanger} onClick={onConfirm}>Eliminar</button>
          <button type="button" className={styles.btnGhost} onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export function CrudDimensionesPage() {
  useDocumentTitle('Dimensiones del catálogo')
  const reportRef = useRef<HTMLElement>(null)
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [table, setTable]   = useState<string>(DIM_TABLE_OPTIONS[0].key)
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)
  const [formMode, setFormMode] = useState<'none' | 'create' | 'edit'>('none')
  const [editingRow, setEditingRow] = useState<DimRow | null>(null)
  const [formError, setFormError]   = useState<string | null>(null)
  const [formPending, setFormPending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DimRow | null>(null)
  const [deleteError, setDeleteError]   = useState<string | null>(null)

  const isFacts = table === FACTS_OPTION

  const listQuery = useQuery({
    queryKey: ['ingesta', 'dim-list', table, page, search],
    queryFn: () =>
      isFacts
        ? ingestaApi.factsList(page, PAGE_LIMIT, search)
        : ingestaApi.dimList(table, page, PAGE_LIMIT, search),
  })

  function changeTable(next: string) {
    setTable(next)
    setPage(1)
    setSearch('')
    setFormMode('none')
  }

  const rows: DimRow[] = (listQuery.data?.data as DimRow[] | undefined) ?? []
  const total = listQuery.data?.total ?? 0
  const fields = rows.length > 0 ? Object.keys(rows[0]) : []
  const pkKey  = fields[0] ?? null

  function refetchList() {
    queryClient.invalidateQueries({ queryKey: ['ingesta', 'dim-list', table] })
  }

  async function handleCreate(data: Record<string, unknown>) {
    setFormPending(true)
    setFormError(null)
    try {
      await ingestaApi.dimCreate(table, data)
      setFormMode('none')
      refetchList()
    } catch (err) {
      setFormError(err instanceof IngestaApiError ? err.message : 'No se pudo crear el registro.')
    } finally {
      setFormPending(false)
    }
  }

  async function handleUpdate(data: Record<string, unknown>) {
    if (!editingRow || !pkKey) return
    setFormPending(true)
    setFormError(null)
    try {
      await ingestaApi.dimUpdate(table, Number(editingRow[pkKey]), data)
      setFormMode('none')
      setEditingRow(null)
      refetchList()
    } catch (err) {
      setFormError(err instanceof IngestaApiError ? err.message : 'No se pudo actualizar el registro.')
    } finally {
      setFormPending(false)
    }
  }

  // RN-ING-004: primer intento sin `confirmar` → si el backend responde 409
  // (referenciado por FACT_TRACKS), se pide una segunda confirmación nativa
  // con el mensaje real del backend, y recién ahí se reintenta con
  // `confirmar=true` — mismo flujo de dos pasos que app/analytics/crud.html.
  async function confirmDelete() {
    if (!deleteTarget || !pkKey) return
    const id = Number(deleteTarget[pkKey])
    setDeleteTarget(null)
    setDeleteError(null)
    try {
      await ingestaApi.dimDelete(table, id, false)
      refetchList()
    } catch (err) {
      if (err instanceof IngestaApiError && err.status === 409) {
        const forzar = await confirm(`${err.message}\n\n¿Eliminar de todas formas?`, { danger: true, confirmLabel: 'Eliminar de todas formas' })
        if (forzar) {
          try {
            await ingestaApi.dimDelete(table, id, true)
            refetchList()
          } catch (err2) {
            setDeleteError(err2 instanceof IngestaApiError ? err2.message : 'No se pudo eliminar el registro.')
          }
        }
      } else {
        setDeleteError(err instanceof IngestaApiError ? err.message : 'No se pudo eliminar el registro.')
      }
    }
  }

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Dimensiones del catálogo</h1>
        <ExportPDFButton targetRef={reportRef} fileName="dimensiones-catalogo" title="Dimensiones del catálogo" />
      </div>

      <div className={styles.controls} data-pdf-export-ignore="true">
        <div className={styles.field}>
          <label className={styles.label}>Tabla</label>
          <select className={styles.input} value={table} onChange={(e) => changeTable(e.target.value)}>
            {DIM_TABLE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
            <option value={FACTS_OPTION}>Hechos (FACT_TRACKS — solo lectura)</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Buscar</label>
          <input
            className={styles.input}
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Texto…"
          />
        </div>
        {!isFacts && (
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={rows.length === 0}
            title={rows.length === 0 ? 'Necesitas al menos un registro existente para conocer los campos' : undefined}
            onClick={() => { setFormMode('create'); setFormError(null) }}
          >
            + Nuevo
          </button>
        )}
      </div>

      {listQuery.isLoading && <div className={styles.panel} style={{ minHeight: 160 }} />}
      {listQuery.isError && (
        <div className={styles.panel}><p className={styles.errorText}>No se pudo cargar la tabla.</p></div>
      )}
      {deleteError && <p className={styles.errorText}>{deleteError}</p>}

      {formMode === 'create' && (
        <div className={styles.panel} style={{ marginBottom: 'var(--space-md)' }} data-pdf-export-ignore="true">
          <DimForm
            fields={fields}
            initial={rows[0] ?? {}}
            pkKey={pkKey}
            isEdit={false}
            pending={formPending}
            error={formError}
            onSubmit={handleCreate}
            onCancel={() => setFormMode('none')}
          />
        </div>
      )}

      {formMode === 'edit' && editingRow && (
        <div className={styles.panel} style={{ marginBottom: 'var(--space-md)' }} data-pdf-export-ignore="true">
          <DimForm
            fields={fields}
            initial={editingRow}
            pkKey={pkKey}
            isEdit
            pending={formPending}
            error={formError}
            onSubmit={handleUpdate}
            onCancel={() => { setFormMode('none'); setEditingRow(null) }}
          />
        </div>
      )}

      {rows.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {fields.map((f) => <th key={f} className={styles.thLeft}>{f}</th>)}
                  {!isFacts && <th className={styles.thRight}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row[pkKey ?? fields[0]])}>
                    {fields.map((f) => <td key={f} className={styles.rowLabel}>{String(row[f] ?? '—')}</td>)}
                    {!isFacts && (
                      <td className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.btnGhostSm}
                          onClick={() => { setEditingRow(row); setFormMode('edit'); setFormError(null) }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={styles.btnDangerSm}
                          onClick={() => setDeleteTarget(row)}
                        >
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>{total} registros · página {page}</span>
            <div className={styles.paginationBtns} data-pdf-export-ignore="true">
              <button type="button" className={styles.btnGhostSm} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
              <button type="button" className={styles.btnGhostSm} disabled={page * PAGE_LIMIT >= total} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
            </div>
          </div>
        </div>
      )}

      {!listQuery.isLoading && !listQuery.isError && rows.length === 0 && (
        <div className={styles.panel}><p className={styles.muted}>Sin registros.</p></div>
      )}

      {deleteTarget && pkKey && (
        <ConfirmModal
          title="¿Eliminar este registro?"
          body={`${pkKey} = ${String(deleteTarget[pkKey])} — esta acción no se puede deshacer.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  )
}
