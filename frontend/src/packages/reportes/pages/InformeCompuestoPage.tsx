import { useParams } from 'react-router-dom'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { useCompoundReport } from '@shared/hooks/useCompoundReport'
import { ReportLayout } from '@shared/components/reportes/ReportLayout'
import { EmptyState } from '@shared/components/EmptyState'
import { buscarInforme } from '../config'

// Única página de ruta para los 30 informes compuestos (S13-P3b) — lee
// `:departamento`/`:informe` de la URL, busca su config en el registro y
// delega TODO el contenido a `config.render(datos, resumen)`. Esta página
// nunca conoce las métricas de ningún informe puntual — ver
// docs/BITACORA_S13.md para la razón de la ruta dinámica en vez de 30
// componentes de ruta.
export function InformeCompuestoPage() {
  const { departamento = '', informe = '' } = useParams()
  const config = buscarInforme(departamento, informe)

  const {
    datos, resumen, titulo, objetivo, departamentoLabel, loading, error,
    periodosDisponibles, periodoInicio, periodoFin, onPeriodoChange,
    granularidad, onGranularidadChange, hayEstimados, ultimaActualizacion,
  } = useCompoundReport(departamento, informe)

  useDocumentTitle(config ? `Informe ${config.codigo} — ${config.labelCorto}` : 'Informe compuesto')

  if (!config) {
    return (
      <EmptyState
        icon="( ∅ )"
        title="Informe no encontrado"
        body={`No existe un informe configurado para "${departamento}/${informe}".`}
      />
    )
  }

  return (
    <ReportLayout
      titulo={titulo || config.labelCorto}
      departamento={departamentoLabel || departamento}
      codigoInforme={config.codigo}
      codigoObjetivo={objetivo}
      periodosDisponibles={periodosDisponibles}
      periodoInicio={periodoInicio}
      periodoFin={periodoFin}
      onPeriodoChange={onPeriodoChange}
      granularidad={granularidad}
      onGranularidadChange={onGranularidadChange}
      loading={loading}
      error={error}
      sinDatos={!loading && !error && datos.length === 0}
      hayEstimados={hayEstimados}
      ultimaActualizacion={ultimaActualizacion}
    >
      {config.render(datos, resumen)}
    </ReportLayout>
  )
}
