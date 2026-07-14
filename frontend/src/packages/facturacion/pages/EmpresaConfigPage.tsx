import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { facturacionApi } from '../api/facturacion.api'
import type { EmpresaInfo } from '../types'
import styles from './FacturacionPages.module.css'

// CU-O81: antes de esta página, la razón social/RUC/dirección del
// encabezado de cada factura vivían fijas en `InvoiceDetailPage.tsx` — no
// había ninguna forma de corregirlas sin tocar código.
export function EmpresaConfigPage() {
  useDocumentTitle('Información de la empresa')
  const [form, setForm] = useState<EmpresaInfo>({ razon_social: '', ruc: '', direccion: '' })

  const empresa = useQuery({
    queryKey: ['facturacion', 'empresa'],
    queryFn:  () => facturacionApi.empresa(),
  })

  useEffect(() => {
    if (empresa.data) setForm(empresa.data)
  }, [empresa.data])

  const guardar = useMutation({
    mutationFn: () => facturacionApi.actualizarEmpresa(form),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    guardar.mutate()
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Información de la empresa</h1>
      <p className={styles.sectionLabel}>
        Aparece en el encabezado de cada factura emitida.
      </p>

      {empresa.isLoading ? (
        <p className={styles.promptText}>Cargando…</p>
      ) : (
        <form className={styles.searchForm} style={{ flexDirection: 'column', alignItems: 'stretch', maxWidth: 420 }} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="empresa-razon-social">Razón social</label>
            <input
              id="empresa-razon-social"
              className={styles.input}
              type="text"
              value={form.razon_social}
              onChange={(e) => setForm((f) => ({ ...f, razon_social: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="empresa-ruc">RUC</label>
            <input
              id="empresa-ruc"
              className={styles.input}
              type="text"
              value={form.ruc}
              onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="empresa-direccion">Dirección</label>
            <input
              id="empresa-direccion"
              className={styles.input}
              type="text"
              value={form.direccion}
              onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
            />
          </div>
          <button type="submit" className={styles.btnPrimary} disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      )}

      {guardar.isSuccess && <div className={styles.bannerOk}>Información de la empresa actualizada.</div>}
      {guardar.isError && (
        <div className={styles.bannerError}>{apiErrorMessage(guardar.error, 'No se pudo actualizar la información de la empresa.')}</div>
      )}
    </section>
  )
}
