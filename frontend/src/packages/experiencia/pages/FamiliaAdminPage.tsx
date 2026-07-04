import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { experienciaApi } from '../api/experiencia.api'
import styles from './ExperienciaPages.module.css'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// RF-EXP-008 (CU-O51/CU-O52/CU-O53): admin designa titular, agrega/quita
// miembros de un plan familiar — solo aplica a suscripciones `premium`
// (design.md de `experiencia`, "elegibilidad de plan"); el backend rechaza
// cualquier otro plan con 403.
export function FamiliaAdminPage() {
  const queryClient = useQueryClient()
  const [titularUsuarioId, setTitularUsuarioId] = useState('')
  const [suscripcionId, setSuscripcionId] = useState('')
  const [miembroUsuarioId, setMiembroUsuarioId] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const plan = useQuery({
    queryKey: ['experiencia', 'familia', suscripcionId],
    queryFn:  () => experienciaApi.verPlanFamiliar(suscripcionId),
    enabled:  suscripcionId.trim().length > 0,
  })

  const crearTitular = useMutation({
    mutationFn: () => experienciaApi.crearTitular(titularUsuarioId),
    onSuccess: (res) => {
      setMsg({ tipo: 'ok', texto: `Titular creado — suscripcion_id: ${res.suscripcion_id}` })
      setSuscripcionId(res.suscripcion_id)
      setTitularUsuarioId('')
    },
    onError: () => setMsg({ tipo: 'error', texto: 'No se pudo crear el titular (¿suscripción premium activa?).' }),
  })

  const agregarMiembro = useMutation({
    mutationFn: () => experienciaApi.agregarMiembro(suscripcionId, miembroUsuarioId),
    onSuccess: () => {
      setMiembroUsuarioId('')
      queryClient.invalidateQueries({ queryKey: ['experiencia', 'familia', suscripcionId] })
    },
    onError: () => setMsg({ tipo: 'error', texto: 'No se pudo agregar el miembro (¿límite alcanzado o ya en otro plan?).' }),
  })

  const quitarMiembro = useMutation({
    mutationFn: (usuarioId: string) => experienciaApi.quitarMiembro(suscripcionId, usuarioId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['experiencia', 'familia', suscripcionId] }),
  })

  const miembros = plan.data?.data ?? []
  const total    = plan.data?.total ?? 0
  const limite   = plan.data?.limite ?? 5

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Plan familiar</h1>
      <span className={styles.subtitle}>// designar titular y gestionar miembros — solo suscripciones premium</span>

      <p className={styles.sectionLabel}>Designar titular</p>
      <form
        className={styles.form}
        onSubmit={(e) => { e.preventDefault(); setMsg(null); if (titularUsuarioId.trim()) crearTitular.mutate() }}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="titular-usuario">usuario_id</label>
          <input
            id="titular-usuario"
            className={styles.input}
            value={titularUsuarioId}
            onChange={(e) => setTitularUsuarioId(e.target.value)}
            placeholder="id de PocketBase del usuario"
          />
        </div>
        <button className={styles.btnPrimary} type="submit" disabled={crearTitular.isPending || !titularUsuarioId.trim()}>
          {crearTitular.isPending ? 'Creando…' : 'Crear titular'}
        </button>
      </form>
      {msg && <div className={msg.tipo === 'error' ? styles.bannerError : styles.bannerOk} role="status">{msg.texto}</div>}

      <p className={styles.sectionLabel}>Ver / gestionar plan por suscripción</p>
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="suscripcion-id">suscripcion_id</label>
          <input
            id="suscripcion-id"
            className={styles.input}
            value={suscripcionId}
            onChange={(e) => setSuscripcionId(e.target.value)}
            placeholder="id de la suscripción (PocketBase)"
          />
        </div>
      </form>

      {suscripcionId.trim() && (
        <>
          <p className={styles.sectionLabel}>Miembros ({total}/{limite})</p>
          <div className={styles.tablePanel}>
            {plan.isError ? (
              <ErrorState message="No se pudo cargar este plan familiar." style={{ margin: 'var(--space-md)' }} />
            ) : plan.isLoading ? (
              <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
            ) : miembros.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyTitle}>Sin plan familiar</span>
                <span className={styles.emptyBody}>Esta suscripción todavía no tiene titular designado.</span>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr><th>usuario_id</th><th>Rol</th><th>Se unió</th><th></th></tr>
                </thead>
                <tbody>
                  {miembros.map((m) => (
                    <tr key={m.usuario_id}>
                      <td>{m.usuario_id}</td>
                      <td>{m.es_titular ? 'Titular' : 'Miembro'}</td>
                      <td>{fmtDate(m.fecha_union)}</td>
                      <td className={styles.tableActions}>
                        {!m.es_titular && (
                          <button
                            className={styles.btnGhostDanger}
                            disabled={quitarMiembro.isPending}
                            onClick={() => quitarMiembro.mutate(m.usuario_id)}
                          >
                            Quitar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {total > 0 && total < limite && (
            <form
              className={styles.form}
              onSubmit={(e) => { e.preventDefault(); if (miembroUsuarioId.trim()) agregarMiembro.mutate() }}
            >
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="miembro-usuario">Agregar miembro — usuario_id</label>
                <input
                  id="miembro-usuario"
                  className={styles.input}
                  value={miembroUsuarioId}
                  onChange={(e) => setMiembroUsuarioId(e.target.value)}
                  placeholder="id de PocketBase del usuario"
                />
              </div>
              <button className={styles.btnPrimary} type="submit" disabled={agregarMiembro.isPending || !miembroUsuarioId.trim()}>
                {agregarMiembro.isPending ? 'Agregando…' : 'Agregar miembro'}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  )
}
