// Metadata de navegación de los 30 informes compuestos (S13-P3b) — SOLO
// datos planos (slug/código/label), sin importar `render` ni las plantillas
// de `shared/components/reportes` (que arrastran Recharts). `SeguridadShell`
// importa ESTE archivo (no `./index`) para poder listar los 30 enlaces en el
// sidebar sin volverse parte del bundle principal — ver docs/BITACORA_S13.md,
// "bug de bundle 1MB" para el porqué exacto de este archivo separado.
//
// Mantener en sync con `codigo`/`labelCorto` de cada `config/<depto>.tsx` —
// son solo 30 entradas cortas, mantener dos listas es más simple y más
// seguro (cero riesgo de import pesado) que derivar esto de los archivos con
// `render`.
export type InformeNav = { informe: string; codigo: string; labelCorto: string }
export type DepartamentoNav = { slug: string; label: string; informes: InformeNav[] }

export const DEPARTAMENTOS_NAV: DepartamentoNav[] = [
  {
    slug: 'comercial', label: 'Comercial', informes: [
      { informe: 'adquisicion', codigo: 'C01', labelCorto: 'Adquisición y CAC' },
      { informe: 'conversion', codigo: 'C02', labelCorto: 'Conversión free→pago' },
      { informe: 'suscripciones', codigo: 'C03', labelCorto: 'Suscriptores por plan' },
    ],
  },
  {
    slug: 'tecnologia', label: 'Tecnología', informes: [
      { informe: 'api-consumo', codigo: 'C04', labelCorto: 'Consumo de API' },
      { informe: 'disponibilidad', codigo: 'C05', labelCorto: 'Disponibilidad' },
      { informe: 'errores', codigo: 'C06', labelCorto: 'Errores del sistema' },
    ],
  },
  {
    slug: 'financiero', label: 'Financiero', informes: [
      { informe: 'mrr-arr', codigo: 'C07', labelCorto: 'MRR / ARR' },
      { informe: 'gastos-vs-ingresos', codigo: 'C08', labelCorto: 'Gastos vs. ingresos' },
      { informe: 'regalias', codigo: 'C09', labelCorto: 'Regalías liquidadas' },
      { informe: 'publicidad', codigo: 'C10', labelCorto: 'Ingresos publicitarios' },
      { informe: 'facturacion', codigo: 'C11', labelCorto: 'Facturación y cobro' },
    ],
  },
  {
    slug: 'datos', label: 'Ingeniería de Datos', informes: [
      { informe: 'pipeline', codigo: 'C12', labelCorto: 'Pipeline de ingesta' },
      { informe: 'calidad', codigo: 'C13', labelCorto: 'Calidad de datos' },
    ],
  },
  {
    slug: 'analitica', label: 'Analítica y BI', informes: [
      { informe: 'panel-ejecutivo', codigo: 'C14', labelCorto: 'Panel ejecutivo' },
      { informe: 'ranking-generos', codigo: 'C15', labelCorto: 'Ranking de géneros' },
      { informe: 'series-temporales', codigo: 'C16', labelCorto: 'Series temporales' },
      { informe: 'proyeccion', codigo: 'C17', labelCorto: 'Proyecciones (4 sem.)' },
      { informe: 'benchmark', codigo: 'C18', labelCorto: 'Benchmark vs. catálogo' },
    ],
  },
  {
    slug: 'contenido', label: 'Contenido y A&R', informes: [
      { informe: 'revision', codigo: 'C19', labelCorto: 'Revisión editorial' },
      { informe: 'licencias', codigo: 'C20', labelCorto: 'Licencias por territorio' },
      { informe: 'cobertura', codigo: 'C21', labelCorto: 'Cobertura por país' },
    ],
  },
  {
    slug: 'comunidad', label: 'Comunidad y Soporte', informes: [
      { informe: 'moderacion', codigo: 'C22', labelCorto: 'Moderación' },
      { informe: 'denuncias', codigo: 'C23', labelCorto: 'Denuncias' },
      { informe: 'soporte', codigo: 'C24', labelCorto: 'Soporte / tickets' },
      { informe: 'interacciones', codigo: 'C25', labelCorto: 'Actividad social' },
    ],
  },
  {
    slug: 'seguridad', label: 'Seguridad', informes: [
      { informe: 'auditoria', codigo: 'C26', labelCorto: 'Auditoría' },
      { informe: 'sanciones', codigo: 'C27', labelCorto: 'Sanciones' },
    ],
  },
  {
    slug: 'producto', label: 'Producto', informes: [
      { informe: 'recomendaciones', codigo: 'C28', labelCorto: 'Recomendaciones' },
      { informe: 'ab-tests', codigo: 'C29', labelCorto: 'Experimentos A/B' },
      { informe: 'notificaciones', codigo: 'C30', labelCorto: 'Notificaciones' },
    ],
  },
]
