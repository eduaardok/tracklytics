# Bitácora Resumen — Tracklytics

Este documento consolida en un solo lugar las bitácoras semanales individuales del proyecto
(S6 a S17) para dar una vista panorámica de cómo evolucionó Tracklytics a lo largo del semestre:
qué se construyó cada semana, qué decisiones de arquitectura se tomaron y qué incidentes o bugs
relevantes se resolvieron. Es un resumen ejecutivo, no un reemplazo de las bitácoras originales —
el detalle línea por línea de cada semana (endpoints exactos, queries SQL, archivos tocados,
comandos de verificación) vive en `docs/BITACORA_S6.md` a `docs/BITACORA_S16.md`. La semana 17 no
tiene una bitácora dedicada; su resumen aquí se reconstruyó a partir de `docs/AUDITORIA_NAVEGACION_UX_S17.md`,
`docs/qa-visual-s17/` y los mensajes de commit con prefijo "S17" en el historial de git.

---

## Semana 6 (junio 2026)

- Se migró la capa de interacción de usuario (favoritos, historial, playlists) de `localStorage`
  al stack de producción: eventos de alta frecuencia (favoritos, reproducciones) a ClickHouse
  (`FACT_ENGAGEMENT_USUARIO`, MergeTree append-only) y entidades relacionales con reglas de acceso
  (playlists, playlist_tracks) a PocketBase — separación de responsabilidades que se mantuvo el
  resto del proyecto.
- Nuevo DAG independiente `engagement_referencia` para generar datos de referencia de engagement,
  desacoplado del DAG de catálogo (seeds propias, disparo en orden pero procesos separados).
- Reproductor persistente entre páginas con cola de reproducción completa (`setQueue`, avance
  automático, panel de cola), estado de UI en `localStorage` pero eventos de negocio en ClickHouse.
- Rediseño visual transversal: sistema de cover art por gradiente (sin imágenes externas), empty
  states ilustrados, skeletons de carga, hero con gradiente en páginas de detalle.
- Bugs de layout de scroll/overflow y de sincronización de estado de favoritos corregidos; primeros
  indicios de fricción entre el frontend legado (`app/`, vanilla JS) y el modelo de datos real.

(ver docs/BITACORA_S6.md)

## Semana 7 (junio 2026)

- Se adoptó Spec Driven Development con OpenSpec: constitución técnica del proyecto
  (`openspec/config.yaml`) formalizando stack obligatorio, reglas del docente (RT-01 a RT-06),
  modelo de datos técnico vs. de negocio, y la regla crítica de framing (los datos sintéticos nunca
  se mencionan como tales de cara a negocio).
- 5 capabilities del módulo operativo especificadas (catalogo, suscripciones, analitica, partners,
  ingesta); `catalogo` y `suscripciones` implementadas y verificadas end-to-end con requests reales
  contra el stack vivo (no solo revisión de código).
- Decisión arquitectónica clave: favoritos/historial se escriben síncronos y fila-a-fila desde
  FastAPI directo a ClickHouse (no vía PocketBase ni el pipeline batch Parquet/Airflow) — se
  documentó como excepción consciente al patrón batch del catálogo, en vez de forzar una migración.
- Bugs reales encontrados solo con verificación end-to-end (no con revisión estática): PocketBase
  trata `0` como campo vacío en un `number` requerido, y no autogenera `created`/`updated` en
  colecciones base de este esquema.

(ver docs/BITACORA_S7.md)

## Semana 8 (junio 2026)

- Cierre del ciclo de Spec Driven Development de S7: `analitica`, `ingesta` y `partners`
  implementadas, verificadas con curl real contra el stack en Docker y archivadas en OpenSpec — las
  5 capabilities operativas (16 casos de uso) quedan con código funcional y trazabilidad completa.
- Patrón establecido y repetido el resto del proyecto: gating de acceso es responsabilidad de cada
  capability consumidora (cada paquete define su propio `deps.py`), no un middleware central.
- Verificación manual end-to-end con las 3 cuentas demo encontró un hallazgo de infraestructura
  mayor: existía un **segundo frontend completo duplicado** (`frontend/`, código muerto sin
  `Authorization` header) coexistiendo con el frontend real (`app/`) sin que nadie lo hubiera
  notado — eliminado por completo.
- Condición de carrera real en el guard de concurrencia de ingesta (ventana de ~0.3-0.5s) y bug de
  columnas ambiguas en ClickHouse (JOIN sin alias) en `partners`, ambos encontrados solo con
  requests reales, no con revisión de código.
- Se exploró pero no se implementó reproducción de audio real (el dataset no trae audio).

(ver docs/BITACORA_S8.md)

## Semana 9 (junio–julio 2026)

- Hardening del módulo operativo completo: 12 bugs de UX/datos corregidos (reproductor, historial,
  playlists), exportación a PDF del reporte diario, y optimización de ClickHouse (~7× en home,
  ~5× en historial) al descubrir que las queries de top tracks escaneaban toda la tabla en vez de
  filtrar `is_synthetic = 0` primero.
- El docente señaló que el alcance operativo era demasiado mínimo comparado con otros equipos —
  se abrió una refactorización mayor: **6 capabilities OpenSpec nuevas** (seguridad, facturacion,
  creadores, social, distribucion, experiencia) sumando ~58 tablas de diseño, y migración completa
  del frontend legado (HTML/JS vanilla) a **React + Vite + TypeScript**.
- Decisión pedagógica deliberada del docente: `seguridad` y `facturacion` se implementaron en
  ClickHouse (columnar) a pesar de ser dominios transaccionales, para que el equipo documentara las
  fricciones reales de usar una base columnar fuera de su caso ideal.
- Bug crítico de integridad de datos encontrado y corregido: 22.1% de `fact_id` en `FACT_TRACKS`
  apuntaban a dos tracks distintos por falta de idempotencia en la carga y orden inestable de la
  API de PocketBase — remediado, `FACT_TRACKS` pasó de 1.027.101 a 913.551 filas correctas.
- Reproducción de audio resuelta vía YouTube IFrame API con fallback simulado (Web Audio API);
  portadas reales resueltas con iTunes/Deezer Search API sin API key.

(ver docs/BITACORA_S9.md)

## Semana 10 (9–12 de julio de 2026)

- Auditoría de 55 casos de uso operativos encontró otro bug crítico de integridad (`fact_id`
  reasignado en cada recarga sintética, corrompiendo en silencio favoritos/playlists/comentarios) y
  una serie de gaps de "entorno de juguete" (pagos sin verificar, permisos sin UI, país sin validar).
- Retiro completo del frontend legado (`app/`, ~25 archivos) — React queda como único frontend.
- Dos capabilities nuevas centrales del modelo de negocio real: **regalías** (reparto por contrato
  master/publishing, liquidación por período con pool 70/30) y **publicidad** (anunciantes, CPM,
  ingreso reconocido en tiempo real) — 13 capabilities OpenSpec en total, 61 tablas físicas.
- Cierre de la capa operativa: 6 dashboards administrativos (RT-04), sesiones activas
  multi-dispositivo, búsqueda avanzada de catálogo, feed social, playlists colaborativas y
  reordenables.
- Rondas adicionales de la misma semana: notificaciones reales con 3 triggers, perfiles públicos
  con privacidad por defecto, QA autónomo con Claude in Chrome (7 bugs reales + 5 confirmados de
  7 "a confirmar"), y páginas de alta diferenciadas por tipo de cuenta (oyente/artista/sello).

(ver docs/BITACORA_S10.md)

## Semana 11 (13–19 de julio de 2026)

- Cierre del modelo de monetización freemium: publicidad display (además de audio), churn con
  motivo auditable, trial de 7 días + plan estudiante, funnel de conversión y P&L consolidado.
- Bug de control de acceso corregido: `admin` podía suscribirse y facturar como un usuario B2C
  cualquiera pese a ya tener acceso completo — se estableció el bypass de gating para admin,
  patrón reutilizado el resto del proyecto.
- Cierre del modelo financiero completo: liquidación de regalías idempotente, renovación con
  cancelación en cobro fallido, retiro de ganancias, MRR/ARR, cambio de plan con prorrateo,
  dunning real (3 intentos), retención fiscal en regalías, país/moneda/IVA/precios configurables.
- Nueva capability `simulacion` (14ª): genera streams+suscripciones+publicidad juntos y liquida el
  período en una sola acción — decisión clave: los streams solos no mueven dinero, el pool sale de
  suscripciones/publicidad.
- Enriquecimiento de catálogo: año/país deterministas por hash, perfil de audio empírico por
  género (no un pool global), recalificación administrativa en bloque vía DAG independiente.
- Gating real por tier B2B (Básico/Pro/Enterprise) en `analitica` con 2 paneles predictivos
  exclusivos Enterprise (proyección estadística, nunca "IA").
- Nueva capability `finanzas` (15ª): gastos operativos, reembolsos, cuentas por cobrar/pagar,
  presupuesto de campañas con pausa automática, dashboard financiero consolidado.
- Gobierno de identidad completo: 6 roles administrativos por área (`require_rol_admin`), vista
  360° de usuarios, lockout tras 5 intentos, recuperación de contraseña, baja de cuenta.
- Cierre de ciclos de vida de entidades que el sistema sabía crear pero no operar (pausar/revocar/
  terminar/takedown/retirar, CRUD de partners con rotación de API key, denuncias).
- Cierre de descubrimiento y comunidad: búsqueda unificada, radio y mix diario por similitud de
  audio calculada en SQL puro (sin ML externo), bloqueos entre usuarios, strikes con suspensión
  automática, verificación de email, exportación de datos personales (GDPR-like).
- Corrección de fondo: la reproducción de YouTube nunca sonaba de verdad (`listType:'search'`
  deprecado desde 2020) — se resolvió el `videoId` real vía YouTube Data API v3.

(ver docs/BITACORA_S11.md)

## Semana 12 (23–25 de julio de 2026)

- Serie de reportes administrativos de solo lectura (usuarios, strikes, A/B tests, notificaciones,
  plan familiar) — decisión editorial explícita de no crear specs OpenSpec nuevas para "vistas
  adicionales sobre datos ya especificados".
- 5 páginas de frontend para esos reportes, agrupadas en una nueva sección "Reportes" del sidebar
  admin, con KPIs y filtros client-side.
- Sidebar reorganizado en 5 secciones colapsables por primera vez (crecimiento de ~28 enlaces).
- Se sembraron datos semilla para `FACT_AB_TEST_EXPOSICION` (tabla sin productor real desde su
  creación en S9) para poder demostrar el reporte con contenido.
- Corrección de una premisa falsa recurrente: un supuesto 404 de ruta resultó ser la ausencia de un
  catch-all en el router (`NotFoundPage` agregado); otro supuesto "gráfico vacío" de creadores no
  se reprodujo — patrón que se repitió varias veces esta semana (verificar antes de actuar sobre
  diagnósticos ya dados).
- Verificación final con Playwright de las 13 páginas de reportes admin: 12/13 en verde a la
  primera corrida.

(ver docs/BITACORA_S12.md)

## Semana 13 (29 de julio – 2 de agosto de 2026)

- Auditoría de los 27 informes simples esperados: 26/27 existían con datos reales; único ausente
  total, "sesiones abiertas" (cerrado en la misma semana). OpenSpec real: 15/15 (no 11/11 como se
  asumía en el enunciado).
- Polish visual: toggle grid/lista en catálogo, micro-interacciones globales (skeletons, hover de
  tabla, gradiente en botones primarios), paleta de gráficos consistente (grid punteado, sin
  animación de entrada).
- Componente `CrudModal` genérico (Insertar/Editar/Ver detalle/Eliminar vía un único shell), patrón
  aplicado a Partners, Campañas publicitarias y Tickets de soporte.
- **Segunda instancia de ClickHouse ("Gold")** creada como infraestructura para agregaciones
  compuestas, separada de la instancia de catálogo — sin tablas todavía.
- Capa Gold completa: 13 tablas `GOLD_*_PERIODO`, un DAG de 12 tareas de agregación, y **30
  endpoints de informes compuestos** con política "real primero, demo-fill después" (solo se
  rellena con datos determinísticos lo que el catálogo real no cubre, marcado `es_estimado=1`).
- Frontend de los 30 informes: 6 componentes plantilla reutilizables + una página genérica
  parametrizada por configuración (en vez de 30 archivos monolíticos).
- Fix real de infraestructura: el healthcheck de Airflow "mentía" — el webserver se caía de verdad
  por timeouts de gunicorn insuficientes bajo carga compartida con el scheduler.
- Optimización de rendimiento del catálogo: patrón de dos pasos (rankear barato con agregados
  escalares, enriquecer solo los ganadores con `WHERE track_id IN (...)`) evitando escanear 1.1M
  filas para deduplicar géneros; `/search` paralelizado con `asyncio.gather`.
- Fix de exportación a PDF: `html2canvas` no soporta la sintaxis `oklch()` de la paleta del
  proyecto — reemplazado por el fork `html2canvas-pro`.

(ver docs/BITACORA_S13.md)

## Semana 14 (30 de julio – 10 de agosto de 2026)

- Extensión de portadas a playlists (collage 2×2), artistas y géneros; detección de featuring por
  regex sobre `track_name` (el campo `artists` plural nunca llega a la capa Gold/API).
- **Grano temporal configurable** en la capa Gold: día/semana/mes/trimestre/año, con acotamiento
  del relleno demo a los 12 períodos más recientes de cada granularidad para no multiplicar el
  volumen de datos inventados.
- Reemplazo sistemático de `rng_for()` (relleno aleatorio) por datos de negocio reales: backfill de
  24 meses de historia (`backfill_negocio.py`, 13 dominios en orden de dependencia) que generó
  ~1M+ filas reales entre transacciones, publicidad, engagement, comunidad y regalías — las 12
  tablas Gold terminaron con `es_estimado=0` en el 100% de sus filas.
- 7 cuentas demo por rol administrativo, creadas 100% vía los endpoints reales de la API (con una
  única excepción documentada para el primer superadmin, por diseño del propio sistema de roles).
- Dos bugs reales de arranque limpio encontrados solo probando un clon desde cero: PocketBase no
  crea superusuario en un volumen vacío sin las variables de bootstrap correctas, y una carrera
  entre el init de PocketBase y la siembra de cuentas demo.
- Cierre: Balanced Scorecard nuevo (4 perspectivas × 2 KPIs, sobre 6 tablas Gold reales); fix real
  de PDF con filas cortadas a la mitad (medición de posición de cada `<tr>`, no `page-break-inside`,
  que es un no-op en un PDF rasterizado); framer-motion evaluado y descartado por costo de bundle
  (+43kB gzip) en favor de CSS puro; roles admin de área corregidos contra el código real del
  backend (3 casos donde el enunciado se equivocaba); 2 gaps de datos quedaron flagged sin arreglar
  (cobertura de licencias por territorio en ~0%, portadas de artista sin resolver).

(ver docs/BITACORA_S14.md)

## Semana 15 (12 de agosto de 2026)

- Auditoría exhaustiva de validación de entrada en los 115 endpoints de escritura reales (17
  paquetes) — un intento de paralelizar con 5 agentes en background se interrumpió por límite de
  gasto; el resto de la sesión fue revisión manual completa de cada diff dejado a medias.
- **Hallazgo más grave del proyecto**: inyección SQL real en el CRUD genérico de dimensiones
  (`gestion_datos.dim_create/dim_update`), que armaba `INSERT`/`UPDATE` por concatenación de
  f-strings sin escapar — verificado con un payload real de `DROP TABLE`. Corregido con el
  protocolo nativo del driver y whitelist de columnas.
- El mismo patrón de inyección (identificador interpolado sin validar en un filtro de PocketBase)
  apareció en 3 paquetes más (`partners`, `biblioteca`, `experiencia`) — corregidos con validación
  de formato en el borde de la API.
- Otros hallazgos reales de validación: splits de regalías que podían sumar 100% con un valor
  negativo, denuncias que podían "re-resolverse", reembolsos sin validación de motivo, tasas de
  cambio que aceptaban cero o negativo.
- Primera suite de pruebas automatizadas reales del proyecto además de las de `finanzas` (S11).

(ver docs/BITACORA_S15.md)

## Semana 16 (12–23 de agosto de 2026)

- Acceso directo a Airflow desde el frontend (botón "Ver en Airflow" por DAG) y schedule semanal
  automático en la agregación Gold, con guarda que salta la recorrida si no hay carga más nueva
  que agregar.
- Benchmark real de SQL directo vs. capa Gold pre-agregada: 11.7× y 10.8× de mejora en informes con
  JOINs complejos, solo 1.7× en un agregado simple sin JOIN (ClickHouse columnar ya es rápido ahí
  por sí solo) — resultados verificados como idénticos entre ambos caminos.
- Verificación de UX por rol con las 7 cuentas demo navegando de verdad (no solo con Bearer token):
  encontró 2 huecos reales de permisos backend que el diseño del sidebar no exponía (un admin de
  área veía un link que le devolvía 403 al abrirlo).
- Auditoría de trabajo hecho por otra herramienta (Open Code) sobre el mismo repo: la mayoría del
  trabajo (paginación real, resolución de IDs a nombre/email) estaba bien, pero se encontró y
  corrigió un `AttributeError` que producía un 500 real en cada request a un endpoint de admin.
- 14ª tabla Gold (`GOLD_CREADORES_PERIODO`) y KPI de retención de creadores para el BSC.
- Serie de lotes de producto dirigidos por feedback del stakeholder: fixes de flujos B2C (F1/F2/
  F7/F8/F9), glosario de atributos de audio al español, hub Facturación/Mi Plan (invertido dos
  veces según feedback), formulario de método de pago realista con tarjeta visual 3D, rediseño de
  Biblioteca, analítica propia del artista (streams del día, no solo regalías liquidadas).
- **Incidente de performance real y resuelto**: `FACT_TRACKS` ordenada por `genre_id` hacía que
  cualquier lookup por `fact_id`/`track_id` escaneara ~1.6M filas — se observaron queries de 5
  minutos que ahogaron el threadpool del API hasta requerir reinicio del contenedor. Fix real:
  `PROJECTION`s ordenadas por `fact_id`/`track_id` sobre `FACT_TRACKS`, con reescritura de queries
  como CTEs con predicado podable — favoritos bajó de 1.4–2.9s a 190–440ms; recomendaciones de
  ~10.5s a ~2–4.5s; mix diario de 52.6s a 1.3–2.0s.
- Cierre de brechas de producto P2: preferencias de notificación (opt-out por tipo), verificación
  de email con envío real (Mailpit local), comprobante de estudiante auditable, shuffle
  inteligente con anti-racha por artista, recomendaciones por co-ocurrencia ("escuchadas por tu
  gente"), radio disponible en todas las superficies, suggest de búsqueda con debounce.
- Cierre final: el staff (superadmin/admins de área) dejó de tratarse como Cliente B2C free en la
  UI (paywall, anuncios y chips de "Cliente B2C" visibles por error al mirar solo el rol crudo de
  PocketBase en vez del rol administrativo real).

(ver docs/BITACORA_S16.md)

## Semana 17 (post-cierre de S16, sin bitácora dedicada)

No existe `BITACORA_S17.md`; esta síntesis se reconstruyó a partir de
`docs/AUDITORIA_NAVEGACION_UX_S17.md`, las capturas de `docs/qa-visual-s17/` y los mensajes de
commit con prefijo "S17" del historial de git (`git log --oneline`).

- Auditoría completa de navegación y UX sobre las 77-81 páginas reales del frontend (usando 4
  agentes en paralelo), que dio origen a la mayor parte del trabajo de la semana: confirmación
  requerida en 11 acciones destructivas/financieras que no la tenían, paginación backend real en
  reportes que antes traían todo en memoria, `isError` real en 8 queries secundarias que fallaban
  en silencio.
- Hallazgo de producto de mayor severidad de la semana: `SimulacionPage` podía liquidar dinero real
  sin ningún paso de confirmación.
- Primera sesión con QA visual real en navegador vía Playwright contra capturas (`@playwright/test`
  ya estaba instalado, solo hacía falta correrlo desde `frontend/`) — 0 bugs visuales, 1 hallazgo
  funcional (422 silencioso en 4 páginas con selector de rango de fechas).
- Rango de fechas personalizable en dashboards, `ThemeToggle` agregado al panel de seguridad,
  tooltips de ayuda (`InfoHint`, reutilizado, no duplicado) en KPIs con términos no obvios,
  breadcrumbs en vistas anidadas del admin y atajos de teclado globales para el reproductor.
- Landing dedicada para `/seguridad` con tarjetas por rol administrativo y endpoint de resumen de
  roles con conteo de usuarios; selector "Viendo como" para que un superadmin filtre paneles por
  área.
- Gracia de cancelación: cancelar una suscripción ya no corta el acceso al instante, se mantiene
  hasta el fin del período ya pagado (sin afectar el cálculo de churn).
- `CrudModal` ganó modo `wide` (2 columnas) con preview en vivo, usado en formularios de campaña
  publicitaria y de subida de track de artista.
- Exportación CSV con BOM para ganancias y reporte financiero; fix del recorte de columnas en PDF
  de tablas de ranking anchas (causa real: `html2canvas` capturaba solo la caja visible del
  `overflow-x:auto`, no el ancho de scroll completo).
- Cierre de los últimos 2 `ComingSoonPage` de `/analitica` (Partners e Ingestas), reemplazados por
  vistas reales que ya existían del lado admin.
- Se confirmó que radio-por-track y colaboración en playlists ya existían (evitando repetir un
  pedido ya resuelto en S11/S16) — patrón recurrente de la semana: verificar el estado real del
  código antes de re-implementar algo que ya estaba hecho.
- 5 changes OpenSpec de S14 (P2 a P5 y FINAL) archivados, cerrando deuda de sesiones anteriores.

(ver docs/AUDITORIA_NAVEGACION_UX_S17.md, docs/qa-visual-s17/, y `git log --oneline | grep S17`)
