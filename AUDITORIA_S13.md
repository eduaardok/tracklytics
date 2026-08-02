# Auditoría S13 — Estado del repositorio para el vídeo de entrega

**Fecha:** 2026-08-01 · **HEAD:** `d975d35` (rama `main`, árbol limpio)
**Método:** lectura de código + stack real levantado (`docker compose up -d`, 6/6 servicios sanos) + verificación por HTTP contra los endpoints con token de admin real + consultas directas a ClickHouse (8123) y ClickHouse Gold (8124) + `npm run build`.

---

## 0. Dos correcciones de premisa antes de empezar

**0.1 — La ruta `app/src/pages/` no existe.** El frontend vanilla `app/` fue retirado por completo en S10 (consolidación a React). Todo el frontend vive en `frontend/src/`, organizado por *capability* (`frontend/src/packages/<dominio>/pages/`), no en un directorio `pages/` plano. La auditoría se hizo sobre la estructura real.

**0.2 — S13 ya está implementada y commiteada; lo pendiente es grabar/subir, no construir.** El enunciado dice «la entrega S13 aún no se ha subido», lo cual es cierto respecto al vídeo, pero el código de S13 ya cerró en 4 fases (P1–P4) y está en `main`; el repo va por **S14-P1**. Además, **esta auditoría ya se hizo una vez**: `docs/BITACORA_S13.md` §S13-P1 contiene el inventario de los 27 informes simples, la tabla de CRUD y las recomendaciones para el vídeo.

Este documento **no repite** aquel trabajo: verifica sus afirmaciones contra el HEAD actual (que ya incluye S14) y se concentra en lo que cambió, en lo que la auditoría anterior no cubrió (evaluación visual de CRUDs genéricos §1b, gating de roles en frontend §4b, bug de «Pagar» §5) y en **riesgos concretos de cara a la cámara**.

---

## 1. Inventario de workpanels operativos

Los paneles operativos cuelgan de `/seguridad/*` (árbol admin, `SeguridadShell`). Marcadores detectados por análisis de código: `CrudModal` = modal dual crear/editar compartido; `confirm` = `useConfirm`; `toast` = feedback; KPIs / badges / skeleton / empty / filtros.

| # | Panel | Archivo | Ruta | Operaciones | Patrón UI | Nota | ⭐ |
|---|---|---|---|---|---|---|---|
| W01 | **Tickets de soporte** | `experiencia/pages/TicketsAdminPage.tsx` | `/seguridad/soporte` | C·R·U·D + cambio de estado | CrudModal, toast, KPIs, badges, skeleton, empty, filtros | Patrón completo, construido desde cero con `CrudModal` | **5** |
| W02 | **Campañas publicitarias** | `publicidad/pages/PublicidadAdminPage.tsx` | `/seguridad/publicidad` | C·R·U·D + pausar/reanudar/finalizar | CrudModal, **confirm**, toast, badges, skeleton, empty, filtros | El único con modal dual **y** confirmación destructiva | **5** |
| W03 | **Partners** | `partners/pages/AdminPartnersPage.tsx` | `/seguridad/partners/gestion` | C·R·U·D + rotar API key + desactivar | CrudModal, toast, badges, skeleton, empty, filtros | Falta `useConfirm` en desactivar/rotar key | **4.5** |
| W04 | **Regalías** | `regalias/pages/RegaliasAdminPage.tsx` | `/seguridad/regalias` | R·U + liquidar/aprobar retiro | confirm, toast, KPIs, badges, empty, filtros | Sin modal dual (formularios en línea) | **4** |
| W05 | **Suscripciones (admin)** | `suscripciones/pages/AdminSuscripcionesPage.tsx` | `/seguridad/suscripciones` | R·U + cancelar/reactivar | toast, badges, empty, filtros, paginación server-side | Sin KPIs ni skeleton | **4** |
| W06 | **Usuarios** | `seguridad/pages/UsuariosAdminPage.tsx` | `/seguridad/usuarios` | R·U + suspender/reactivar + asignar/revocar rol admin | toast, badges, skeleton, filtros, vista 360° | Sin KPIs; alta es self-service (no hay C) | **4** |
| W07 | **Distribución** (5 pestañas) | `distribucion/components/{Sellos,Licencias,Restricciones,SolicitudesLicencia,ConfiguracionGlobal}Tab.tsx` | `/seguridad/distribucion` | C·R·U·D por pestaña + aprobar/rechazar licencia | toast, badges, empty, filtros | Página contenedora solo tiene KPIs; sin modal dual ni confirm | **3.5** |
| W08 | **Moderación social** | `social/pages/ModeracionSocialPage.tsx` | `/seguridad/social` | R·U + ocultar/restaurar + resolver denuncia | toast, badges, empty | Sin KPIs, sin filtros, sin skeleton | **3** |
| W09 | **Revisión de creadores** | `creadores/pages/RevisionCreadoresPage.tsx` | `/seguridad/creadores` | R·U + aprobar/rechazar solicitud | toast, KPIs, empty | Sin badges de estado, sin filtros, sin confirm | **3** |
| W10 | **Catálogo (tracks)** | `catalogo/pages/AdminTracksPage.tsx` | `/seguridad/catalogo` | R·D + retirar/restaurar track | confirm, toast, empty | **Sin KPIs, sin badges, sin filtros, sin skeleton** | **2.5** |
| W11 | **Familia** | `experiencia/pages/FamiliaAdminPage.tsx` | `/seguridad/familia` | C·R·D miembros | toast, empty | Sin KPIs, badges, filtros ni skeleton | **2.5** |
| W12 | **CRUD de dimensiones** | `ingesta/pages/CrudDimensionesPage.tsx` | `/seguridad/ingesta/dimensiones` | C·R·U·D sobre 11 tablas DIM | confirm, filtros | **El más débil visualmente** — ver §1b | **2** |

**No son workpanels** (solo lectura, van en §2/§3): `DistribucionAdminPage` (contenedor de pestañas), `PartnersConsolePage`, `PartnersMetricasPage`, `FinanzasAdminPage`, `EtlPage`, `DataQualityPage`, y todos los `Reporte*Page`.

---

## 1b. Evaluación visual de los CRUDs genéricos

### El patrón de referencia sí existe
`shared/components/CrudModal.tsx` + `CrudActionButtons.tsx` + `ConfirmContext` + `ToastContext` + `SkeletonLoader` + `EmptyState` ya están construidos y son de calidad. **El problema no es que falte el sistema, es que solo 3 de 12 paneles lo usan** (`TicketsAdminPage`, `PublicidadAdminPage`, `AdminPartnersPage`). Los otros 9 reimplementan formularios en línea.

### Detalle por panel (≤ 3/5)

**W12 — CRUD de dimensiones (2/5) — el peor de los 12.**
- **Modal dual:** no. Formulario en línea que empuja la tabla hacia abajo.
- **Etiquetas:** son **los nombres crudos de las columnas de ClickHouse** (`fields.map(f => <label>{f}</label>`, `CrudDimensionesPage.tsx:61`). En cámara se lee `genero_id`, `es_activo`, `fecha_alta` — no «Género», «Activo», «Fecha de alta».
- **Tabla:** texto plano puro. Sin badges, sin colores semánticos, sin thumbnails.
- **Booleanos:** se editan con un `<select>` de `"true"`/`"false"` en texto (líneas 62-71).
- **Feedback:** sin `useToast` — el error se pinta como `<p className={styles.errorText}>`; el éxito no anuncia nada.
- **Sin skeleton, sin EmptyState.** Tiene `useConfirm` y paginación (`PAGE_LIMIT = 20`), eso sí.
- **Limitación estructural visible:** «crear» solo se habilita si la tabla ya tiene ≥1 fila (los campos se derivan de una fila-plantilla, comentario en líneas 12-19). En una tabla vacía el botón Crear simplemente no está.

**Mejoras para subirlo a 4-5/5 sin tocar lógica de negocio:**
1. Mapa `COLUMN_LABELS: Record<string,string>` para las ~40 columnas de las 11 DIM → etiquetas humanas; fallback a `f` para lo no mapeado.
2. Migrar el formulario a `CrudModal` (ya existe, modo dual crear/editar).
3. Añadir `useToast` en éxito/error de las 3 mutaciones.
4. Fila de KPIs sobre la tabla: total de filas, tabla seleccionada, última modificación.
5. Booleanos → badge verde/gris en la tabla y checkbox real en el form.
6. `SkeletonTableRows` durante la carga + `EmptyState` para tabla vacía.

**W10 — Catálogo/tracks (2.5/5).** Tiene confirm y toast pero la tabla es plana. Mejoras: thumbnail de portada en la 1.ª columna (**las portadas ya existen** — `gold.backfill_portadas` + `AlbumArt.tsx`; es el panel donde más se nota su ausencia), badge `activo`/`retirado`, KPIs (total / retirados / con portada), buscador por título-artista, `SkeletonTableRows`.

**W11 — Familia (2.5/5).** Mejoras: KPIs (familias, miembros, promedio), badge de rol titular/miembro, avatar del miembro, migrar el alta a `CrudModal`, `useConfirm` al eliminar miembro.

**W08 — Moderación social (3/5).** Ya tiene badges. Mejoras: KPIs (pendientes / resueltas hoy / tasa), filtro por tipo y estado, `SkeletonTableRows`, `useConfirm` en ocultar contenido (hoy es destructivo y ejecuta directo).

**W09 — Revisión de creadores (3/5).** Ya tiene KPIs. Mejoras: badge de estado de solicitud, avatar/foto del artista solicitante, filtro por estado, `useConfirm` en rechazar.

**W07 — Distribución (3.5/5).** Las 5 pestañas están bien; lo flojo es que cada una tiene su propio formulario en línea. Mejora de mayor impacto/esfuerzo: unificar las 5 al `CrudModal`.

### Design system
Todas las páginas admin comparten `SeguridadPages.module.css` y consumen variables (`--space-md`, `oklch(...)`), así que el look es consistente: Space Grotesk, paleta violet, radios y spacing por token. **La inconsistencia real no es de estilo sino de densidad**: unas páginas tienen KPIs+badges+filtros y otras son una tabla desnuda dentro del mismo chrome, lo que hace que las segundas parezcan «sin terminar» al navegar entre ellas en el vídeo.

⚠️ `shared/design-system/tokens.ts` y `shared/design-system/index.ts` son **stubs con un `// TODO` y nada más**. Los tokens reales viven en `index.css` como custom properties. No rompe nada, pero si abres esos archivos en cámara se ve un TODO.

---

## 2. Inventario de informes simples (consulta directa a ClickHouse, sin Gold)

`docs/BITACORA_S13.md` §1A documenta **27 informes simples, 26 con datos reales**. Verifiqué la clasificación y los endpoints clave por HTTP. **Confirmo el conteo**, con estas precisiones sobre el HEAD actual:

### Verificados con datos reales (respuesta HTTP OK y no vacía)

| Ruta frontend | Endpoint | Contenido | Datos | ⭐ |
|---|---|---|---|---|
| `/analitica/adquisicion` | `GET /analitica/adquisicion` | Tabla por canal + KPIs | ✅ 3.154 B | 4 |
| `/analitica/disponibilidad` | `GET /analitica/disponibilidad` | Línea de disponibilidad % por componente | ✅ 3.584 B | 4 |
| `/analitica/pnl` | `GET /analitica/pnl?desde&hasta` | 4 KPIs (ingresos, publicidad, regalías, margen) | ✅ margen 28.105,73 | 4 |
| `/analitica/mrr-arr` | `GET /analitica/mrr-arr?desde&hasta` | KPIs MRR/ARR + tendencia mensual | ⚠️ ver abajo | 3 |
| `/analitica/funnel-conversion` | `GET /analitica/funnel-conversion` | Embudo de 3 pasos | ✅ 15/67/32 | 3.5 |
| `/analitica/tendencias` | `GET /analitica/tendencias` | Línea de popularidad/energía por semana | ⚠️ ver abajo | 3 |
| `/seguridad/reporte-usuarios` | `GET /seguridad/admin/usuarios-reporte` | KPIs + tabla + filtros país/plan/rol/estado | ✅ | 4.5 |
| `/seguridad/reporte-strikes` | `GET /seguridad/admin/strikes` | KPIs activos/afectados/en riesgo + badges | ✅ | 4 |
| `/seguridad/sesiones-activas` | `GET /seguridad/admin/sesiones-activas` | KPIs + tabla + 4 filtros + refetch 30 s | ✅ | 4 |
| `/seguridad/auditoria` | `GET /seguridad/auditoria` | 50 eventos + dashboard | ✅ | 4 |
| `/seguridad/errores` | `GET /seguridad/errores` | 50 errores del sistema | ✅ | 3.5 |
| `/seguridad/reporte-notificaciones` | `GET /social/...` | KPIs total/tasa lectura + badges | ✅ | 4 |
| `/seguridad/reporte-familias` | — | KPIs familias/miembros/promedio + filtro plan | ✅ | 3.5 |
| `/seguridad/reporte-ab-tests` | — | KPIs experimentos/variantes/exposiciones | ✅ | 3.5 |
| `/seguridad/partners/metricas` | `GET /partners/...` | KPIs + badges + empty | ✅ | 3.5 |

### ⚠️ Tres informes simples que **no** deben salir en el vídeo

**S-A. `/analitica/reporte-diario` — sale vacío hoy.** Verificado:
```json
{"fecha":"2026-08-02","ingestas":{"corridas":0,"records_read":0,"records_inserted":0,
 "records_rejected":0,"statuses":[]},"engagement_por_tipo":[],"suscripciones":null,
 "adquisiciones":null,"nota":"Pendiente táctico: métricas de suscripciones (altas, bajas,
 churn) y adquisiciones no se incluyen aún — requieren el ETL de suscripciones
 PocketBase → ClickHouse, previsto para la capa táctica."}
```
Todo en cero/null **y** una nota que dice literalmente «Pendiente táctico … no se incluyen aún». Es el peor informe posible para grabar.

**S-B. `/analitica/mrr-arr` — la tendencia tiene un solo punto.** `tendencia_mensual` devuelve `[{"mes":"2026-07-01","ingreso":17294.66}]`. Un gráfico de línea con un único punto se ve roto. Los KPIs (MRR 4.389,79 / ARR 52.677,48) sí están bien; si lo usas, **muestra solo los KPIs**.

**S-C. `/analitica/tendencias` — la línea es plana.** `avg_popularity` es 45,29 · 45,22 · 45,30 · 45,18 · 45,23 · 45,31 · 45,19 · 45,31 · 45,20 · 45,09 para las semanas 2-11, con la semana 1 en 33,32. Visualmente: un escalón inicial y luego una recta horizontal. Además el eje X es `load_week` (semana sintética de carga del ETL, 1-11), no una fecha de calendario, lo que es difícil de explicar en cámara.

### Placeholders vivos en el sidebar
`/analitica/partners` y `/analitica/ingestas` siguen siendo `ComingSoonPage` («Próximamente») y **aparecen como enlaces normales en el menú de Analítica** (`AnalyticaShell.tsx:29-30`). Si el cursor pasa por ahí durante la demo, se ve una pantalla vacía de «próximamente».

---

## 3. Inventario de informes compuestos (capa Gold, puerto 8124)

### Arquitectura
- **1 ruta dinámica** (`/reportes/:departamento/:informe` → `InformeCompuestoPage.tsx`) que despacha sobre un registro de config (`packages/reportes/config/*.tsx`), no 30 páginas.
- **1 endpoint parametrizado** (`GET /app/v1/reportes/compuestos/{departamento}/{informe}`), respuesta uniforme `{datos, resumen}`.
- **6 plantillas reutilizables** en `shared/components/reportes/`: `KpiCards`, `TrendChart`, `PredictionChart`, `DistributionChart`, `RankingTable`, `ReportLayout`.
- **Lectura estrictamente desde Gold**: `paquetes/reportes/queries.py` va siempre por `core.database_gold` (8124), nunca agrega en caliente sobre el catálogo (8123).
- **DAG:** `dag_gold_aggregations` (`etl/dags/dag_gold_aggregations.py`), activo y despausado en Airflow.

### Verificación en vivo: **los 30 endpoints responden 200 con datos reales**

| Código | Ruta | Tabla Gold | Filas | Visualización | ⭐ |
|---|---|---|---|---|---|
| C01 | `comercial/adquisicion` | `GOLD_ADQUISICION_PERIODO` | 72 | KPIs + tendencia | 4 |
| C02 | `comercial/conversion` | `GOLD_ADQUISICION_PERIODO` | 48 | KPIs + tendencia | 4 |
| C03 | `comercial/suscripciones` | `GOLD_ADQUISICION_PERIODO` | 48 | Barras por plan | 4 |
| C04 | `tecnologia/api-consumo` | `GOLD_API_CONSUMO_PERIODO` | 60 | KPIs + tendencia | 4 |
| C05 | `tecnologia/disponibilidad` | `GOLD_INFRAESTRUCTURA_PERIODO` | 63 | Tendencia % | 4 |
| C06 | `tecnologia/errores` | `GOLD_INFRAESTRUCTURA_PERIODO` | 63 | Tendencia | 3.5 |
| C07 | `financiero/mrr-arr` | `GOLD_FINANCIERO_PERIODO` | 12 | KPIs + tendencia | 4 |
| C08 | `financiero/gastos-vs-ingresos` | `GOLD_FINANCIERO_PERIODO` | 12 | Multi-serie | 4.5 |
| C09 | `financiero/regalias` | `GOLD_REGALIAS_PERIODO` | 59 | KPIs + tendencia | ⚠️ ver abajo |
| C10 | `financiero/publicidad` | `GOLD_FINANCIERO_PERIODO` | 12 | Tendencia | 3.5 |
| C11 | `financiero/facturacion` | `GOLD_FINANCIERO_PERIODO` | 12 | KPIs + tendencia | 4 |
| C12 | `datos/pipeline` | `GOLD_PIPELINE_PERIODO` | 12 | KPIs + tendencia | 4 |
| C13 | `datos/calidad` | `GOLD_PIPELINE_PERIODO` | 12 | **5 KPIs** + distribución | 4.5 |
| C14 | `analitica/panel-ejecutivo` | `GOLD_ENGAGEMENT_PERIODO` | 12 | **4 KPIs + 2 gráficos multi-serie** | **5** |
| C15 | `analitica/ranking-generos` | `GOLD_CONSUMO_GENERO_PERIODO` | **180** | RankingTable | 4.5 |
| C16 | `analitica/series-temporales` | `GOLD_ENGAGEMENT_PERIODO` | 12 | Tendencia + media móvil | 4.5 |
| C17 | `analitica/proyeccion` | `GOLD_CONSUMO_GENERO_PERIODO` | 15 | **PredictionChart** (línea punteada 4 sem.) | **5** |
| C18 | `analitica/benchmark` | `GOLD_CONSUMO_GENERO_PERIODO` | 15 | Barras comparativas | 4 |
| C19 | `contenido/revision` | `GOLD_CONTENIDO_PERIODO` | 12 | KPIs + tendencia | 3.5 |
| C20 | `contenido/licencias` | `GOLD_CONTENIDO_PERIODO` | **4** | Distribución | 3 |
| C21 | `contenido/cobertura` | `GOLD_CONTENIDO_PERIODO` | **4** | Distribución | 3 |
| C22 | `comunidad/moderacion` | `GOLD_COMUNIDAD_PERIODO` | 12 | Tendencia | 3.5 |
| C23 | `comunidad/denuncias` | `GOLD_COMUNIDAD_PERIODO` | 12 | KPIs + tendencia | 3.5 |
| C24 | `comunidad/soporte` | `GOLD_COMUNIDAD_PERIODO` | 12 | KPIs + tendencia | 4 |
| C25 | `comunidad/interacciones` | `GOLD_COMUNIDAD_PERIODO` | 12 | Tendencia | 3.5 |
| C26 | `seguridad/auditoria` | `GOLD_SEGURIDAD_PERIODO` | **100** | RankingTable | 4 |
| C27 | `seguridad/sanciones` | `GOLD_SEGURIDAD_PERIODO` | 12 | KPIs + tendencia | 3.5 |
| C28 | `producto/recomendaciones` | `GOLD_PRODUCTO_PERIODO` | 12 | KPIs + tendencia | 4 |
| C29 | `producto/ab-tests` | `GOLD_PRODUCTO_PERIODO` | 60 | Barras por variante | 4 |
| C30 | `producto/notificaciones` | `GOLD_PRODUCTO_PERIODO` | 36 | KPIs + tendencia | 4 |

### Estado de la capa Gold
12 tablas `GOLD_*_PERIODO` + `GOLD_ETL_LOG` (24 registros de ejecución). Rango de períodos **2026-W20 → 2026-W31** en 11 de 12 tablas.

**⚠️ Hallazgo — `GOLD_REGALIAS_PERIODO` tiene períodos en el futuro.** Además del rango normal, contiene filas en `2026-W45`, `2026-W49`, `2027-W11`, `2027-W39` y `2028-W48` (2 filas cada uno) — vienen de registros de origen con `fecha_liquidacion` futura. El endpoint C09 los devuelve (59 filas, frente a 12 de los demás informes financieros), así que **el gráfico de C09 se dibuja con un eje X que llega hasta 2028 y un hueco enorme y vacío entre W31/2026 y W45/2026**.

Esto importa porque **`docs/BITACORA_S13.md` recomienda C09 como uno de los 3 informes compuestos del vídeo**. Con este dato a la vista, esa recomendación no se sostiene: o se acota el rango con el filtro de período (`?periodo_inicio=2026-W20&periodo_fin=2026-W31`) antes de grabar, o se sustituye por C08.

**⚠️ Gold está 2 días desactualizada.** Última ejecución en `GOLD_ETL_LOG`: **2026-07-30 07:42**. Hoy es 2026-08-01. El período máximo (W31) sigue siendo el actual, así que no se ve roto, pero conviene relanzar `dag_gold_aggregations` antes de grabar.

---

## 4. Sistema de roles y permisos

### a) Backend (FastAPI) — sólido, granular, con datos
Tres mecanismos que conviven, todos como **dependencias de FastAPI** (no decoradores ni middleware):

1. **`require_rol_admin(*roles)`** (`paquetes/seguridad/deps.py:41`) — autorización por área de negocio. 6 roles en `DIM_ROL_ADMINISTRATIVO`: `superadmin`, `admin_comercial`, `admin_finanzas`, `admin_datos`, `admin_contenido`, `admin_comunidad`. Se resuelven contra `BRIDGE_USUARIO_ROL_ADMIN` con `argMax` por fecha (revocación = borrado lógico). **No se cachea**, deliberadamente, para que una revocación surta efecto inmediato. `superadmin` siempre pasa. Una cuenta con `role=="admin"` en PocketBase se auto-refleja como `superadmin` (auto-backfill, líneas 24-38) — lo verifiqué creando una cuenta de prueba: funciona.
2. **`require_permiso(recurso, accion)`** (línea 107) — granularidad recurso/acción real, consultando `FACT_PERMISO_USUARIO` por `argMax`. `GET /seguridad/permisos/catalogo` devuelve 5 recursos (`analitica`, `biblioteca`, `seguridad.auditoria`, `seguridad.errores`, `seguridad.permisos`) × 2 acciones (`leer`, `escribir`). Aplicado **solo** a endpoints propios de `seguridad`, por decisión documentada.
3. **Gating de producto:** `require_b2c_user`, `verify_analytics_access`, `require_suscripcion_activa`, `require_tier("enterprise")`, `require_email_verificado`.

También hay control de **estado de cuenta**: `_rechazar_si_cuenta_inactiva` (`core/deps.py:21`) devuelve 403 en cada request si la cuenta está `suspendido`/`eliminado`, aunque el token de PocketBase siga vivo. Fail-open si ClickHouse no responde.

**Los 30 informes compuestos están mapeados por departamento → rol** (`paquetes/reportes/deps.py`), no gateados en bloque. Es un detalle que luce bien si lo mencionas.

### b) Frontend (React) — **aquí está la brecha real**
- El guard es `RequireAuth` (`packages/seguridad/components/RequireAuth.tsx`), 23 líneas: comprueba token en `localStorage` y, opcionalmente, `roles.includes(getRole())`.
- **`getRole()` lee únicamente el campo `role` de PocketBase** (`admin` / `analyst` / `user`) desde `localStorage` (`shared/lib/session.ts:31`). **El frontend no conoce los 6 roles administrativos granulares.**

Consecuencias concretas:
1. **Todo `role==='admin'` ve las 30+ entradas del sidebar de `/seguridad`.** No hay filtrado por rol granular: un `admin_finanzas` teórico no debería ver «Moderación social», pero el menú no lo contempla.
2. **Un usuario con rol granular pero sin `role==='admin'` en PocketBase no puede entrar a `/seguridad` en absoluto** — `RequireAuth roles={['admin']}` lo redirige a `/`. El backend le daría acceso a su área; el frontend se lo niega antes de intentarlo. El sistema de 6 roles es, en la práctica, **inobservable desde la UI**.
3. **Sin permiso, el usuario nunca ve un 403: es redirigido en silencio** a `/` (o a `/login`). No hay página de «acceso denegado».
4. El sidebar sí oculta por rol grueso: `/analitica` solo para `admin`/`analyst`, `/seguridad` solo para `admin`, y a `admin` se le ocultan `/suscripciones` y `/facturacion` (`AppShell.tsx:67-68, 85-86`). Eso funciona bien.

### c) Sesiones — buenas, pero de solo lectura en la UI
- **Panel:** sí, `/seguridad/sesiones-activas` (`SesionesActivasPage.tsx`). KPIs (sesiones abiertas, usuarios únicos), 4 filtros client-side, `refetchInterval: 30_000`, skeleton y empty state. Verificado con datos reales.
- **Registro por sesión:** `FACT_SESION` + `DIM_DISPOSITIVO`, con `dispositivo_tipo`, `dispositivo_os`, `fecha_inicio` y duración. El `dispositivo_id` es un UUID persistente por navegador (`session.ts:61`).
- **Cierre remoto:** el endpoint **existe** — `POST .../sesiones/{sesion_id}/cerrar` (`paquetes/seguridad/router.py:323`, `cerrar_sesion_remota`, con registro en auditoría). ⚠️ **Pero `SesionesActivasPage` no lo expone**: la tabla tiene 5 columnas (Usuario, Rol, Dispositivo, Inicio, Duración) y **ninguna columna de acciones**. La funcionalidad estrella del panel no es accesible desde la UI.
- **Expiración automática:** la delega PocketBase (`auth-refresh` en cada request); no hay política de expiración propia de Tracklytics.

### d) Auditoría — completa
- Tabla `FACT_AUDITORIA` (no `FACT_AUDIT`), escrita por un helper `audit.record(usuario_id, accion, tabla_afectada, antes, despues)` con **diff antes/después**. Se invoca desde las mutaciones de todas las capabilities (p. ej. `pago_suscripcion` en `facturacion/router.py:240`, `cerrar_sesion_remota` en seguridad).
- `GET /seguridad/auditoria` devuelve 50 eventos reales; `GET /seguridad/admin/dashboard` agrega acciones por día, errores 24 h y sesiones abiertas.
- Filtrado por usuario/acción/fecha: disponible.
- Aparte, `FACT_ERROR_SISTEMA` con correlación best-effort al usuario resuelto (`core/deps.py:51-55`), expuesto en `/seguridad/errores`.

### e) Calificación del módulo de seguridad: **4/5**
El backend es de 5. Lo que le falta a la **demo** son tres cosas, todas de frontend:
1. **Botón «Cerrar sesión» en la tabla de sesiones activas** — el endpoint ya existe; es el gesto más impresionante posible en cámara (cerrar la sesión de otro usuario y verla desaparecer del panel en el siguiente refetch de 30 s). Es la mejora de mayor impacto por menor esfuerzo de todo el informe.
2. **Mostrar los 6 roles administrativos en la UI** — hoy el trabajo de `require_rol_admin` es invisible. Al menos una columna de badges de rol en `UsuariosAdminPage` (que ya asigna/revoca roles) y un panel que liste rol → áreas cubiertas.
3. **Una página 403 real** en vez del redirect silencioso, para poder *enseñar* que el gating existe.

---

## 5. Bug del botón «Pagar» — confirmado, con tres defectos distintos

### Localización
No está en la página de suscripciones sino en **`packages/facturacion/pages/FacturacionPage.tsx`** (ruta `/facturacion`). El botón se renderiza en las líneas 424-434; la mutación es `pagar` (líneas 147-166); el backend es `POST /app/v1/facturacion/transacciones` → `pagar_suscripcion` → `procesar_pago` (`api/paquetes/facturacion/router.py:263` y `:195`).

### 5.1 ¿Cuándo aparece el botón?
Aparece si `suscripcion && suscripcion.monto > 0` (línea 424). Es decir:
- `role === 'admin'` → la página entera se sustituye por un mensaje (líneas 186-195). ✅
- Plan free (`monto === 0`) → mensaje «Tu plan actual es gratuito» con enlace a Mi Plan. ✅ (esto ya se corrigió en QA de S10 ronda 2, comentario en líneas 416-423)
- **Plan de pago activo → el botón aparece SIEMPRE, sin importar si el período en curso ya está pagado.** ❌ Este es el bug.

### 5.2 El endpoint permite invoices duplicadas — **verificado contra datos reales**
`procesar_pago` (líneas 195-260) hace, en orden: valida que el método de pago exista → decide éxito/fallo → inserta en `FACT_TRANSACCION_PAGO` → si es exitosa, inserta en `FACT_INVOICE` → registra notificación de correo → registra auditoría.

**No hay ninguna comprobación de idempotencia ni de período.** La única guarda es `require_suscripcion_activa` (`facturacion/deps.py:16`), que solo verifica que exista *alguna* suscripción activa. N clics = N transacciones + N invoices + N notificaciones de factura.

Y ya ocurrió en los datos actuales:
```
usuario           invoices  primera              última
5z4ier4d5xpuc0m      3      2026-07-13 05:15:43  2026-07-13 05:16:29   ← 3 facturas en 46 segundos
test-user            8      2026-05-31           2026-06-05            (4 el mismo día, dos veces)
u7fctd8ehnh9ygn      5      2026-07-05           2026-07-31
```

### 5.3 No se muestra el período de cobertura — **y no se puede mostrar hoy**
No es solo que la UI no lo pinte: **el dato no existe en ninguna capa**.
- `SuscripcionActiva` (frontend, `facturacion/types.ts:51-55`) tiene exactamente 3 campos: `tipo_plan`, `monto`, `moneda`.
- `FACT_INVOICE` (ClickHouse, verificado): `invoice_id, usuario_id, transaccion_id, monto, iva, fecha_emision, estado`. **Sin `periodo_inicio` / `periodo_fin`.**
- `FACT_TRANSACCION_PAGO`: `transaccion_id, usuario_id, metodo_pago_id, suscripcion_id, monto, moneda, estado, fecha, concepto`. **Igual, sin período.**
- En PocketBase solo hay `fecha_fin_trial` (para el trial de Premium), no un período de facturación.

### Corrección propuesta

**Cuándo debe aparecer el botón.** Regla: *hay un cargo pendiente para el período en curso*.

| Situación | Botón | Qué mostrar en su lugar |
|---|---|---|
| `role === 'admin'` | No | Mensaje actual ✅ |
| Sin suscripción activa | No | Enlace a Mi Plan ✅ |
| Plan free (`monto === 0`) | No | Mensaje actual ✅ |
| **Plan de pago, período en curso YA pagado** | **No** | **Badge «Al día» + «Cubierto hasta {fecha_fin}» + «Próximo cobro: {fecha}»** ← falta |
| Plan de pago, período en curso impago | **Sí** | Botón + «Cubre {fecha_inicio} → {fecha_fin}» ← falta |
| Plan de pago, último intento fallido | Sí | Botón «Reintentar pago» + banner del fallo |
| En trial | No | «Prueba gratuita hasta {fecha_fin_trial}» |

**Cambios necesarios, en orden de dependencia:**

1. **Datos (habilita todo lo demás).** Añadir `periodo_inicio` y `periodo_fin` (`Date`) a `FACT_TRANSACCION_PAGO` y `FACT_INVOICE`, y poblarlos en `procesar_pago` a partir de la fecha de alta de la suscripción y su ciclo mensual.
2. **Idempotencia en el backend.** En `procesar_pago`, antes de insertar y solo para `concepto == 'suscripcion'`: consultar si ya existe una transacción `exitosa` de ese `suscripcion_id` cubriendo el período actual; si la hay, devolver **409 Conflict** con el `invoice_id` existente en el detalle. Debe excluir `concepto == 'ajuste_prorrateo'`, que legítimamente puede repetirse en el mismo período (cambio de plan). Esto cierra el agujero aunque el frontend no cambie — y es la parte que de verdad importa, porque hoy el endpoint es reproducible con curl.
3. **Contrato de la API.** Extender `GET /facturacion/metodos-pago` para que `suscripcion` incluya `periodo_inicio`, `periodo_fin`, `pagado` (bool) y `proximo_cobro`; reflejarlo en `SuscripcionActiva` en `types.ts`.
4. **UI.** Condicionar el bloque de las líneas 424-463 a `!suscripcion.pagado`; añadir la línea de período bajo el botón y el badge «Al día» en la rama contraria. Deshabilitar el botón mientras `pagar.isPending` (ya lo hace) **y** tras un éxito, hasta que se invalide la query.
5. **Salvaguarda de UI.** Envolver el clic en `useConfirm` («Vas a cargar 9,99 € a tu Visa ···4242») — hoy ejecuta un cobro real directo, sin confirmación, en un botón que se puede pulsar repetidamente.

**Para el vídeo:** si no da tiempo a nada más, aplica el punto 2 (idempotencia backend, ~15 líneas). Es el que convierte «bug» en «regla de negocio implementada» si alguien pregunta.

---

## 6. Aspectos de mejora generales

### 6.1 Build y consola — limpio
`npm run build` compila sin errores (`✓ built in 15,64 s`). Sin imports rotos. La única advertencia es de tamaño de chunk: el bundle principal es **542,14 kB (160,32 kB gzip)**, por encima del umbral de 500 kB de Vite. No es un problema de demo; el code-splitting por rutas ya está muy trabajado (`lazyNamed` en `router.tsx`, con comentarios que documentan un hallazgo real de 445 kB → 805 kB por importar barrels).

### 6.2 Animaciones de Recharts — 7 gráficos sin `isAnimationActive={false}`
12 marcas ya lo tienen. Estas **7 no**, y animan al entrar:

| Archivo | Línea | Marca | Impacto en demo |
|---|---|---|---|
| **`shared/components/reportes/DistributionChart.tsx`** | **40** | `<Pie>` | **Alto — es una de las 6 plantillas de los 30 informes compuestos.** El `<Bar>` de la línea 76, en el mismo archivo, sí lo tiene |
| `shared/components/charts/MiniDonutChart.tsx` | 20 | `<Pie>` | Medio — componente compartido |
| `shared/components/charts/MiniBarChart.tsx` | 32 | `<Bar>` | Medio — componente compartido |
| `packages/finanzas/components/charts/RadialGauge.tsx` | 37 | `<RadialBar>` | Medio — dashboard de finanzas |
| `packages/finanzas/components/charts/IndicadoresRadar.tsx` | 45 | `<Radar>` | Medio — dashboard de finanzas |
| `packages/analitica/components/AudioRadarChart.tsx` | 74 | `<Radar>` | Bajo |
| `packages/ingesta/pages/DataQualityPage.tsx` | 81 | `<Pie>` | Bajo |

El de `DistributionChart` es el que hay que arreglar sí o sí: aparece en C13, C20, C21 y en el resto de informes con distribución.

### 6.3 Textos placeholder
- **`shared/design-system/tokens.ts`** y **`shared/design-system/index.ts`**: archivos que contienen únicamente un comentario `// TODO: …`. No se importan en runtime, pero son stubs sin resolver.
- **`ComingSoonPage`** en `/analitica/partners` y `/analitica/ingestas`, con enlaces visibles en el sidebar (ver §2).
- **Sin lorem ipsum** en ninguna parte. Los `placeholder=` encontrados (`"28001"`, `"Nombre o correo…"`, `"Buscar…"`) son placeholders legítimos de formulario.

### 6.4 Endpoints con datos vacíos o degradados
Ninguno devuelve 500. Los verificados como problemáticos son los de §2: `reporte-diario` (todo en cero + nota de «pendiente»), `mrr-arr` (tendencia de 1 punto), `tendencias` (línea plana sobre eje sintético).

### 6.5 Notas explicativas visibles al usuario
Dos endpoints devuelven un campo `nota` con texto que **se muestra en pantalla** y que reconoce limitaciones del modelo:
- `reporte-diario`: «Pendiente táctico: … no se incluyen aún …»
- `mrr-arr`: «La tendencia mensual aproxima el ingreso recurrente con lo efectivamente cobrado cada mes, no una reconstrucción de MRR punto-en-el-tiempo.»

La segunda es honesta y hasta suma rigor; la primera es un cartel de «sin terminar».

### 6.6 Estado de la infraestructura (verificado hoy)
| Servicio | Estado | Puerto |
|---|---|---|
| `pocketbase` | healthy | 8090 |
| `clickhouse` | healthy | 8123 |
| `clickhouse-gold` | healthy | 8124 |
| `api` | running, 282 endpoints en OpenAPI | 8000 |
| `frontend-react` | running, SPA fallback OK | **8082** |
| `airflow` | healthy (scheduler + triggerer + metadatabase) | 8080 |

⚠️ **El frontend está en el 8082, no en el 8080** (ahí está Airflow). Confírmalo antes de grabar para no abrir la URL equivocada en cámara.
⚠️ El DAG **`modelo_negocio_sync` está pausado**; los otros 7 activos.
ℹ️ Docker Desktop se había quedado colgado en «Starting Engine» al inicio de esta sesión; se resolvió con el procedimiento habitual (matar procesos zombie + `wsl --shutdown`, sin reiniciar).

---

## TOP 3 — Workpanels recomendados

1. **Campañas publicitarias** (`/seguridad/publicidad`) — **el más completo de los 12**: es el único que combina modal dual crear/editar, confirmación destructiva, toast, badges, skeleton, empty state y filtros. Además tiene transiciones de estado de negocio (pausar → reanudar → finalizar) que se demuestran solas y se ven en la tabla al instante.
2. **Tickets de soporte** (`/seguridad/soporte`) — el mismo patrón completo más KPIs sobre la tabla. Es el mejor para *explicar* el patrón, porque se construyó desde cero con `CrudModal`: el ciclo alta → edición → cambio de estado → cierre es un flujo de negocio narrable en 90 segundos.
3. **Partners** (`/seguridad/partners/gestion`) — CRUD completo con un gesto que ningún otro panel tiene: **rotar la API key** y ver el valor cambiar. Ojo: la desactivación no pide confirmación, así que hazla al final de la toma.

*Deliberadamente excluidos:* Usuarios y Suscripciones (buenos, pero sin modal dual, y su parte fuerte —los 6 roles administrativos— no es visible en la UI, §4b); CRUD de dimensiones (2/5, §1b).

## TOP 3 — Informes simples recomendados

1. **Reporte de usuarios** (`/seguridad/reporte-usuarios`) — el mejor de los 27: KPIs (total, países únicos, admins activos), chips por plan, badges y **4 filtros combinables** en vivo. Filtrar en cámara y ver los KPIs recalcular es la mejor toma disponible entre los simples.
2. **Sesiones activas** (`/seguridad/sesiones-activas`) — KPIs + 4 filtros + refresco automático cada 30 s + skeleton + empty state. Se puede *provocar el dato en directo*: abre una ventana de incógnito, inicia sesión con otra cuenta y la fila aparece sola en el panel. (Si añades el botón de cierre remoto —§4e.1—, este pasa al puesto 1 sin discusión.)
3. **Strikes globales** (`/seguridad/reporte-strikes`) — KPIs de activos/afectados/en riesgo con badge de origen y filtro. Datos reales y una historia de negocio clara.

*Alternativa segura:* `/analitica/adquisicion` o `/analitica/pnl` si prefieres un informe del árbol de Analítica en lugar del de Administración.
*No usar:* `reporte-diario` (vacío), `mrr-arr` (tendencia de 1 punto), `tendencias` (línea plana). Ver §2.

## TOP 3 — Informes compuestos recomendados

1. **C14 — Panel ejecutivo** (`/reportes/analitica/panel-ejecutivo`) — el más denso: 4 KPIs + 2 gráficos multi-serie sobre `GOLD_ENGAGEMENT_PERIODO`. Es el que mejor justifica visualmente por qué existe una capa Gold.
2. **C17 — Proyecciones** (`/reportes/analitica/proyeccion`) — el único que usa `PredictionChart`: línea sólida de histórico + **línea punteada de proyección a 4 semanas** con badge de «datos estimados». Es el gráfico más distintivo de los 30.
3. **C08 — Gastos vs. ingresos** (`/reportes/financiero/gastos-vs-ingresos`) — multi-serie financiera con los 12 períodos completos y sin huecos.

**Cambio respecto a `docs/BITACORA_S13.md`:** aquella recomendaba **C09 (regalías)** en este puesto. **No lo uses tal cual**: `GOLD_REGALIAS_PERIODO` contiene períodos en 2027 y 2028 (§3), así que el eje X se estira hasta 2028 con un hueco vacío enorme en medio. Si prefieres mantener C09, aplícale antes el filtro `?periodo_inicio=2026-W20&periodo_fin=2026-W31`.

*También muy demostrable:* C15 (ranking de géneros, 180 filas) y C13 (calidad de datos, 5 KPIs) — y **cambiar el filtro de período en vivo** funciona en los 30, que es la mejor forma de probar que los datos son reales.

---

## Correcciones necesarias antes de grabar (priorizadas)

| # | Corrección | Dónde | Esfuerzo | Por qué |
|---|---|---|---|---|
| **1** | `isAnimationActive={false}` en el `<Pie>` de `DistributionChart` | `shared/components/reportes/DistributionChart.tsx:40` | 1 línea | Afecta a varios de los 30 compuestos; el bug de animación de entrada es visible en cada carga |
| **2** | Acotar el período de C09 o sustituirlo por C08 | decisión de guion / `config/financiero.tsx` | 0-10 min | Evita el eje X hasta 2028 (§3) |
| **3** | Excluir `reporte-diario`, `mrr-arr` y `tendencias` del guion | guion | 0 | Los tres se ven vacíos o rotos (§2) |
| **4** | Relanzar `dag_gold_aggregations` | Airflow (8080) | 2 min | Gold lleva 2 días sin refrescar |
| **5** | Idempotencia en `procesar_pago` (409 si el período ya está pagado) | `api/paquetes/facturacion/router.py:195` | ~15 líneas | Bug §5.2, reproducible con curl; convierte un fallo en una regla de negocio |
| **6** | `isAnimationActive={false}` en los otros 6 gráficos | §6.2 | 6 líneas | Consistencia visual |
| **7** | Confirmar que la demo apunta al **8082** (no al 8080) | — | 0 | El 8080 es Airflow (§6.6) |
| **8** | Ocultar del sidebar `/analitica/partners` e `/analitica/ingestas` | `AnalyticaShell.tsx:29-30` | 2 líneas | Son «Próximamente» visibles en el menú |

## Mejoras opcionales que elevarían el vídeo

| Mejora | Dónde | Esfuerzo | Ganancia |
|---|---|---|---|
| **Botón «Cerrar sesión» en Sesiones activas** | `SesionesActivasPage.tsx` + `seguridad.api.ts` | ~20 líneas | **La mejor relación impacto/esfuerzo del informe.** El endpoint `cerrar_sesion_remota` ya existe y ya audita; solo falta la columna de acciones. Cerrar la sesión de otro usuario en directo es la toma más impresionante disponible |
| **Hacer visibles los 6 roles administrativos** | `UsuariosAdminPage` (columna de badges) | ~30 líneas | El trabajo de `require_rol_admin` hoy es invisible en la UI (§4b) |
| Elevar el CRUD de dimensiones (etiquetas humanas + `CrudModal` + toast + KPIs) | `CrudDimensionesPage.tsx` | ~2 h | Sube el panel más débil de 2/5 a 4/5 (§1b) |
| Thumbnail de portada en `AdminTracksPage` | `catalogo/pages/AdminTracksPage.tsx` | ~30 min | Las portadas ya existen (`gold.backfill_portadas`, `AlbumArt.tsx`) y es donde más se nota su ausencia |
| Página 403 real en vez del redirect silencioso | `RequireAuth.tsx` | ~20 líneas | Permite *enseñar* el gating en cámara en lugar de solo afirmarlo |
| `useConfirm` en el botón «Pagar» | `FacturacionPage.tsx:427` | ~10 líneas | Hoy cobra directo, sin confirmación |
| `useConfirm` en desactivar partner / rechazar creador / ocultar contenido | W03, W08, W09 | ~30 líneas | Las tres acciones destructivas que aún ejecutan directo |
| KPIs + badges + skeleton en W08/W09/W10/W11 | §1b | ~3 h | Elimina el salto de densidad al navegar entre paneles |
| Resolver los stubs de `shared/design-system/` | 2 archivos | ~15 min | Quita dos `// TODO` del repo |

---

### Nota de higiene
Esta auditoría creó una cuenta de prueba en PocketBase para verificar los endpoints con un token real: **`audit.s13@tracklytics.test`** (rol `admin` → `superadmin` por auto-backfill). Queda residual, igual que las cuentas de sesiones anteriores (`s13_admin_verif@test.com`, `s12_verify_admin`, `s10r2_*`). No se eliminó, siguiendo el criterio establecido en S12/S13. **No se modificó ningún archivo de código y no se hizo ningún commit.**
