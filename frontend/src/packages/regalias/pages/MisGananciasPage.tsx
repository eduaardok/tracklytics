import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { useCountUp } from '@shared/hooks/useCountUp'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { regaliasApi } from '../api/regalias.api'
import { distribucionApi } from '@packages/distribucion'
import { ArtistaHubTabs } from '@packages/creadores'
import { SkeletonCard, SkeletonTableRows } from '@shared/components/SkeletonLoader'
import type { Ganancia, Retiro } from '../types'
import styles from './RegaliasPages.module.css'

function fmtMoney(v: number, moneda = 'USD') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(v)
}

const ESTADO_LABEL: Record<Retiro['estado'], string> = {
  pendiente: 'Pendiente', procesado: 'Procesado', rechazado: 'Rechazado',
}

// Transición transversal (S16-P9): el total acumulado cuenta de 0 al valor
// real al montar/refrescar la query — mismo hook que los KPIs del panel de
// analítica del artista.
function TotalAcumulado({ valor }: { valor: number }) {
  const animado = useCountUp(valor)
  return <div className={styles.totalValue}>{fmtMoney(animado)}</div>
}

// Widget de retiro (CU-O75, modelo-financiero-simulacion) — reusado tanto
// para la pestaña de artista como la de sello, solo cambia qué query/mutation
// de `regaliasApi` recibe.
function RetiroWidget({
  tipo, saldoQueryKey, fetchSaldo, solicitarRetiro,
}: {
  tipo: 'artista' | 'sello'
  saldoQueryKey: string[]
  fetchSaldo: () => ReturnType<typeof regaliasApi.saldoArtista>
  solicitarRetiro: (monto: number) => ReturnType<typeof regaliasApi.solicitarRetiroArtista>
}) {
  const [monto, setMonto] = useState('')
  const queryClient = useQueryClient()
  const toast = useToast()

  const saldo = useQuery({ queryKey: saldoQueryKey, queryFn: fetchSaldo })

  const solicitar = useMutation({
    mutationFn: () => solicitarRetiro(Number(monto)),
    onSuccess: () => {
      setMonto('')
      queryClient.invalidateQueries({ queryKey: saldoQueryKey })
      toast.success('Retiro solicitado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo solicitar el retiro.')),
  })

  const disponible = saldo.data?.saldo_disponible ?? 0
  const retiros = saldo.data?.retiros ?? []
  // Transición transversal (S16-P9): el saldo cuenta de 0 al valor real
  // (useCountUp ignora undefined mientras carga).
  const disponibleAnimado = useCountUp(disponible)

  return (
    <div className={styles.totalCard}>
      <div className={styles.totalLabel}>Saldo disponible para retiro</div>
      <div className={styles.totalValue}>{saldo.isLoading ? '…' : fmtMoney(disponibleAnimado)}</div>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          if (Number(monto) > 0) solicitar.mutate()
        }}
      >
        <input
          className={styles.input}
          type="number"
          step="0.01"
          min="0.01"
          max={disponible}
          placeholder="Monto a retirar"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={solicitar.isPending || !monto || Number(monto) <= 0 || Number(monto) > disponible}
        >
          {solicitar.isPending ? 'Solicitando…' : 'Solicitar retiro'}
        </button>
      </form>
      {retiros.length > 0 && (
        <table className={styles.table} style={{ marginTop: 'var(--space-md)' }}>
          <thead><tr><th>Fecha</th><th>Monto</th><th>Estado</th></tr></thead>
          <tbody>
            {retiros.map((r) => (
              <tr key={r.retiro_id}>
                <td>{r.fecha_solicitud}</td>
                <td>{fmtMoney(r.monto)}</td>
                <td>{ESTADO_LABEL[r.estado]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// P12 residual (S17): descarga el CSV que ya generaba el backend a partir de
// las mismas filas que esta tabla muestra — el endpoint es autenticado por
// header, así que un <a href> directo no serviría (mismo patrón que la
// exportación GDPR de ProfilePage).
async function descargarCsv(
  fetchCsv: () => Promise<Blob>,
  filename: string,
  toast: ReturnType<typeof useToast>,
  setExportando: (v: boolean) => void,
) {
  setExportando(true)
  try {
    const blob = await fetchCsv()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Descarga lista')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'No se pudo exportar el CSV.'))
  } finally {
    setExportando(false)
  }
}

function TablaGanancias({
  data, onExportar, exportando,
}: {
  data: Ganancia[]
  onExportar: () => void
  exportando: boolean
}) {
  if (data.length === 0) {
    return (
      <div className={styles.tablePanel}>
        <div className={styles.emptyState}>
          Sin liquidaciones todavía — aparecerán aquí cuando se calcule el período con tus streams reales.
        </div>
      </div>
    )
  }
  // Solo la vista de artista trae el % de su propio contrato (GANANCIAS_ARTISTA
  // en el backend) — la de sello reusa este mismo componente sin esos campos,
  // así que la columna se agrega/oculta según lo que realmente llegó.
  const conPorcentaje = data[0]?.pct_master_artista !== undefined
  return (
    <div className={styles.tablePanel}>
      <div className={styles.tablePanelHeader}>
        <button type="button" className={styles.btnGhost} onClick={onExportar} disabled={exportando}>
          {exportando ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Track</th><th>Período</th><th>Streams</th>
            {conPorcentaje && <th>% contrato</th>}
            <th>Bruto</th><th>Retención</th><th>Neto</th>
          </tr>
        </thead>
        <tbody>
          {data.map((g) => (
            <tr key={g.liquidacion_id}>
              <td>{g.track_name}</td>
              <td>{g.periodo_inicio} — {g.periodo_fin}</td>
              <td>{g.streams_periodo}</td>
              {conPorcentaje && (
                <td title="Porcentaje de tu contrato sobre masters / publishing para este track">
                  {g.pct_master_artista}% master · {g.pct_publishing_artista}% publishing
                </td>
              )}
              <td>{fmtMoney(g.monto_bruto, g.moneda)}</td>
              <td>{g.retencion_pct}% ({fmtMoney(g.monto_retenido, g.moneda)})</td>
              <td><strong>{fmtMoney(g.monto, g.moneda)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Self-edit de sello (S17, brecha operativa P1): permite al sello editar su
// nombre y país sin pasar por admin. Card colapsable, solo lectura por defecto.
function SelloPerfilCard({ selloId }: { selloId?: number }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [pais, setPais] = useState('')
  const toast = useToast()
  const queryClient = useQueryClient()

  const perfil = useQuery<{ sello_id: number; nombre: string; pais: string }>({
    queryKey: ['distribucion', 'mi-perfil-sello'],
    queryFn: () => distribucionApi.miPerfilSello(),
    enabled: !!selloId,
  })

  useEffect(() => {
    if (perfil.data) { setNombre(perfil.data.nombre); setPais(perfil.data.pais) }
  }, [perfil.data])

  const guardar = useMutation({
    mutationFn: () => distribucionApi.editarMiPerfil({ nombre, pais }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'mi-perfil-sello'] })
      queryClient.invalidateQueries({ queryKey: ['regalias', 'mi-cuenta-sello'] })
      setEditando(false)
      toast.success('Perfil del sello actualizado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar.')),
  })

  if (!selloId || perfil.isLoading) return null

  return (
    <div className={styles.totalCard}>
      <div className={styles.sectionLabel}>Mi perfil de sello</div>
      {editando ? (
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sello-nombre">Nombre</label>
            <input
              id="sello-nombre"
              className={styles.input}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={150}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sello-pais">País</label>
            <input
              id="sello-pais"
              className={styles.input}
              value={pais}
              onChange={(e) => setPais(e.target.value)}
              maxLength={100}
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={guardar.isPending || !nombre.trim()}
              onClick={() => guardar.mutate()}
            >
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className={styles.btnPrimary} onClick={() => { setEditando(false); setNombre(perfil.data?.nombre ?? ''); setPais(perfil.data?.pais ?? '') }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{perfil.data?.nombre}</div>
            {perfil.data?.pais && <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{perfil.data.pais}</div>}
          </div>
          <button type="button" className={styles.btnPrimary} onClick={() => setEditando(true)}>
            Editar
          </button>
        </div>
      )}
    </div>
  )
}

// CU-O64/CU-O65: un usuario puede tener cuenta de artista Y cuenta de sello
// al mismo tiempo (nada en el modelo lo impide) — las dos consultas corren
// siempre en paralelo, sin depender una de la otra, y se muestran ambas
// pestañas cuando ambas existen (antes la de sello solo se pedía si la de
// artista fallaba, así que un usuario con ambas cuentas nunca veía la de
// sello — bug encontrado en verificación visual, S10 día 5).
export function MisGananciasPage() {
  useDocumentTitle('Mis ganancias')
  const [tab, setTab] = useState<'artista' | 'sello'>('artista')
  const [exportando, setExportando] = useState(false)
  const toast = useToast()

  const artista = useQuery({
    queryKey: ['regalias', 'mis-ganancias-artista'],
    queryFn:  () => regaliasApi.misGananciasArtista(),
    retry: false,
  })
  const sello = useQuery({
    queryKey: ['regalias', 'mis-ganancias-sello'],
    queryFn:  () => regaliasApi.misGananciasSello(),
    retry: false,
  })
  const cuentaSello = useQuery({
    queryKey: ['regalias', 'mi-cuenta-sello'],
    queryFn:  () => regaliasApi.miCuentaSello(),
    retry: false,
    enabled: sello.isSuccess,
  })

  if (artista.isLoading || sello.isLoading) {
    // Esqueleto que anticipa el layout final (título + card de total + widget
    // de retiro + tabla) en vez del "Cargando…" plano que había antes.
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Mis ganancias</h1>
        <SkeletonCard height={96} />
        <SkeletonCard height={72} />
        <div className={styles.tablePanel}>
          <table className={styles.table}>
            <tbody>
              <SkeletonTableRows columns={6} rows={5} />
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  const tieneArtista = artista.isSuccess
  const tieneSello   = sello.isSuccess

  if (!tieneArtista && !tieneSello) {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Mis ganancias</h1>
        <div className={styles.tablePanel}>
          <div className={styles.emptyState}>
            No tienes una cuenta de artista aprobada ni una cuenta de sello — esta sección es solo para rightsholders.
          </div>
        </div>
      </section>
    )
  }

  const vistaActiva = tieneArtista && tieneSello ? tab : (tieneArtista ? 'artista' : 'sello')
  const nombreSello = cuentaSello.data?.nombre_sello

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Mis ganancias</h1>

      {/* F2 (hub de artista): puente de vuelta a /creadores — el dinero del
          artista ya no es una isla. Solo aplica a quien tiene cuenta de
          artista; un rightsholder solo-sello no tiene hub. */}
      {tieneArtista && <ArtistaHubTabs activa="ganancias" />}

      {tieneArtista && tieneSello && (
        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'artista' ? styles.tabActive : ''}`}
            onClick={() => setTab('artista')}
          >
            Como artista
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'sello' ? styles.tabActive : ''}`}
            onClick={() => setTab('sello')}
          >
            Como sello{nombreSello ? ` · ${nombreSello}` : ''}
          </button>
        </div>
      )}

      {vistaActiva === 'artista' ? (
        <>
          <span className={styles.subtitle}>Regalías liquidadas por tus streams reales, como artista</span>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>Total acumulado</div>
            <TotalAcumulado valor={artista.data!.total} />
          </div>
          <RetiroWidget
            tipo="artista"
            saldoQueryKey={['regalias', 'saldo-artista']}
            fetchSaldo={regaliasApi.saldoArtista}
            solicitarRetiro={regaliasApi.solicitarRetiroArtista}
          />
          <TablaGanancias
            data={artista.data!.data}
            exportando={exportando}
            onExportar={() => descargarCsv(regaliasApi.exportarMisGananciasArtista, 'mis-ganancias-artista.csv', toast, setExportando)}
          />
        </>
      ) : (
        <>
          <span className={styles.subtitle}>
            Regalías liquidadas por los streams reales de todos los artistas firmados a{nombreSello ? ` ${nombreSello}` : ' tu sello'}
          </span>
          <SelloPerfilCard selloId={cuentaSello.data?.sello_id} />
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>Total acumulado</div>
            <TotalAcumulado valor={sello.data!.total} />
          </div>
          <RetiroWidget
            tipo="sello"
            saldoQueryKey={['regalias', 'saldo-sello']}
            fetchSaldo={regaliasApi.saldoSello}
            solicitarRetiro={regaliasApi.solicitarRetiroSello}
          />
          <TablaGanancias
            data={sello.data!.data}
            exportando={exportando}
            onExportar={() => descargarCsv(regaliasApi.exportarMisGananciasSello, 'mis-ganancias-sello.csv', toast, setExportando)}
          />
        </>
      )}
    </section>
  )
}
