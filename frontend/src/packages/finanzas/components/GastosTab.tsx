import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { finanzasApi } from '../api/finanzas.api'
import { CategoriaTreemap } from './charts/CategoriaTreemap'
import { fmtMoney, fmtDate, isoToday, isoDaysAgo, CATEGORIA_LABEL } from '../lib/format'
import type { CategoriaGasto, GastoBody, GastoOperativo } from '../types'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import styles from '../pages/FinanzasPages.module.css'

const CATEGORIAS = Object.keys(CATEGORIA_LABEL) as CategoriaGasto[]

const emptyForm: GastoBody = { concepto: '', categoria: 'infraestructura', monto: 0, fecha: isoToday(), descripcion: '' }

// Gastos operativos (CU-O82) — CRUD con soft-delete; un gasto `anulado` no se
// elimina, solo deja de sumar en dashboard/indicadores/reporte (queries de
// `finanzas` filtran `estado='activo'` server-side).
export function GastosTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const reportRef = useRef<HTMLDivElement>(null)

  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activo')
  // Fix S17 (auditoría, sección 3.2): sin rango de fecha por defecto, esta
  // query traía el histórico completo de gastos — mismo default de 30 días
  // que ya usa `ReembolsosTab` (vecina, mismo paquete).
  const [desde, setDesde] = useState(isoDaysAgo(30))
  const [hasta, setHasta] = useState(isoToday())

  const gastos = useQuery({
    queryKey: ['finanzas', 'gastos', filtroCategoria, filtroEstado, desde, hasta],
    queryFn: () => finanzasApi.gastos({ categoria: filtroCategoria || undefined, estado: filtroEstado || undefined, desde, hasta }),
  })

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<GastoBody>(emptyForm)

  const crear = useMutation({
    mutationFn: () => finanzasApi.crearGasto(form),
    onSuccess: () => {
      setForm(emptyForm)
      queryClient.invalidateQueries({ queryKey: ['finanzas', 'gastos'] })
      toast.success('Gasto registrado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo registrar el gasto.')),
  })

  const editar = useMutation({
    mutationFn: () => finanzasApi.editarGasto(editandoId!, form),
    onSuccess: () => {
      setEditandoId(null); setForm(emptyForm)
      queryClient.invalidateQueries({ queryKey: ['finanzas', 'gastos'] })
      toast.success('Gasto actualizado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo editar el gasto.')),
  })

  const anular = useMutation({
    mutationFn: (gastoId: string) => finanzasApi.anularGasto(gastoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finanzas', 'gastos'] })
      toast.success('Gasto anulado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo anular el gasto.')),
  })

  // Fix S17 (auditoría, sección 3.3): "Anular" disparaba sin confirmación.
  async function handleAnular(g: GastoOperativo) {
    const ok = await confirm(
      `"${g.concepto}" (${fmtMoney(g.monto)}) deja de sumar en dashboard/indicadores/reporte. El registro no se borra, se puede seguir consultando con el filtro "Anulado".`,
      { title: 'Anular gasto', confirmLabel: 'Anular', danger: true },
    )
    if (ok) anular.mutate(g.gasto_id)
  }

  function empezarEdicion(g: GastoOperativo) {
    setEditandoId(g.gasto_id)
    setForm({ concepto: g.concepto, categoria: g.categoria, monto: g.monto, fecha: g.fecha.slice(0, 10), descripcion: g.descripcion })
  }
  function cancelarEdicion() {
    setEditandoId(null)
    setForm(emptyForm)
  }

  const data: GastoOperativo[] = gastos.data?.data ?? []

  const porCategoria = useMemo(() => {
    const totales = new Map<string, number>()
    for (const g of data) {
      if (g.estado !== 'activo') continue
      totales.set(g.categoria, (totales.get(g.categoria) ?? 0) + g.monto)
    }
    return Array.from(totales, ([categoria, total]) => ({ categoria: categoria as CategoriaGasto, total }))
  }, [data])

  return (
    <div ref={reportRef}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-sm)' }}>
        <ExportPDFButton targetRef={reportRef} fileName="finanzas-gastos" title="Finanzas — Gastos operativos" />
      </div>
      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Gasto activo por categoría (filtro actual)</p>
          <CategoriaTreemap data={porCategoria} />
        </div>
        <div className={styles.kpiPanel}>
          <p className={styles.panelTitle}>Resumen</p>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{fmtMoney(porCategoria.reduce((s, c) => s + c.total, 0))}</span>
            <span className={styles.kpiLabel}>Total activo mostrado</span>
          </div>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{data.filter((g) => g.estado === 'activo').length}</span>
            <span className={styles.kpiLabel}>Gastos activos mostrados</span>
          </div>
        </div>
      </div>

      <p className={styles.sectionLabel} data-pdf-export-ignore="true">{editandoId ? 'Editar gasto' : 'Registrar gasto operativo'}</p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.concepto.trim() || form.monto <= 0) return
          editandoId ? editar.mutate() : crear.mutate()
        }}
        data-pdf-export-ignore="true"
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="gasto-concepto">Concepto</label>
          <input id="gasto-concepto" className={styles.input} maxLength={200} value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} placeholder="Ej. Hosting ClickHouse Cloud" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="gasto-categoria">Categoría</label>
          <select id="gasto-categoria" className={styles.select} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaGasto })}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="gasto-monto">Monto</label>
          <input id="gasto-monto" type="number" min="0.01" step="0.01" className={styles.input} value={form.monto || ''} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="gasto-fecha">Fecha</label>
          <input id="gasto-fecha" type="date" className={styles.input} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="gasto-desc">Descripción (opcional)</label>
          <input id="gasto-desc" className={styles.input} maxLength={2000} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={crear.isPending || editar.isPending || !form.concepto.trim() || form.monto <= 0}>
          {editandoId ? (editar.isPending ? 'Guardando…' : 'Guardar cambios') : (crear.isPending ? 'Registrando…' : 'Registrar gasto')}
        </button>
        {editandoId && <button type="button" className={styles.btnGhost} onClick={cancelarEdicion}>Cancelar</button>}
      </form>
      {(crear.isError || editar.isError) && <p className={styles.bannerError}>No se pudo guardar el gasto — revisa el monto y el concepto.</p>}

      <div className={styles.form} style={{ marginBottom: 'var(--space-md)' }} data-pdf-export-ignore="true">
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="gasto-filtro-cat">Filtrar por categoría</label>
          <select id="gasto-filtro-cat" className={styles.select} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="gasto-filtro-estado">Estado</label>
          <select id="gasto-filtro-estado" className={styles.select} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="activo">Activo</option>
            <option value="anulado">Anulado</option>
            <option value="">Todos</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="gasto-filtro-desde">Desde</label>
          <input id="gasto-filtro-desde" type="date" className={styles.input} value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="gasto-filtro-hasta">Hasta</label>
          <input id="gasto-filtro-hasta" type="date" className={styles.input} value={hasta} min={desde} max={isoToday()} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Concepto</th><th>Categoría</th><th>Monto</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {gastos.isLoading ? (
              <SkeletonTableRows columns={6} rows={5} />
            ) : data.length === 0 ? (
              <tr><td colSpan={6} className={styles.emptyState}>Sin gastos para este filtro.</td></tr>
            ) : data.map((g) => (
              <tr key={g.gasto_id}>
                <td>{g.concepto}</td>
                <td>{CATEGORIA_LABEL[g.categoria]}</td>
                <td>{fmtMoney(g.monto)}</td>
                <td>{fmtDate(g.fecha)}</td>
                <td>
                  <span className={`${styles.badge} ${g.estado === 'activo' ? styles.badgeOk : styles.badgeNeutral}`}>
                    {g.estado === 'activo' ? 'Activo' : 'Anulado'}
                  </span>
                </td>
                <td>
                  <div className={styles.tableActions}>
                    {g.estado === 'activo' && (
                      <>
                        <button type="button" className={styles.btnGhost} onClick={() => empezarEdicion(g)}>Editar</button>
                        <button type="button" className={styles.btnGhostDanger} disabled={anular.isPending} onClick={() => handleAnular(g)}>Anular</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
