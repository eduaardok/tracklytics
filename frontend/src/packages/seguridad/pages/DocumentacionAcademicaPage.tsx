import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FlaskConical,
  ArrowRight,
  ArrowLeft,
  GitBranch,
  CheckCircle2,
} from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import styles from './DocumentacionAcademicaPage.module.css'

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

const SECCIONES = [
  { id: 'contexto', numero: '§01', titulo: 'Contexto' },
  { id: 'metodologia', numero: '§02', titulo: 'Metodología de trabajo' },
  { id: 'arquitectura', numero: '§03', titulo: 'Arquitectura' },
  { id: 'paquetes', numero: '§04', titulo: 'Paquetes, endpoints y casos de uso' },
  { id: 'sinteticos', numero: '§05', titulo: 'Nota sobre datos sintéticos' },
] as const

// Dos observers separados a propósito, no uno: "sección activa en la
// sidebar" y "la sección ya entró al viewport alguna vez" son preguntas
// distintas con requisitos de precisión opuestos. Con un único observer de
// banda angosta (necesaria para saber cuál sección está "en foco" ahora
// mismo), una sección más alta que esa banda —§03/§04, que traen diagramas
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
    // §03/§04 (nunca disparaba `isIntersecting`, así que el sidebar se
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
                <strong>B2B2C</strong>: una capa B2C freemium de exploración musical (catálogo,
                reproducción, playlists, favoritos) genera el comportamiento de consumo que alimenta el
                motor analítico vendido como producto B2B a sellos discográficos, productoras, agencias
                de artistas y curadores de playlists — un <em>data flywheel</em> donde la base de
                usuarios finales sostiene y enriquece el análisis.
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

          <section id="metodologia" className={styles.section} data-visible={!!visible.metodologia}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionHeadNum}>§02</span>
              <h2>Metodología de trabajo</h2>
            </div>
            <div className={styles.prose}>
              <p>
                El flujo de datos del catálogo va siempre en la misma dirección: desde el dataset base de
                Spotify en PocketBase, a través de un ETL en Python, hacia una capa de staging en
                Parquet, y de ahí a ClickHouse. Sobre esa capa columnar se construye primero la capa
                operativa (los paquetes de negocio del backend) y luego la capa táctica/estratégica
                (el Balanced Scorecard).
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
              <span className={styles.sectionHeadNum}>§03</span>
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
                Los datos se organizan en capas <strong>Bronze → Silver → Gold</strong>: Bronze y Silver
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
              <span className={styles.sectionHeadNum}>§04</span>
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
                      <li key={kpi}>{kpi}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section id="sinteticos" className={styles.section} data-visible={!!visible.sinteticos}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionHeadNum}>§05</span>
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
