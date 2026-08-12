import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { suscripcionesApi } from '@packages/suscripciones'
import { distribucionApi } from '../api/distribucion.api'
import type { PaisConfigBody } from '../types'
import styles from '../pages/DistribucionPages.module.css'

const PAIS_FORM_VACIO: PaisConfigBody = {
  nombre: '', codigo_iso: '', moneda_codigo: 'USD', tasa_cambio_a_usd: 1.0,
  iva_tasa: null, retencion_fiscal_pct: null,
}

// Configuración global de negocio (modelo-financiero-completar-huecos):
// países (moneda/tasa de cambio/IVA/retención fiscal, CU-O97) y precios de
// plan (CU-O98) — se combinan en una sola pestaña porque ambos son
// "configuración administrable sin tocar código", mismo criterio de negocio,
// no porque compartan modelo de datos (design.md, decisión 4/5: precio de
// plan y nivel de acceso por tier siguen siendo conceptos separados).
export function ConfiguracionGlobalTab() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [form, setForm] = useState<PaisConfigBody>(PAIS_FORM_VACIO)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<PaisConfigBody>(PAIS_FORM_VACIO)

  const paises = useQuery({
    queryKey: ['distribucion', 'paises-config'],
    queryFn:  () => distribucionApi.paisesConfig(),
  })

  const crearPais = useMutation({
    mutationFn: () => distribucionApi.crearPais(form),
    onSuccess: () => {
      setForm(PAIS_FORM_VACIO)
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'paises-config'] })
      toast.success('País creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el país.')),
  })

  const editarPais = useMutation({
    mutationFn: (id: number) => distribucionApi.editarPais(id, editForm),
    onSuccess: () => {
      setEditId(null)
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'paises-config'] })
      toast.success('País actualizado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar el país.')),
  })

  const toggleActivo = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      activo ? distribucionApi.desactivarPais(id) : distribucionApi.activarPais(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['distribucion', 'paises-config'] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar el estado del país.')),
  })

  const precios = useQuery({
    queryKey: ['suscripciones', 'admin-planes'],
    queryFn:  () => suscripcionesApi.preciosAdmin(),
  })

  const [precioEdit, setPrecioEdit] = useState<Record<string, string>>({})

  const actualizarPrecio = useMutation({
    mutationFn: ({ planId, precio }: { planId: string; precio: number }) =>
      suscripcionesApi.actualizarPrecioPlan(planId, precio),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['suscripciones', 'admin-planes'] })
      setPrecioEdit((p) => { const { [vars.planId]: _omit, ...resto } = p; return resto })
      toast.success('Precio actualizado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar el precio.')),
  })

  const paisesData = paises.data?.data ?? []
  const preciosData = precios.data?.data ?? []

  return (
    <div>
      <p className={styles.sectionLabel}>Precios de plan</p>
      <p className={styles.emptyBody} style={{ marginBottom: 'var(--space-sm)' }}>
        Cambia cuánto cuesta un plan — no afecta qué paneles desbloquea cada tier B2B (eso sigue
        fijo en el sistema de acceso).
      </p>
      <div className={styles.tablePanel}>
        {precios.isError ? (
          <ErrorState message="No se pudieron cargar los precios de plan." />
        ) : precios.isLoading ? (
          <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
        ) : preciosData.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin planes</span>
            <span className={styles.emptyBody}>No hay planes configurados todavía.</span>
          </div>
        ) : (
          <table className={styles.table}>
            <thead><tr><th>Plan</th><th>Tipo</th><th>Precio (USD)</th><th></th></tr></thead>
            <tbody>
              {preciosData.map((p) => (
                <tr key={p.plan_id}>
                  <td>{p.nombre}</td>
                  <td>{p.tipo_actor}</td>
                  <td>
                    <input
                      className={styles.input}
                      type="number"
                      step="0.01"
                      min="0"
                      style={{ maxWidth: 120 }}
                      value={precioEdit[p.plan_id] ?? String(p.precio_usd)}
                      onChange={(e) => setPrecioEdit((prev) => ({ ...prev, [p.plan_id]: e.target.value }))}
                    />
                  </td>
                  <td className={styles.tableActions}>
                    <button
                      className={styles.btnGhost}
                      disabled={actualizarPrecio.isPending}
                      onClick={() => actualizarPrecio.mutate({ planId: p.plan_id, precio: Number(precioEdit[p.plan_id] ?? p.precio_usd) })}
                    >
                      Guardar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>
        Nuevo país (moneda, tasa de cambio, IVA, retención fiscal)
      </p>
      <form
        className={styles.form}
        onSubmit={(e) => { e.preventDefault(); if (form.nombre.trim() && form.codigo_iso.trim()) crearPais.mutate() }}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="pais-nombre">Nombre</label>
          <input id="pais-nombre" className={styles.input} value={form.nombre} maxLength={100}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Uruguay" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="pais-iso">Código ISO</label>
          <input id="pais-iso" className={styles.input} maxLength={2} value={form.codigo_iso}
            onChange={(e) => setForm((f) => ({ ...f, codigo_iso: e.target.value.toUpperCase() }))} placeholder="UY" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="pais-moneda">Moneda (ISO 4217)</label>
          <input id="pais-moneda" className={styles.input} maxLength={3} value={form.moneda_codigo}
            onChange={(e) => setForm((f) => ({ ...f, moneda_codigo: e.target.value.toUpperCase() }))} placeholder="UYU" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="pais-tasa">Tasa de cambio a USD (referencial)</label>
          <input id="pais-tasa" className={styles.input} type="number" step="0.0001" min="0.0001" value={form.tasa_cambio_a_usd}
            onChange={(e) => setForm((f) => ({ ...f, tasa_cambio_a_usd: Number(e.target.value) }))} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="pais-iva">IVA propio (%) — vacío = usa el global</label>
          <input id="pais-iva" className={styles.input} type="number" step="0.1" min="0" max="100"
            value={form.iva_tasa ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, iva_tasa: e.target.value === '' ? null : Number(e.target.value) }))} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="pais-retencion">Retención fiscal propia (%) — vacío = usa la global</label>
          <input id="pais-retencion" className={styles.input} type="number" step="0.1" min="0" max="100"
            value={form.retencion_fiscal_pct ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, retencion_fiscal_pct: e.target.value === '' ? null : Number(e.target.value) }))} />
        </div>
        <button className={styles.btnPrimary} type="submit" disabled={crearPais.isPending || !form.nombre.trim() || !form.codigo_iso.trim()}>
          {crearPais.isPending ? 'Creando…' : 'Crear país'}
        </button>
      </form>

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>
        Países configurados ({paisesData.length})
      </p>
      <div className={styles.tablePanel}>
        {paises.isError ? (
          <ErrorState message="No se pudieron cargar los países." />
        ) : paises.isLoading ? (
          <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
        ) : paisesData.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin países</span>
            <span className={styles.emptyBody}>Todavía no hay países configurados.</span>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Nombre</th><th>ISO</th><th>Moneda</th><th>Tasa/USD</th><th>IVA</th><th>Retención</th><th>Activo</th><th></th></tr>
            </thead>
            <tbody>
              {paisesData.map((p) => {
                const editando = editId === p.pais_id
                return (
                  <tr key={p.pais_id} style={{ opacity: p.activo ? 1 : 0.5 }}>
                    {editando ? (
                      <>
                        <td><input className={styles.input} value={editForm.nombre} maxLength={100} onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))} /></td>
                        <td><input className={styles.input} value={editForm.codigo_iso} maxLength={2} onChange={(e) => setEditForm((f) => ({ ...f, codigo_iso: e.target.value.toUpperCase() }))} /></td>
                        <td><input className={styles.input} value={editForm.moneda_codigo} maxLength={3} onChange={(e) => setEditForm((f) => ({ ...f, moneda_codigo: e.target.value.toUpperCase() }))} /></td>
                        <td><input className={styles.input} type="number" step="0.0001" min="0.0001" value={editForm.tasa_cambio_a_usd} onChange={(e) => setEditForm((f) => ({ ...f, tasa_cambio_a_usd: Number(e.target.value) }))} /></td>
                        <td><input className={styles.input} type="number" step="0.1" min="0" max="100" value={editForm.iva_tasa ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, iva_tasa: e.target.value === '' ? null : Number(e.target.value) }))} /></td>
                        <td><input className={styles.input} type="number" step="0.1" min="0" max="100" value={editForm.retencion_fiscal_pct ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, retencion_fiscal_pct: e.target.value === '' ? null : Number(e.target.value) }))} /></td>
                        <td>{p.activo ? 'Sí' : 'No'}</td>
                        <td className={styles.tableActions}>
                          <button className={styles.btnGhost} disabled={editarPais.isPending} onClick={() => editarPais.mutate(p.pais_id)}>Guardar</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{p.nombre}</td>
                        <td>{p.codigo_iso}</td>
                        <td>{p.moneda_codigo}</td>
                        <td>{p.tasa_cambio_a_usd}</td>
                        <td>{p.iva_tasa ?? '— (global)'}</td>
                        <td>{p.retencion_fiscal_pct ?? '— (global)'}</td>
                        <td>{p.activo ? 'Sí' : 'No'}</td>
                        <td className={styles.tableActions}>
                          <button
                            className={styles.btnGhost}
                            onClick={() => {
                              setEditId(p.pais_id)
                              setEditForm({
                                nombre: p.nombre, codigo_iso: p.codigo_iso, moneda_codigo: p.moneda_codigo,
                                tasa_cambio_a_usd: p.tasa_cambio_a_usd, iva_tasa: p.iva_tasa, retencion_fiscal_pct: p.retencion_fiscal_pct,
                              })
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className={styles.btnGhost}
                            disabled={toggleActivo.isPending}
                            onClick={() => toggleActivo.mutate({ id: p.pais_id, activo: !!p.activo })}
                          >
                            {p.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
