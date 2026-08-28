import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FlaskConical,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  GitBranch,
  CheckCircle2,
  BookOpen,
} from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { InfoHint } from '@shared/components/InfoHint'
import styles from './DocumentacionAcademicaPage.module.css'

// Glosario para el visitante no técnico de la sustentación (mismo patrón
// ⓘ que ya usa `AudioFeaturesPanel`/`TrackDetailPage` para Score/Tempo/
// Loudness) — un hint por término, en su primera aparición real en el
// texto, no repetido en cada mención posterior.
const GLOSARIO = {
  b2b2c: 'Modelo con dos capas: B2C, que vende directo al usuario final, y B2B, que vende a otra empresa — la capa B2C sostiene con su comportamiento el análisis que se vende a la capa B2B.',
  b2c: 'Business to Consumer: el producto se ofrece directamente al usuario final (el oyente), no a otra empresa.',
  b2b: 'Business to Business: el cliente es otra empresa (sello, productora, agencia, partner), no el consumidor final.',
  staging: 'Capa intermedia y transitoria de datos: prepara y valida la información antes de cargarla al destino final, y se descarta después de cada carga exitosa.',
  bsc: 'Balanced Scorecard: marco de gestión estratégica que resume el desempeño del negocio en KPIs agrupados por 4 perspectivas — Financiera, Cliente, Procesos Internos, y Aprendizaje y Crecimiento.',
  medallion: 'Arquitectura de capas ("medallion"): Bronze son los datos crudos tal como llegan, Silver son datos limpios y validados, Gold son datos ya agregados y listos para consumo analítico.',
  arr: 'Annual Recurring Revenue: ingreso recurrente anualizado que aportan las suscripciones activas.',
  cac: 'Customer Acquisition Cost: costo promedio de adquirir un nuevo usuario o cliente (gasto de marketing/ventas ÷ nuevos clientes obtenidos).',
  gherkin: 'Lenguaje estándar para escribir requisitos: SHALL indica una obligación del sistema; un Scenario en formato WHEN/THEN describe una condición y el resultado esperado.',
} as const

// Página de documentación académica — SOLO para la sustentación del curso,
// no es una feature de producto (ver banner de disclaimer abajo). Todo el
// contenido es estático y viene de constantes verificadas contra el código
// real en la fase de pre-inspección (no se hace fetch a la API): conteo de
// paquetes/endpoints (`api/paquetes/`), tablas de catálogo/Gold
// (`init_clickhouse.py`/`create_gold_tables.py`), changes de OpenSpec
// archivados y los 13 KPIs reales de `bsc_resumen()`
// (`api/paquetes/analitica/bsc.py`). A diferencia del resto de la app, acá
// SÍ está permitido detallar el mecanismo de datos sintéticos — excepción
// deliberada y acotada solo a esta ruta (ver `docs/NOTA_METODOLOGICA.md`).

const PAQUETES = [
  { nombre: 'seguridad', endpoints: 36 },
  { nombre: 'reportes', endpoints: 31 },
  { nombre: 'distribucion', endpoints: 30 },
  { nombre: 'regalias', endpoints: 24 },
  { nombre: 'social', endpoints: 24 },
  { nombre: 'experiencia', endpoints: 22 },
  { nombre: 'biblioteca', endpoints: 21 },
  { nombre: 'catalogo', endpoints: 21 },
  { nombre: 'suscripciones', endpoints: 16 },
  { nombre: 'publicidad', endpoints: 15 },
  { nombre: 'finanzas', endpoints: 14 },
  { nombre: 'gestion_datos', endpoints: 13 },
  { nombre: 'creadores', endpoints: 12 },
  { nombre: 'facturacion', endpoints: 12 },
  { nombre: 'partners', endpoints: 9 },
  { nombre: 'analitica', endpoints: 6 },
  { nombre: 'simulacion', endpoints: 1 },
] as const

const TOTAL_ENDPOINTS = PAQUETES.reduce((acc, p) => acc + p.endpoints, 0) // 307
const TOTAL_PAQUETES = PAQUETES.length // 17

const TABLAS_CATALOGO = { total: 79, dim: 34, fact: 30, bridge: 7, stg: 2, otros: 6 }
const TABLAS_GOLD = 14

const OPENSPEC_CHANGES = { total: 47, primero: '2026-06-21', ultimo: '2026-08-26' }

// Pirámide de objetivos de negocio — `docs/OBJETIVOS_TRACKLYTICS.md` (S13-P1,
// auditoría real del código: 4 OE, 35 OT en 9 departamentos, 65 OO sobre 14
// paquetes + 4 OO de `finanzas` documentados aparte por nota — 69 en total
// sobre 15 de los 17 paquetes reales). No se reproduce aquí la matriz de
// trazabilidad completa de ese documento (fecha 2026-07-29): su columna de
// estado "Implementado/Parcial/Pendiente" ya quedó desactualizada por
// trabajo posterior (ej. OT-30 se cerró en S13-P2) y no vale la pena
// arriesgar una afirmación stale en una página que se muestra en vivo.
const DEPARTAMENTOS = [
  { nombre: 'Comercial y Marketing', rol: 'Director Comercial Internacional', ot: 3 },
  { nombre: 'Tecnología', rol: 'CTO', ot: 3 },
  { nombre: 'Financiero', rol: 'CFO', ot: 5 },
  { nombre: 'Ingeniería de Datos', rol: 'Ingeniero Jefe de Datos', ot: 3 },
  { nombre: 'Analítica y BI', rol: 'Analista de Datos / Líder BI', ot: 5 },
  { nombre: 'Contenido y A&R', rol: 'Gerente de Contenido y A&R', ot: 4 },
  { nombre: 'Comunidad y Soporte', rol: 'Community Manager', ot: 4 },
  { nombre: 'Seguridad y Administración TI', rol: 'Gerente de Seguridad', ot: 4 },
  { nombre: 'Producto', rol: 'Gerente de Producto', ot: 4 },
] as const

const BSC_PERSPECTIVAS = [
  {
    nombre: 'Financiera',
    kpis: ['% ARR por integraciones de API', 'Tasa de conversión premium', 'Ingreso publicitario mensual'],
  },
  {
    nombre: 'Cliente',
    kpis: ['CAC por región', 'Crecimiento de usuarios registrados', 'Retención de creadores activos'],
  },
  {
    nombre: 'Procesos Internos',
    kpis: ['Uptime del sistema', 'Tasa de rechazo de ingesta', 'Regalías liquidadas a tiempo'],
  },
  {
    nombre: 'Aprendizaje y Crecimiento',
    kpis: [
      'Respuesta a decisiones estratégicas (sin tabla Gold posible)',
      'Retención B2B',
      'Conversión de recomendaciones',
      'A/B tests concluidos',
    ],
  },
] as const

const DIAGRAMAS = [
  { archivo: 'd_componentes.png', titulo: 'Diagrama de componentes', actualizado: '27 ago 2026' },
  { archivo: 'd_despliegue.png', titulo: 'Diagrama de despliegue', actualizado: '27 ago 2026' },
  { archivo: 'd_casos_de_uso.png', titulo: 'Diagrama de casos de uso', actualizado: '27 ago 2026' },
  { archivo: 'd_base_de_datos.png', titulo: 'Diagrama de base de datos', actualizado: '27 ago 2026' },
] as const

// Los 4 diagramas viven en `DIAGRAMAS` como única fuente de la fecha —
// las figuras de abajo siempre leen `actualizado` de aquí (nunca un string
// literal aparte) para que actualizar este arreglo baste para refrescar
// los 4 rótulos.
function diagrama(archivo: (typeof DIAGRAMAS)[number]['archivo']) {
  return DIAGRAMAS.find((d) => d.archivo === archivo)!
}

// Un ejemplo real por paquete de cómo se documenta un caso de uso en
// OpenSpec (formato `Tabla de trazabilidad` + `Requirement`/`Scenario`,
// SHALL/WHEN/THEN) — texto tomado literal de `openspec/specs/<paquete>/
// spec.md` (fuente de verdad sincronizada, no de un change archivado
// puntual). `biblioteca` y `gestion_datos` no tienen spec propio: sus casos
// de uso viven documentados dentro de `catalogo/spec.md` e `ingesta/spec.md`
// respectivamente (mismo dominio, nombre de capability distinto al del
// paquete de backend) — la `fuente` de cada uno lo deja explícito.
type CasoUso = {
  paquete: string
  cu?: string
  cuTitulo: string
  historia: string
  requirementTitulo: string
  requirementTexto: string
  escenarioTitulo: string
  when: string
  then: string
  fuente: string
}

const CASOS_DE_USO: CasoUso[] = [
  {
    paquete: 'catalogo',
    cu: 'CU-O02',
    cuTitulo: 'Buscar y explorar catálogo musical',
    historia: 'Como Usuario B2C, quiero buscar tracks por nombre, artista o género, para descubrir música de mi interés.',
    requirementTitulo: 'Búsqueda de catálogo musical',
    requirementTexto: 'El sistema SHALL permitir buscar tracks por nombre, artista o género contra FACT_TRACKS en ClickHouse, con resultados paginados, y SHALL responder en menos de 1 segundo bajo condiciones normales de carga (~700k registros en FACT_TRACKS).',
    escenarioTitulo: 'Búsqueda por nombre, artista o género',
    when: 'un usuario autenticado o Cliente B2B ingresa un término de búsqueda válido (nombre, artista o género)',
    then: 'el sistema retorna una lista paginada de tracks coincidentes en menos de 1 segundo',
    fuente: 'openspec/specs/catalogo/spec.md',
  },
  {
    paquete: 'biblioteca',
    cu: 'CU-O04',
    cuTitulo: 'Gestionar favoritos y playlists',
    historia: 'Como Usuario B2C, quiero guardar tracks en favoritos y organizarlos en playlists, para acceder rápido a mi música preferida.',
    requirementTitulo: 'Gestión de favoritos',
    requirementTexto: 'El sistema SHALL permitir agregar o quitar un track de favoritos para el usuario autenticado, reflejando el cambio de forma inmediata en la interfaz (optimistic UI) mientras el backend registra el evento de forma síncrona en ClickHouse (FACT_ENGAGEMENT_USUARIO). Un usuario solo puede ver sus propios favoritos.',
    escenarioTitulo: 'Agregar track a favoritos',
    when: 'el usuario está autenticado y el track existe en FACT_TRACKS, y el usuario marca el track como favorito',
    then: 'el sistema registra el evento en ClickHouse (FACT_ENGAGEMENT_USUARIO) asociado al usuario y lo refleja inmediatamente en la interfaz',
    fuente: 'openspec/specs/catalogo/spec.md (capability catalogo, cubre también biblioteca)',
  },
  {
    paquete: 'analitica',
    cu: 'CU-O07',
    cuTitulo: 'Consultar dashboard ejecutivo de KPIs del catálogo',
    historia: 'Como Cliente B2B, quiero ver un dashboard con los KPIs principales del catálogo, para evaluar tendencias del mercado de un vistazo.',
    requirementTitulo: 'Dashboard ejecutivo de KPIs',
    requirementTexto: 'El sistema SHALL mostrar en una sola pantalla el total de tracks, artistas y géneros, y los promedios de popularidad, energy y danceability del catálogo.',
    escenarioTitulo: 'Mostrar KPIs agregados del catálogo',
    when: 'un Cliente B2B o Data Analyst/BI Lead con acceso autorizado abre el dashboard ejecutivo',
    then: 'el sistema muestra en una sola pantalla el total de tracks, total de artistas, total de géneros, popularidad promedio, energy promedio y danceability promedio, en menos de 3 segundos',
    fuente: 'openspec/specs/analitica/spec.md',
  },
  {
    paquete: 'creadores',
    cu: 'CU-O24',
    cuTitulo: 'Solicitar una cuenta de artista',
    historia: 'Como Usuario B2C, quiero solicitar una cuenta de artista con mi nombre artístico, para poder publicar mi música en la plataforma.',
    requirementTitulo: 'Solicitud de cuenta de artista',
    requirementTexto: 'El sistema SHALL permitir a un usuario autenticado solicitar una cuenta de artista indicando un nombre artístico, quedando en estado pendiente hasta que admin la resuelva. Un usuario SHALL tener como máximo una cuenta de artista.',
    escenarioTitulo: 'Solicitud exitosa de cuenta de artista',
    when: 'un usuario autenticado sin cuenta de artista previa envía un nombre artístico válido',
    then: 'el sistema crea su cuenta de artista en estado pendiente, asociada a ese usuario',
    fuente: 'openspec/specs/creadores/spec.md',
  },
  {
    paquete: 'distribucion',
    cu: 'CU-O38',
    cuTitulo: 'Administrar licencias de distribución por país',
    historia: 'Como Lead Data Engineer/CTO, quiero registrar la licencia de un sello para distribuir en un país durante un período determinado, para reflejar los acuerdos comerciales reales.',
    requirementTitulo: 'Administración de licencias de distribución',
    requirementTexto: 'El sistema SHALL permitir a un usuario con rol admin crear una licencia de distribución para un sello discográfico en un país, con fecha de inicio, fecha de fin opcional y estado. Esta operación SHALL estar restringida exclusivamente a usuarios con rol admin y SHALL registrarse en FACT_AUDIT_LOG.',
    escenarioTitulo: 'Admin crea una licencia con vigencia definida',
    when: 'un usuario con rol admin crea una licencia indicando sello, país, fecha de inicio y fecha de fin',
    then: 'el sistema registra la licencia como activa para todo el catálogo de ese sello en ese país, y registra la acción en FACT_AUDIT_LOG',
    fuente: 'openspec/specs/distribucion/spec.md',
  },
  {
    paquete: 'experiencia',
    cu: 'CU-O45',
    cuTitulo: 'Crear ticket de soporte',
    historia: 'Como Usuario B2C, quiero crear un ticket de soporte describiendo mi problema, para recibir ayuda del equipo de Tracklytics.',
    requirementTitulo: 'Crear ticket de soporte',
    requirementTexto: 'El sistema SHALL permitir a un Usuario B2C autenticado crear un ticket de soporte con un asunto y una descripción, quedando registrado en estado abierto.',
    escenarioTitulo: 'Creación exitosa de un ticket',
    when: 'un Usuario B2C autenticado crea un ticket con asunto y descripción no vacíos',
    then: 'el sistema registra el ticket en estado abierto, asociado a ese usuario, con la fecha de creación',
    fuente: 'openspec/specs/experiencia/spec.md',
  },
  {
    paquete: 'facturacion',
    cu: 'CU-O20',
    cuTitulo: 'Registrar un método de pago',
    historia: 'Como Usuario B2C, quiero registrar un método de pago, para poder pagar mi suscripción.',
    requirementTitulo: 'Registro de método de pago',
    requirementTexto: 'El sistema SHALL permitir a un usuario autenticado registrar un método de pago simulado (tipo, últimos 4 dígitos, país, nombre del titular, dirección de facturación), asociado únicamente a su propia cuenta — el número de tarjeta y la fecha de expiración completos nunca SHALL persistirse.',
    escenarioTitulo: 'Registro exitoso de un método de pago',
    when: 'un usuario autenticado envía tipo, país, nombre del titular, dirección y datos válidos para registrar un método de pago',
    then: 'el sistema registra el método de pago asociado a ese usuario y queda disponible para pagar una suscripción',
    fuente: 'openspec/specs/facturacion/spec.md',
  },
  {
    paquete: 'finanzas',
    cuTitulo: 'Registrar y anular un gasto operativo',
    historia: 'Como Lead Data Engineer/CTO, quiero registrar los gastos operativos de la plataforma por categoría, para tener visibilidad real de cuánto cuesta operarla.',
    requirementTitulo: 'Registro y anulación de gastos operativos',
    requirementTexto: 'El sistema SHALL permitir a un usuario con rol admin crear un gasto operativo indicando concepto, categoría, monto, fecha y descripción opcional, y SHALL registrarlo en FACT_GASTO_OPERATIVO con estado activo. El sistema SHALL permitir editarlo y anularlo, pero SHALL nunca eliminarlo físicamente.',
    escenarioTitulo: 'Admin registra un gasto operativo',
    when: 'un usuario con rol admin crea un gasto con concepto, categoría, monto y fecha',
    then: 'el sistema lo registra en FACT_GASTO_OPERATIVO con estado activo y audita la creación',
    fuente: 'openspec/specs/finanzas/spec.md',
  },
  {
    paquete: 'gestion_datos',
    cuTitulo: 'Disparar la ejecución de una ingesta',
    historia: 'Como Lead Data Engineer, quiero disparar la ingesta de un nuevo lote de catálogo desde la interfaz de gestión, para incorporar datos nuevos sin tocar código.',
    requirementTitulo: 'Disparo de ejecución de ingesta',
    requirementTexto: 'El sistema SHALL permitir disparar la ejecución de una ingesta de catálogo desde la interfaz de gestión, identificando el período/lote a cargar.',
    escenarioTitulo: 'Disparar la ingesta de un lote',
    when: 'el Lead Data Engineer identifica un período/lote y dispara su ingesta desde la interfaz de gestión',
    then: 'el sistema inicia el procesamiento de ese lote',
    fuente: 'openspec/specs/ingesta/spec.md (capability ingesta, paquete de backend gestion_datos)',
  },
  {
    paquete: 'partners',
    cu: 'CU-O12',
    cuTitulo: 'Consumir datos del catálogo mediante integración',
    historia: 'Como Partner/Integrador, quiero consumir datos del catálogo vía API, para integrarlos en mi propio software de gestión.',
    requirementTitulo: 'Autenticación por llave de API',
    requirementTexto: 'El sistema SHALL autenticar cada solicitud de API mediante una llave de API (API key) asociada al partner. Las llaves de API SHALL transmitirse únicamente vía header de autenticación, nunca como parámetro de query string visible en logs.',
    escenarioTitulo: 'Autenticación con llave de API en el header',
    when: 'un partner envía una solicitud incluyendo su llave de API en el header de autenticación',
    then: 'el sistema valida la llave contra el partner asociado y, si es válida, continúa procesando la solicitud',
    fuente: 'openspec/specs/partners/spec.md',
  },
  {
    paquete: 'publicidad',
    cu: 'CU-O66',
    cuTitulo: 'Administrar anunciantes y campañas',
    historia: 'Como Lead Data Engineer/CTO, quiero registrar anunciantes y sus campañas con un CPM real, para poder monetizar el tier free.',
    requirementTitulo: 'Administración de anunciantes y campañas',
    requirementTexto: 'El sistema SHALL permitir a un usuario con rol admin registrar un anunciante y crear campañas publicitarias asociadas, indicando un CPM (costo por mil impresiones) real, un rango de vigencia y un tipo de anuncio (audio o display), exclusivo por campaña.',
    escenarioTitulo: 'Admin crea un anunciante y una campaña de audio',
    when: 'un usuario con rol admin registra un anunciante y crea una campaña de tipo audio con nombre, CPM y fecha de inicio',
    then: 'el sistema registra la campaña como activa y disponible para mostrarse entre canciones a usuarios free',
    fuente: 'openspec/specs/publicidad/spec.md',
  },
  {
    paquete: 'regalias',
    cu: 'CU-O61',
    cuTitulo: 'Crear un contrato de reparto para un track',
    historia: 'Como Lead Data Engineer/CTO, quiero definir qué porcentaje de master y de publishing le corresponde a cada rightsholder de un track, para que la liquidación sepa cómo repartir su ingreso.',
    requirementTitulo: 'Contrato de reparto por track',
    requirementTexto: 'El sistema SHALL permitir a un usuario con rol admin crear un contrato de reparto para un track existente, indicando el porcentaje de derecho de master y de publishing que le corresponde a sello, artista y productor. Los porcentajes de master y de publishing SHALL sumar 100 cada uno; el sistema SHALL rechazar un contrato cuyos porcentajes no sumen 100.',
    escenarioTitulo: 'Admin crea un contrato válido',
    when: 'un usuario con rol admin crea un contrato para un track existente con porcentajes de master y publishing que suman 100 cada uno',
    then: 'el sistema registra el contrato como vigente desde la fecha indicada',
    fuente: 'openspec/specs/regalias/spec.md',
  },
  {
    paquete: 'reportes',
    cuTitulo: 'Consultar un informe compuesto por departamento',
    historia: 'Como Lead de un departamento (o superadmin), quiero consultar los informes compuestos de mi propia área, para tomar decisiones tácticas con datos agregados reales de Gold.',
    requirementTitulo: 'Consulta de informes compuestos por departamento',
    requirementTexto: 'El sistema SHALL exponer 30 informes compuestos de solo lectura bajo GET /app/v1/reportes/compuestos/<departamento>/<informe>, agrupados en 9 departamentos según la tabla de trazabilidad, con el mismo formato estándar de respuesta.',
    escenarioTitulo: 'Lead de departamento consulta un informe de su área',
    when: 'un usuario con el rol administrativo del departamento correspondiente (o superadmin) solicita uno de los 30 informes compuestos',
    then: 'el sistema responde con el formato estándar y los datos agregados de ese departamento',
    fuente: 'openspec/specs/reportes/spec.md',
  },
  {
    paquete: 'seguridad',
    cu: 'CU-O17',
    cuTitulo: 'Gestionar permisos granulares por rol',
    historia: 'Como Lead Data Engineer/CTO, quiero administrar qué recursos y acciones puede usar cada rol, para controlar el acceso al sistema con precisión.',
    requirementTitulo: 'Gestión de permisos granulares por rol',
    requirementTexto: 'El sistema SHALL permitir a un usuario con rol admin consultar y modificar los permisos granulares (recurso, acción) asignados a un usuario, además de la matriz por defecto de cada rol. El admin SHALL poder localizar al usuario objetivo mediante una búsqueda por nombre o correo, sin requerir que conozca su usuario_id.',
    escenarioTitulo: 'Buscar el usuario por nombre o correo antes de gestionar sus permisos',
    when: 'un usuario con rol admin escribe parte del nombre o correo de un usuario para consultar o modificar sus permisos',
    then: 'el sistema muestra las coincidencias encontradas para que el admin seleccione el usuario exacto',
    fuente: 'openspec/specs/seguridad/spec.md',
  },
  {
    paquete: 'simulacion',
    cuTitulo: 'Generar actividad de negocio simulada de un período',
    historia: 'Como Lead Data Engineer/CTO, quiero generar en un solo paso reproducciones, suscripciones e impresiones publicitarias simuladas de un período, para tener datos de negocio reales sobre los que agregar los informes compuestos.',
    requirementTitulo: 'Generación conjunta de actividad de negocio simulada',
    requirementTexto: 'El sistema SHALL permitir exclusivamente a un usuario con rol admin generar, en una sola operación, reproducciones, suscripciones e impresiones publicitarias completadas dentro de la misma ventana de tiempo, aplicando valores por defecto razonables cuando el admin no especifica cantidades.',
    escenarioTitulo: 'Generar actividad con valores por defecto',
    when: 'un usuario con rol admin solicita generar actividad de negocio simulada sin especificar cantidades',
    then: 'el sistema genera reproducciones, suscripciones e impresiones publicitarias con cantidades por defecto, liquida el período resultante, y retorna el resumen de lo generado y liquidado',
    fuente: 'openspec/specs/simulacion/spec.md',
  },
  {
    paquete: 'social',
    cu: 'CU-O31',
    cuTitulo: 'Comentar y responder en un track',
    historia: 'Como Usuario B2C, quiero comentar una canción y responder a otros comentarios, para participar de la conversación alrededor de la música.',
    requirementTitulo: 'Comentar un track',
    requirementTexto: 'El sistema SHALL permitir a un Usuario B2C autenticado comentar un track existente del catálogo, quedando el comentario visible de inmediato sin aprobación previa. El sistema SHALL permitir que el comentario sea una respuesta a otro comentario existente del mismo track mediante una referencia al comentario padre.',
    escenarioTitulo: 'Comentario raíz exitoso',
    when: 'un Usuario B2C autenticado envía un comentario con contenido no vacío para un track existente, sin indicar comentario padre',
    then: 'el sistema registra el comentario en estado visible, asociado a ese track y ese usuario',
    fuente: 'openspec/specs/social/spec.md',
  },
  {
    paquete: 'suscripciones',
    cu: 'CU-O06',
    cuTitulo: 'Suscribirse a plan premium o plan B2B',
    historia: 'Como Usuario B2C, quiero suscribirme a un plan premium, para acceder a funciones extendidas sin restricciones.',
    requirementTitulo: 'Mostrar planes disponibles',
    requirementTexto: 'El sistema SHALL mostrar los planes disponibles (free, premium, estudiante para B2C; básico, pro, enterprise para B2B) con su descripción y precio, listando explícitamente las features/paneles incluidos en cada tier B2B.',
    escenarioTitulo: 'Listar planes disponibles',
    when: 'un Usuario B2C o Cliente B2B autenticado solicita ver los planes disponibles',
    then: 'el sistema muestra los planes correspondientes a su tipo de actor con descripción y precio',
    fuente: 'openspec/specs/suscripciones/spec.md',
  },
]

const SECCIONES = [
  { id: 'contexto', numero: '§01', titulo: 'Contexto' },
  { id: 'division-empresarial', numero: '§02', titulo: 'División empresarial' },
  { id: 'metodologia', numero: '§03', titulo: 'Metodología de trabajo' },
  { id: 'arquitectura', numero: '§04', titulo: 'Arquitectura' },
  { id: 'paquetes', numero: '§05', titulo: 'Paquetes, endpoints y casos de uso' },
  { id: 'sinteticos', numero: '§06', titulo: 'Nota sobre datos sintéticos' },
] as const

// Dos observers separados a propósito, no uno: "sección activa en la
// sidebar" y "la sección ya entró al viewport alguna vez" son preguntas
// distintas con requisitos de precisión opuestos. Con un único observer de
// banda angosta (necesaria para saber cuál sección está "en foco" ahora
// mismo), una sección más alta que esa banda —§04/§05, que traen diagramas
// y grids largos— nunca llega al 20% de intersección exigido y queda con
// `data-visible=false` para siempre, sin importar cuánto se haga scroll.
function useScrollSpy(ids: readonly string[]) {
  const [activeId, setActiveId] = useState<string>(ids[0])
  const [visible, setVisible] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)

    // Revelado (fade-in), una sola vez por sección: dispara con que
    // cualquier parte de la sección haya tocado el viewport, sin exigir
    // que quepa entera en una banda angosta. Se deja de observar cada
    // sección apenas se revela — ya no hay nada más que ese observer deba
    // decidir sobre ella.
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible((prev) => ({ ...prev, [entry.target.id]: true }))
            revealObserver.unobserve(entry.target)
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -10% 0px' },
    )

    // Sección activa en la sidebar: conserva la banda angosta original
    // (`rootMargin`, no `threshold`) para la precisión de "cuál sección
    // está en foco ahora" — eso ya funcionaba bien. Lo que sí se ajusta es
    // el `threshold`: en 0.2 exige que el 20% de la altura de la sección
    // cabalgue dentro de esa banda, lo mismo que rompía el revelado para
    // §04/§05 (nunca disparaba `isIntersecting`, así que el sidebar se
    // quedaba pegado en la última sección corta que sí había alcanzado ese
    // 20%). Con `threshold: 0` basta con que cualquier parte de la sección
    // toque la banda — la precisión sigue viniendo del `rootMargin`
    // angosto, no de exigir una fracción de una altura que puede ser
    // arbitrariamente grande.
    const activeObserver = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((e) => e.isIntersecting)
        if (intersecting.length > 0) {
          const topMost = intersecting.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b))
          setActiveId(topMost.target.id)
        }
      },
      { threshold: 0, rootMargin: '-80px 0px -60% 0px' },
    )

    elements.forEach((el) => {
      revealObserver.observe(el)
      activeObserver.observe(el)
    })
    return () => {
      revealObserver.disconnect()
      activeObserver.disconnect()
    }
  }, [ids])

  return { activeId, visible }
}

export function DocumentacionAcademicaPage() {
  useDocumentTitle('Documentación académica')
  const sectionIds = SECCIONES.map((s) => s.id)
  const { activeId, visible } = useScrollSpy(sectionIds)
  const containerRef = useRef<HTMLDivElement>(null)
  // Picker de "un caso de uso real por paquete" (§04) — un solo panel que
  // cambia de contenido en vez de listar los 17 casos completos en línea:
  // mostrar el formato Requirement/Scenario de los 17 a la vez sería
  // demasiado texto para una sola pantalla (pedido explícito del usuario).
  const [paqueteUcSeleccionado, setPaqueteUcSeleccionado] = useState<string>(CASOS_DE_USO[0].paquete)
  const casoUcActivo = CASOS_DE_USO.find((c) => c.paquete === paqueteUcSeleccionado) ?? CASOS_DE_USO[0]

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={styles.page} ref={containerRef}>
      <div className={styles.disclaimer}>
        <FlaskConical size={14} className={styles.disclaimerIcon} aria-hidden="true" />
        <span>
          <strong>Documentación académica.</strong> Esta sección documenta el proceso académico de
          construcción del sistema. No forma parte del producto ni está pensada para usuarios finales.
        </span>
      </div>

      <header className={styles.header}>
        <Link to="/acerca-de" className={styles.brand}>
          <img src="/logo.png" alt="" width={28} height={28} />
          <span>Tracklytics</span>
        </Link>
        <Link to="/acerca-de" className={styles.btnBack}>
          <ArrowLeft size={14} aria-hidden="true" /> Volver
        </Link>
      </header>

      <div className={styles.hero}>
        {/* Marca de agua: el logo del header (28px, navegación) no alcanza
            para que esta página se sienta como la portada de un documento
            formal — este es un elemento nuevo, decorativo, sin equivalente
            en el resto del sitio. */}
        <img src="/logo.png" alt="" aria-hidden="true" className={styles.heroWatermark} />

        <div className={styles.heroLogoBadge}>
          <img src="/logo.png" alt="" width={56} height={56} />
        </div>

        <span className={styles.heroEyebrow}>Sustentación · Construcción del Software</span>
        <h1>Cómo se construyó Tracklytics</h1>
        <p>
          Metodología de trabajo, arquitectura del sistema y origen real de cada dato — incluyendo qué
          proviene del dataset de Spotify y qué se generó sintéticamente para alcanzar una escala
          académica representativa.
        </p>

        <dl className={styles.metricsStrip}>
          <div className={styles.metric}>
            <dt>Paquetes backend</dt>
            <dd>{TOTAL_PAQUETES}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Endpoints</dt>
            <dd>{TOTAL_ENDPOINTS}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Tablas catálogo + Gold</dt>
            <dd>{TABLAS_CATALOGO.total + TABLAS_GOLD}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Changes OpenSpec</dt>
            <dd>{OPENSPEC_CHANGES.total}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.mobileNav}>
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={styles.mobileNavLink}
            data-active={activeId === s.id}
            onClick={() => scrollToSection(s.id)}
          >
            {s.numero} {s.titulo}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="Índice de secciones">
          <ul className={styles.sidebarList}>
            {SECCIONES.map((s) => (
              <li key={s.id} className={styles.sidebarItem} data-active={activeId === s.id}>
                <button type="button" className={styles.sidebarLink} onClick={() => scrollToSection(s.id)}>
                  <span className={styles.sidebarNum}>{s.numero}</span>
                  <span>{s.titulo}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.content}>
          <section id="contexto" className={styles.section} data-visible={!!visible.contexto}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionHeadNum}>§01</span>
              <h2>Contexto</h2>
            </div>
            <div className={styles.prose}>
              <p>
                <strong>Tracklytics</strong> es una plataforma de analítica musical con un modelo{' '}
                <strong>B2B2C</strong><InfoHint text={GLOSARIO.b2b2c} />: una capa{' '}
                <strong>B2C</strong><InfoHint text={GLOSARIO.b2c} /> freemium de exploración musical
                (catálogo, reproducción, playlists, favoritos) genera el comportamiento de consumo que
                alimenta el motor analítico vendido como producto <strong>B2B</strong>
                <InfoHint text={GLOSARIO.b2b} /> a sellos discográficos, productoras, agencias de
                artistas y curadores de playlists — un <em>data flywheel</em> donde la base de usuarios
                finales sostiene y enriquece el análisis.
              </p>
              <p>
                El proyecto se desarrolló como trabajo del curso de <strong>Construcción del Software</strong>,
                a lo largo de <strong>16 semanas</strong>, con un dataset diseñado para crecer de forma
                sostenida — del orden de <strong>~100.000 registros por semana académica</strong> — para
                que el modelo analítico refleje patrones reales de una plataforma de streaming, no
                anécdotas de un dataset pequeño.
              </p>
            </div>
          </section>

          <section id="division-empresarial" className={styles.section} data-visible={!!visible['division-empresarial']}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionHeadNum}>§02</span>
              <h2>División empresarial: estratégico, táctico y operativo</h2>
            </div>
            <div className={styles.prose}>
              <p>
                El trabajo no se organiza solo por paquete técnico: cada endpoint real responde, en
                última instancia, a un objetivo de negocio documentado en tres niveles — igual que en
                una empresa real, donde la dirección fija objetivos <strong>estratégicos</strong> de
                largo plazo, cada gerencia los traduce en objetivos <strong>tácticos</strong> departamentales,
                y cada equipo los ejecuta en objetivos <strong>operativos</strong> verificables en código.
                Esta misma jerarquía es la columna "Nivel empresarial" que aparece en la tabla de
                trazabilidad de cada especificación de OpenSpec (ver los casos de uso reales en §05).
              </p>
            </div>

            <div className={styles.pyramid}>
              <div className={styles.pyramidLevel}>
                <div className={styles.pyramidLevelHead}>
                  <span className={styles.pyramidLevelName}>Estratégico</span>
                  <span className={styles.pyramidLevelCount}>4 objetivos (OE1–OE4)</span>
                </div>
                <p>
                  Horizonte multi-año, fijado a nivel de dirección: penetración de mercado digital (OE1),
                  escalabilidad comercial vía APIs (OE2), infraestructura cloud de alta disponibilidad
                  (OE3), e inteligencia de negocio centralizada (OE4). Desde S16, el código del Balanced
                  Scorecard también referencia un quinto objetivo (ecosistema de creadores, OE5), sin una
                  definición formal propia todavía en la documentación de objetivos.
                </p>
              </div>
              <div className={styles.pyramidArrow}><ArrowDown size={16} aria-hidden="true" /></div>
              <div className={styles.pyramidLevel}>
                <div className={styles.pyramidLevelHead}>
                  <span className={styles.pyramidLevelName}>Táctico</span>
                  <span className={styles.pyramidLevelCount}>35 objetivos (OT), 9 departamentos</span>
                </div>
                <p>
                  Cada gerencia de área traduce los objetivos estratégicos en metas departamentales
                  propias — cada una resuelta por un informe simple y/o compuesto real, no solo
                  enunciada en un documento.
                </p>
              </div>
              <div className={styles.pyramidArrow}><ArrowDown size={16} aria-hidden="true" /></div>
              <div className={styles.pyramidLevel}>
                <div className={styles.pyramidLevelHead}>
                  <span className={styles.pyramidLevelName}>Operativo</span>
                  <span className={styles.pyramidLevelCount}>69 objetivos (OO), 15 de 17 paquetes</span>
                </div>
                <p>
                  Cada objetivo operativo tiene una meta verificable en código y se desglosa en los
                  casos de uso (CU) — mismo formato Requirement/Scenario de §05.{' '}
                  <code>reportes</code> y <code>simulacion</code> son herramientas transversales que
                  sirven a los objetivos de los demás departamentos, no un departamento con objetivo
                  operativo propio.
                </p>
              </div>
            </div>

            <div className={styles.prose} style={{ marginTop: 'var(--space-xl)' }}>
              <p>Un ejemplo real de la cadena completa, de la estrategia al código:</p>
            </div>
            <div className={styles.pipeline}>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>Estratégico</div>
                <p><strong>OE4</strong> — Inteligencia de negocio centralizada</p>
              </div>
              <div className={styles.pipelineArrow}><ArrowRight size={16} aria-hidden="true" /></div>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>Táctico</div>
                <p><strong>OT-15</strong> — KPIs de negocio (Analítica y BI)</p>
              </div>
              <div className={styles.pipelineArrow}><ArrowRight size={16} aria-hidden="true" /></div>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>Operativo</div>
                <p><strong>OO-ANA-01</strong> — Dashboard ejecutivo con KPIs agregados</p>
              </div>
              <div className={styles.pipelineArrow}><ArrowRight size={16} aria-hidden="true" /></div>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>Caso de uso</div>
                <p><strong>CU-O07</strong> — Consultar dashboard ejecutivo → <code>GET /analitica/dashboard</code></p>
              </div>
            </div>

            <div className={styles.prose} style={{ marginTop: 'var(--space-xl)' }}>
              <p>Los 35 objetivos tácticos se reparten así entre los 9 departamentos:</p>
            </div>
            <div className={styles.grid}>
              {DEPARTAMENTOS.map((d) => (
                <div key={d.nombre} className={styles.card}>
                  <p className={styles.cardTitle}>{d.nombre}</p>
                  <p className={styles.cardMeta}>{d.rol} · {d.ot} OT</p>
                </div>
              ))}
            </div>
          </section>

          <section id="metodologia" className={styles.section} data-visible={!!visible.metodologia}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionHeadNum}>§03</span>
              <h2>Metodología de trabajo</h2>
            </div>
            <div className={styles.prose}>
              <p>
                El flujo de datos del catálogo va siempre en la misma dirección: desde el dataset base de
                Spotify en PocketBase, a través de un ETL en Python, hacia una capa de{' '}
                <strong>staging</strong><InfoHint text={GLOSARIO.staging} /> en Parquet, y de ahí a
                ClickHouse. Sobre esa capa columnar se construye primero la capa operativa (los paquetes
                de negocio del backend) y luego la capa táctica/estratégica (el{' '}
                <strong>Balanced Scorecard</strong><InfoHint text={GLOSARIO.bsc} />).
              </p>
            </div>
            <div className={styles.pipeline}>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>1 · Fuente</div>
                <p>Dataset Spotify en PocketBase</p>
              </div>
              <div className={styles.pipelineArrow}><ArrowRight size={16} aria-hidden="true" /></div>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>2 · ETL</div>
                <p>Python (pandas, pyarrow), orquestado con Airflow</p>
              </div>
              <div className={styles.pipelineArrow}><ArrowRight size={16} aria-hidden="true" /></div>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>3 · Staging</div>
                <p>Parquet, capa intermedia transitoria</p>
              </div>
              <div className={styles.pipelineArrow}><ArrowRight size={16} aria-hidden="true" /></div>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>4 · ClickHouse</div>
                <p>Tablas de hechos y dimensiones (8123)</p>
              </div>
              <div className={styles.pipelineArrow}><ArrowRight size={16} aria-hidden="true" /></div>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>5 · Operativa</div>
                <p>Paquetes de negocio (FastAPI)</p>
              </div>
              <div className={styles.pipelineArrow}><ArrowRight size={16} aria-hidden="true" /></div>
              <div className={styles.pipelineStep}>
                <div className={styles.pipelineStepLabel}>6 · Táctica/Estratégica</div>
                <p>Informes compuestos (Gold) y Balanced Scorecard</p>
              </div>
            </div>

            <div className={styles.prose} style={{ marginTop: 'var(--space-xl)' }}>
              <p>
                El desarrollo funcional siguió <strong>Spec Driven Development</strong> vía OpenSpec: cada
                cambio se propone, se implementa, se verifica y se archiva como historial permanente antes
                de pasar al siguiente. A la fecha de esta página hay{' '}
                <strong>{OPENSPEC_CHANGES.total} changes archivados</strong>, desde{' '}
                <strong>{OPENSPEC_CHANGES.primero}</strong> hasta <strong>{OPENSPEC_CHANGES.ultimo}</strong>.
                Cada change archivado conserva su propuesta (<code>proposal.md</code>), en la mayoría de
                los casos un documento de diseño (<code>design.md</code>), las especificaciones delta
                (<code>specs/</code>) y el checklist de tareas de implementación (<code>tasks.md</code>).
              </p>
            </div>
            <div className={styles.flowSteps}>
              <div className={styles.flowStep}><span className={styles.flowStepDot} /> Propose</div>
              <div className={styles.flowStep}><GitBranch size={14} aria-hidden="true" /> Apply</div>
              <div className={styles.flowStep}><CheckCircle2 size={14} aria-hidden="true" /> Verify</div>
              <div className={styles.flowStep}><span className={styles.flowStepDot} /> Archive</div>
            </div>
          </section>

          <section id="arquitectura" className={styles.section} data-visible={!!visible.arquitectura}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionHeadNum}>§04</span>
              <h2>Arquitectura</h2>
            </div>
            <div className={styles.prose}>
              <p>
                El stack corre íntegramente en contenedores Docker orquestados con Docker Compose. Hay dos
                motores de datos reales: <strong>PocketBase</strong> (puerto 8090), dueño de la colección{' '}
                <code>users</code> (identidad, autenticación, roles administrativos) y de{' '}
                <code>playlists</code>/<code>playlist_tracks</code> (el orden de tracks de cada playlist,
                por <code>fact_id</code> y posición) — entidades de bajo volumen cuyas reglas de acceso
                dependen de su motor de auth; y <strong>ClickHouse</strong> como base analítica columnar
                para el resto del modelo. A esto se suma Parquet como staging transitorio, Airflow para la
                orquestación del ETL, FastAPI como capa de API, y Nginx sirviendo el build de producción
                del frontend.
              </p>
              <p>
                Los datos se organizan en capas <strong>Bronze → Silver → Gold</strong>
                <InfoHint text={GLOSARIO.medallion} />: Bronze y Silver
                viven en las tablas de staging y de hechos/dimensiones del catálogo (puerto 8123); Gold es
                una <strong>segunda instancia de ClickHouse separada, en el puerto 8124</strong>, dedicada
                a los informes compuestos agregados por período. Esta separación en dos instancias fue un
                requisito explícito del docente del curso, no un error de diseño ni una decisión de
                escalabilidad tomada por el equipo.
              </p>
            </div>

            {DIAGRAMAS.filter((d) => d.archivo === 'd_componentes.png' || d.archivo === 'd_despliegue.png').map((d) => (
              <figure key={d.archivo} className={styles.diagramBlock}>
                <p className={styles.diagramCaption}>{d.titulo}</p>
                <div className={styles.diagramFrame}>
                  <img src={`/docs-academicas/${d.archivo}`} alt={d.titulo} loading="lazy" />
                </div>
                <p className={styles.diagramUpdatedAt}>Última actualización: {d.actualizado}</p>
              </figure>
            ))}
          </section>

          <section id="paquetes" className={styles.section} data-visible={!!visible.paquetes}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionHeadNum}>§05</span>
              <h2>Paquetes, endpoints y casos de uso</h2>
            </div>
            <div className={styles.prose}>
              <p>
                El backend organiza sus <strong>{TOTAL_PAQUETES} paquetes</strong> por dominio de negocio,
                sumando <strong>{TOTAL_ENDPOINTS} endpoints</strong> en total.
              </p>
            </div>
            <div className={styles.grid}>
              {PAQUETES.map((p) => (
                <div key={p.nombre} className={styles.card}>
                  <p className={styles.cardTitle}>{p.nombre}</p>
                  <p className={styles.cardMeta}>{p.endpoints} endpoint{p.endpoints === 1 ? '' : 's'}</p>
                </div>
              ))}
            </div>

            <div className={styles.prose} style={{ marginTop: 'var(--space-xl)' }}>
              <p>
                Cada caso de uso del sistema se documenta con el mismo formato en OpenSpec: una
                historia de usuario, uno o más <em>Requirements</em> (<code>SHALL</code>) y sus{' '}
                <em>Scenarios</em> (<code>WHEN</code>/<code>THEN</code>)<InfoHint text={GLOSARIO.gherkin} />.
                Un ejemplo real por paquete, tal como está escrito en <code>openspec/specs/</code>:
              </p>
            </div>
            <div className={styles.ucPicker} role="tablist" aria-label="Elegir paquete">
              {CASOS_DE_USO.map((c) => (
                <button
                  key={c.paquete}
                  type="button"
                  role="tab"
                  aria-selected={paqueteUcSeleccionado === c.paquete}
                  className={styles.ucPickerBtn}
                  data-active={paqueteUcSeleccionado === c.paquete}
                  onClick={() => setPaqueteUcSeleccionado(c.paquete)}
                >
                  {c.paquete}
                </button>
              ))}
            </div>
            <div className={styles.ucCard} role="tabpanel">
              <div className={styles.ucMeta}>
                <BookOpen size={14} aria-hidden="true" />
                <span>{casoUcActivo.paquete}</span>
                {casoUcActivo.cu && <span className={styles.ucCode}>{casoUcActivo.cu}</span>}
                <span className={styles.muted}>{casoUcActivo.cuTitulo}</span>
              </div>
              <p className={styles.ucHistoria}>“{casoUcActivo.historia}”</p>

              <div className={styles.ucBlock}>
                <p className={styles.ucBlockLabel}>Requirement · {casoUcActivo.requirementTitulo}</p>
                <p className={styles.ucBlockBody}>{casoUcActivo.requirementTexto}</p>
              </div>

              <div className={styles.ucBlock}>
                <p className={styles.ucBlockLabel}>Scenario · {casoUcActivo.escenarioTitulo}</p>
                <p className={styles.ucBlockBody}>
                  <span className={styles.ucGherkin}>WHEN</span> {casoUcActivo.when}
                  <br />
                  <span className={styles.ucGherkin}>THEN</span> {casoUcActivo.then}
                </p>
              </div>

              <p className={styles.ucSource}>Fuente: {casoUcActivo.fuente}</p>
            </div>

            <figure className={styles.diagramBlock}>
              <p className={styles.diagramCaption}>{diagrama('d_casos_de_uso.png').titulo}</p>
              <div className={styles.diagramFrame}>
                <img src="/docs-academicas/d_casos_de_uso.png" alt="Diagrama de casos de uso" loading="lazy" />
              </div>
              <p className={styles.diagramUpdatedAt}>Última actualización: {diagrama('d_casos_de_uso.png').actualizado}</p>
            </figure>

            <div className={styles.prose} style={{ marginTop: 'var(--space-xl)' }}>
              <p>
                El modelo de datos completo suma <strong>{TABLAS_CATALOGO.total} tablas</strong> en el
                catálogo (8123: {TABLAS_CATALOGO.dim} dimensiones, {TABLAS_CATALOGO.fact} de hechos,{' '}
                {TABLAS_CATALOGO.bridge} puente, {TABLAS_CATALOGO.stg} de staging y{' '}
                {TABLAS_CATALOGO.otros} de otro tipo — logs, control de lotes, cache) más{' '}
                <strong>{TABLAS_GOLD} tablas</strong> en Gold (8124), casi todas informes compuestos por
                período.
              </p>
            </div>
            <figure className={styles.diagramBlock}>
              <p className={styles.diagramCaption}>{diagrama('d_base_de_datos.png').titulo}</p>
              <div className={styles.diagramFrame}>
                <img src="/docs-academicas/d_base_de_datos.png" alt="Diagrama de base de datos" loading="lazy" />
              </div>
              <p className={styles.diagramUpdatedAt}>Última actualización: {diagrama('d_base_de_datos.png').actualizado}</p>
            </figure>

            <div className={styles.prose} style={{ marginTop: 'var(--space-xl)' }}>
              <p>
                El <strong>Balanced Scorecard</strong> estratégico agrupa 13 KPIs canónicos en 4
                perspectivas, cada uno calculado con una agregación real sobre Gold (ningún valor del BSC
                es sintético):
              </p>
            </div>
            <div className={styles.bscGrid}>
              {BSC_PERSPECTIVAS.map((persp) => (
                <div key={persp.nombre} className={styles.bscCard}>
                  <h3>{persp.nombre}</h3>
                  <ul>
                    {persp.kpis.map((kpi) => (
                      <li key={kpi}>
                        {kpi}
                        {kpi.includes('ARR') && <InfoHint text={GLOSARIO.arr} />}
                        {kpi.includes('CAC') && <InfoHint text={GLOSARIO.cac} />}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section id="sinteticos" className={styles.section} data-visible={!!visible.sinteticos}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionHeadNum}>§06</span>
              <h2>Nota sobre datos sintéticos</h2>
            </div>
            <div className={styles.prose}>
              <p>
                El catálogo musical de base (tracks, artistas, álbumes, géneros y características de
                audio) proviene de un dataset público real de Spotify — 113.550 tracks marcados{' '}
                <code>source_type = 'real'</code>, con sus metadatos y portadas resueltas contra APIs
                públicas (Spotify oEmbed, iTunes Search, Deezer Search). Sobre ese catálogo real conviven
                tracks generados en sesiones anteriores del proyecto, marcados{' '}
                <code>source_type = 'synthetic'</code>, para llevar el volumen a una escala representativa
                de una plataforma de streaming real.
              </p>
              <p>
                Ese catálogo por sí solo no genera actividad de negocio: nadie se registra, nadie paga una
                suscripción, ninguna campaña genera impresiones. Por eso el pipeline ETL también genera
                eventos de negocio sintéticos (altas de usuario, transacciones, reproducciones,
                impresiones publicitarias, liquidaciones de regalías) directamente como filas reales en
                las tablas de hechos del catálogo, usando las mismas constantes y fórmulas de negocio que
                usaría un evento real (IVA, tasas de éxito de cobro, splits de regalías) — nunca literales
                inventados. Un usuario podría subir contenido real (<code>source_type = 'user_uploaded'</code>)
                que convive con ambos.
              </p>
            </div>
            <div className={styles.callout}>
              <span className={styles.calloutIcon}><FlaskConical size={18} aria-hidden="true" /></span>
              <div>
                <p>
                  <strong>Esta distinción real/sintético nunca se expone en superficies de negocio
                  normales</strong> — ni en informes, ni en dashboards, ni en la interfaz que ve un Lead de
                  departamento o un cliente B2B. Vive únicamente en el esquema (columnas{' '}
                  <code>source_type</code>/<code>is_synthetic</code>/<code>es_estimado</code>) y en esta
                  página, mostrada solo durante la sustentación académica.
                </p>
                <p>
                  La razón: un caso de estudio de negocio no le recuerda al lector en cada línea que una
                  cifra es hipotética. La columna <code>es_estimado</code> se conserva en las tablas Gold
                  como garantía a futuro — si algún dato deja de tener respaldo real, la fila queda
                  marcada — no porque hoy haya datos marcados como tales en los informes compuestos.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer className={styles.footer}>
        <Link to="/acerca-de">← Volver a Acerca de Tracklytics</Link>
      </footer>
    </div>
  )
}
