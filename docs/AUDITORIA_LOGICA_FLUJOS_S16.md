# Auditoría de lógica y flujos — Tracklytics (S16)

> **Solo diagnóstico** — no se modificó ningún archivo. Complemento de
> `docs/AUDITORIA_VISUAL_COMPLETITUD_S16.md` (esa fue visual; esta es de lógica,
> flujos y arquitectura de información). Fecha: 2026-08-22.
> Método: lectura completa de las pantallas B2C clave (TrackDetail, CuentaArtista,
> Facturacion, InvoiceDetail, Planes, MisGanancias, Social), mapa de enlaces
> `<Link>`/`navigate()` de todo el frontend y verificación del backend de
> facturación/suscripciones/regalías (`api/paquetes/*`, `etl/gold/*`).

---

## Resumen ejecutivo

El sistema **funciona**, pero la experiencia descansa en tres supuestos frágiles:
que el usuario sabe que los comentarios existen (no hay puerta desde el detalle
del track), que el artista acepta vivir repartido en 3 módulos sin puentes
(`/creadores`, `/social`, `/regalias/ganancias`), y que el dinero se mueve solo
si alguien aprieta el botón correcto (renovación y dunning terminan dependiendo
de clics humanos o de un DAG que el propio código admite que "puede morir en
silencio").

| # | Hallazgo | Severidad | Referencia |
|---|---|---|---|
| F1 | Comentarios del track inaccesibles desde el detalle del track | **alta** | `TrackDetailPage.tsx:124-183` |
| F2 | La cara-del-artista vive repartida en 3 módulos sin ningún enlace cruzado | **alta** | `AppShell.tsx:52-59`; única salida de `/creadores`: `CuentaArtistaPage.tsx:484-488` |
| F3 | Renovación automática/dunning incompletos: DAG frágil que además ignora `pago_pendiente` | **alta** | `etl/gold/facturacion_recurrente.py:33-43,148` |
| F4 | Éxito de pago = dado aleatorio 90/10 con escotilla pública | media | `api/paquetes/facturacion/router.py:359-362` |
| F5 | Crédito por downgrade fantasma: asiento contable sin efecto real | media | `api/paquetes/suscripciones/router.py:356-363` |
| F6 | Factura sin folio legal (UUID truncado) ni PDF server-side | media | `init_clickhouse.py:452-462`; `InvoiceDetailPage.tsx:54,74` |
| F7 | Checkout inconsistente entre Mi Plan y Facturación | media | `PlanesPage.tsx:116-133,454-483` vs `FacturacionPage.tsx:330-500` |
| F8 | ArtistaSocialPage duplica el follow y es callejón sin salida | media | `ArtistaSocialPage.tsx:59-75,87-134` |
| F9 | Feed social no clicable; notificaciones nunca llevan al hilo de comentarios | media | `SeguidosSocialPage.tsx:127-138`; `NotificationBell.tsx:58` |
| F10 | Retiros congelados en `pendiente` sin SLA ni proceso automático | media | `regalias/router.py:553-559,613-640` |
| F11 | Trial expira solo si el usuario vuelve a entrar | media | `suscripciones/router.py:205-239` |
| F12 | Regalías: DAG liquida bruto, API liquida neto — doble estándar fiscal | media | `etl/gold/regalias_liquidacion.py:108-111` vs `regalias/router.py:466-477` |
| F13 | Menú "Distribución" promete gestión y entrega un checker geo; su tabla no enlaza al catálogo | baja | `DisponibilidadPage.tsx:151-160` |
| F14 | Perfil público sin retorno al perfil privado siendo dueño (`es_propio`) | baja | `PerfilPublicoPage.tsx:63` |
| F15 | Alias muerto `/catalog`; `/perfil`, `/soporte`, `/regalias/ganancias` con entrada única | baja | `router.tsx:196`; `UserMenu.tsx:60` |

---

## 1 · Flujos evaluados en detalle

### F1 — Comentarios: existen, pero invisibles donde se escucha música (ALTA)

**Estado actual:** el hilo de comentarios vive en `/social/track/:factId`
(`TrackSocialPage`). Sus únicas entradas son la lista de seguidos (búsqueda
manual con TrackPicker, `SeguidosSocialPage.tsx:189`) y el botón "Comentarios"
que ve el artista en sus propios tracks (`CuentaArtistaPage.tsx:485`). El
detalle del track —donde ya conviven favoritos, like/dislike y cola— **no tiene
ni un enlace** a comentarios (`TrackDetailPage.tsx:124-183`). Peor aún:
`PlayerBar.tsx:65` y `NotificationBell.tsx:58` enlazan siempre al catálogo,
aunque la notificación sea justamente un comentario nuevo. Y `TrackSocialPage`
muestra track/artista como texto plano (`:104-105`), sin volver nunca al
detalle del catálogo: el hilo es una isla bidireccionalmente.

**Flujo objetivo:** comentar/debería ser una acción más del detalle (botón o
sección "Comentarios (N)" al fondo), con `/social/track/:factId` como ruta
profunda reutilizada — no hace falta duplicar UI, solo abrir la puerta.
Recíproco: el hilo social debería enlazar de vuelta al track del catálogo.

### F2 — El artista vive en 3 módulos sin puentes (ALTA)

Tareas naturales del artista y dónde viven hoy:

| Tarea | Módulo/ruta | Enlace desde Creadores |
|---|---|---|
| Subir/editar/retirar tracks | `/creadores` | — |
| Leer/responder comentarios | `/social/track/:factId` | sí, único puente (`CuentaArtistaPage.tsx:485`) |
| Ver cuánto ganó y retirar | `/regalias/ganancias` | **ninguno** (única entrada global: menú "Más", `AppShell.tsx:58`) |
| Ver cómo suena su catálogo ante el público | `/catalogo/artista/:id` | ninguno |
| Estado de revisión admin | `/creadores` (badges) | — |

Además `CuentaArtistaPage` es una sola página larga donde el formulario de
subida (siempre desplegado, `:358-451`) domina sobre los tracks ya publicados:
para un artista con catálogo crecido, lo ocasional (subir) desplaza a lo
frecuente (gestionar). No hay métricas propias (plays/likes por track) ni
resumen de saldo en la vista de artista: hay que salir a otro módulo para
saber si el proyecto funciona. **Compactar** = jerarquía por frecuencia de uso
(gestión arriba, subida colapsable) + puentes visibles a ganancias/comentarios
/catálogo público.

### F3+F4 — Ciclo de vida del dinero: lo automático es frágil y el motor es un dado (ALTA/MEDIA)

**Lo que ya está bien** (no es todo crítico): idempotencia real de cobros (409
si el período ya está pagado, `facturacion/router.py:343-357`), checkout con
Luhn/expiración/CVV/dirección (`FacturacionPage.tsx:330-500`, datos de tarjeta
nunca persistidos), IVA por país con override global, factura imprimible con
datos fiscales editables (`InvoiceDetailPage` + CU-O81), trial 7 días, prorrateo
en cambio de plan, dunning de 3 intentos con degradación.

**Huecos, en orden de impacto:**

1. **Renovación automática existe pero es frágil**: DAG semanal
   (`finanzas_periodicas_dag.py:26`) que renueva suscripciones ≥30 días; el
   propio código advierte que "el scheduler de Airflow puede morir en silencio"
   (`facturacion_recurrente.py:33-36`). Peor: tras un fallo la suscripción pasa
   a `pago_pendiente` y **sale del filtro `estado="activa"`** del DAG
   (`:43,148`) — los reintentos solo ocurren si el usuario hace clic en
   "Reintentar cobro" (`PlanesPage.tsx:314-330`). Un sistema financiero real no
   espera al deudor.
2. **Motor de pago = `random.random() < 0.9`** (`facturacion/router.py:362`)
   con parámetro `forzar_resultado` accesible desde el endpoint público
   (`:296`) — cualquier usuario puede forzar éxito. Sin declinación por fondos/
   expiración/CVV; la tarjeta solo valida formato.
3. **Crédito de downgrade fantasma** (CU-O94): el ajuste negativo se registra
   como transacción `'exitosa'` pero no genera saldo utilizable ni compensa el
   siguiente cobro (`suscripciones/router.py:356-363`; comentario literal:
   "crédito informativo, sin cobro real").
4. **Método "más reciente gana"**: la renovación automática cobra con el último
   método registrado del usuario (`ORDER BY creado_en DESC LIMIT 1`,
   `facturacion_recurrente.py:82-91`), no el asociado a la suscripción.
5. **Trial huérfano**: la expiración es perezosa ("verificación en el próximo
   acceso", `suscripciones/router.py:216-222`) — un usuario que no vuelve deja
   su trial `activa/en_prueba` indefinidamente, y si vuelve pasados 30+ días el
   DAG podría tratarlo como renovación normal.
6. **Notificaciones unidireccionales**: solo se registra la factura de pago
   exitoso (`facturacion/router.py:307-321`, estado hardcodeado `'enviado'`).
   No hay aviso de cobro fallido, pre-vencimiento de trial, ni recibo de
   cancelación — el buzón simulado queda medio vacío frente al ciclo real.

### F6+F7 — Facturación/suscripciones: realismo percibido

- **Folio de factura = UUID truncado** (`InvoiceDetailPage.tsx:74`:
  `invoice_id.slice(0,8)`; PK `generateUUIDv4()` en `init_clickhouse.py:452-462`).
  Lo primero que rompe la ilusión fiscal es una factura sin numeración secuencial
  (serie + consecutivo). El PDF es `window.print()` (`:54`) mientras que jsPDF
  ya existe en el proyecto (`ExportPDFButton`) para reportes admin.
- **Checkout inconsistente**: desde Mi Plan se agrega método con solo
  tipo+4 dígitos (`PlanesPage.tsx:454-483`, sin Luhn ni dirección); desde
  Facturación exige Luhn+expiración+CVV+país+código postal. Dos niveles de
  rigor para el mismo objeto (`DIM_METODO_PAGO`) según la puerta de entrada.
- **Moneda**: facturas sin moneda propia (JOIN a la transacción,
  `queries.py:87-95`); formateo inconsistente (`fmt` default EUR en
  FacturacionPage vs USD en MisGananciasPage).

### F10+F12 — Regalías: liquidación sólida, salida del dinero congelada

La liquidación está bien resuelta (pool 70% rightsholders, split master/
publishing 80/20, idempotente por período). Los huecos:

1. **Retiros eternamente pendientes**: solicitar retiro descuenta saldo (bien,
   evita doble gasto, `regalias/queries.py:141-150`) pero nadie lo procesa jamás
   salvo un admin a mano (`regalias/router.py:613-640`); no hay payout batch ni
   SLA simulado. Para el artista, "Solicitar retiro" es tirar dinero a un pozo.
2. **Doble estándar fiscal**: la API liquida neto (retención por país,
   `router.py:466-477`); el DAG liquida bruto sin columnas de retención
   (`regalias_liquidacion.py:108-111`, defaults 0). El mismo período por caminos
   distintos rinde montos distintos para el mismo artista.

---

## 2 · Arquitectura de información: qué agrupar, qué separar

### 2a · Dinero del usuario: dos páginas para un mismo dominio

"Mi Plan" (`/suscripciones`, nav **primario**) y "Facturación" (`/facturacion`,
dentro de "Más") son el mismo dominio partido en dos niveles de nav. Ya hoy se
necesitan mutuamente: el upgrade rebota a Facturación si falta método de pago
(`PlanesPage.tsx:201-207`), y Facturación manda a Mi Plan para cambiar de plan
(`FacturacionPage.tsx:573`). **Propuesta:** zona única "Suscripción y pagos"
(con pestañas Plan / Métodos / Historial / Facturas), o al menos subrutas
hermanas (`/cuenta/plan`, `/cuenta/pagos`) con nav consistente. Elimina el
rebote a mitad del flujo de upgrade.

### 2b · Cara-del-artista: consolidar en un hub

Creadores (música), Regalías (dinero) y Comentarios (social) deberían ser una
sola zona con navegación interna — hoy tres entradas distintas del menú "Más"
sin cross-links (ver F2). Ni siquiera hace falta mover backend: un hub con
pestañas (Música / Ganancias / Comentarios) que agrupe las rutas existentes
resuelve la dispersión. La página de ganancias ya tiene pestañas
artista/sello (`MisGananciasPage.tsx:185-202`), el patrón existe.

### 2c · Social: fusionar el follow, abrir los comentarios

El botón "Seguir" está implementado **dos veces** (`ArtistDetailPage.tsx:43-59`
y `ArtistaSocialPage.tsx:59-75`, mismas mutaciones); la segunda versión añade
solo "Compartir" y su página es un callejón sin salida accesible únicamente
desde la lista de seguidos (única entrada en toda la app,
`SeguidosSocialPage.tsx:172`). **Propuesta:** comentarios dentro del detalle
(F1), follow vive solo en el catálogo, `/social/artista/:id` o se fusiona con
`ArtistDetailPage` o redirige a ella; el feed de actividad debería ser clicable
(hoy las filas "X comentó…" son texto plano, `SeguidosSocialPage.tsx:127-138`).

### 2d · "Distribución": un nombre, tres conceptos

(a) checker geo B2C (`/distribucion/disponibilidad`), (b) salud de infraestructura
(`/analitica/disponibilidad` — el router ya documenta la colisión,
`router.tsx:268-269`), (c) administración de restricciones (`/seguridad/distribucion`).
Para el B2C, el valor real (bloqueos en tu país) ya se comunica al reproducir
(`TrackDetailPage.tsx:133-139`); la página aparte con tabla no-enlazable
(`DisponibilidadPage.tsx:151-160`) compite de nombre y diluye el menú.
**Propuesta:** renombrar la entrada B2C a algo literal ("Disponibilidad por país")
o integrarla como estado por-track, y reservar "Distribución" para admin.

### 2e · Perfil público ↔ privado

Conexión unidireccional (`ProfilePage.tsx:462` → público; el público nunca
devuelve aunque `es_propio`, `PerfilPublicoPage.tsx:63`). Menor, pero cierra el
círculo de identidad: siendo dueño, ofrecer "editar mi perfil".

---

## 3 · Ranking priorizado de mejoras de flujo

| # | Mejora | Por qué primero |
|---|---|---|
| 1 | **Comentarios accesibles desde TrackDetailPage** (sección/enlace a `/social/track/:id` + vuelta al catálogo desde el hilo) | Es la brecha más sentida por el usuario B2C: la interacción social estrella existe pero está oculta. Costo bajo (rutas y UI ya existen). |
| 2 | **Hub de artista** (Creadores + Ganancias + Comentarios con pestañas/puentes; subida colapsable, métricas básicas arriba) | Resuelve F2 completo y compacta Creadores: frecuencia de uso manda sobre el formulario de subida. |
| 3 | **Ciclo de cobro autónomo**: DAG reintenta `pago_pendiente`, quita `forzar_resultado` del endpoint público (o muévelo a seed/admin-only), avisos de cobro fallido/pre-trial | Hace que el dinero se comporte como dinero incluso sin interacción humana; arregla el dunning inalcanzable por diseño (F3). |
| 4 | **Zona única Suscripción y pagos** (plan+métodos+historial+facturas) con checkout consistente (un solo nivel de rigor) | Elimina rebotes entre módulos y la inconsistencia F7; simplifica el nav primario. |
| 5 | **Realismo fiscal mínimo**: folio secuencial de factura + retiros con SLA simulado (auto-procesado o estado "en tránsito") | Son los dos detalles que más delatan simulación ante un evaluador (F6/F10), con costo acotado. |

*Correcciones triviales adicionales: fusionar follow duplicado y resolver destino
de `/social/artista/:id` (F8), filas del feed clicables (F9), retorno perfil
público→privado (F14), retirar alias `/catalog` o documentarlo como compat.*

