# Objetivos de Tracklytics

**Proyecto:** Tracklytics — plataforma de analítica musical B2C/B2B
**Fecha de generación:** 2026-07-29
**Versión del documento:** 1.0 (S13-P1)

Este documento consolida la pirámide completa de objetivos del sistema — estratégicos, tácticos y operativos — y su trazabilidad hasta la capability real que los soporta. Se generó auditando el estado real del código (rutas de frontend, endpoints de backend, specs de OpenSpec) al 2026-07-29; el detalle de esa auditoría vive en `docs/BITACORA_S13.md`.

## Índice

1. [Objetivos Estratégicos](#1-objetivos-estratégicos)
2. [Objetivos Tácticos](#2-objetivos-tácticos)
3. [Objetivos Operativos](#3-objetivos-operativos)
4. [Matriz de trazabilidad](#4-matriz-de-trazabilidad)

---

## 1. Objetivos Estratégicos

### OE1 — Penetración de Mercado Digital y Adquisición Automatizada (Growth Hacking B2B2C)

Capturar una masa crítica de usuarios finales (B2C freemium) y clientes B2B internacionales mediante flujos de captación 100% digitales, minimizando infraestructura comercial física.

**KPIs:** CAC internacional B2C y B2B · tasa de conversión freemium→premium por región · tasa de conversión del embudo B2B por región.

### OE2 — Escalabilidad Comercial Exponencial vía Plataformas de Ecosistema (Marketplaces y APIs)

Integrar la oferta analítica dentro de las infraestructuras de software que ya usan sellos, distribuidoras y agregadores, sin necesidad de fuerza de ventas directa.

**KPIs:** % de ingresos recurrentes (ARR/MRR) generados vía integraciones API · número de conexiones activas de partners/integradores externos.

### OE3 — Expansión Continua sobre Infraestructura Cloud de Alta Disponibilidad

Garantizar que el pipeline de datos y la aplicación mantengan el mismo rendimiento en cualquier región, permitiendo escalar bajo demanda sin restricciones geográficas.

**KPIs:** Uptime global > 99.9% · tiempo de despliegue de nuevas funcionalidades en regiones internacionales.

### OE4 — Inteligencia de Negocio Centralizada para Ventaja Competitiva Global

Recolectar y procesar datos del comportamiento de los distintos mercados internacionales para tomar decisiones de producto, precio y operación de forma rápida.

**KPIs:** Tiempo de respuesta para decisiones estratégicas basadas en datos · tasa de retención de clientes B2B internacionales.

---

## 2. Objetivos Tácticos

35 objetivos repartidos en 9 departamentos. Cada uno indica su tipo (Simple / Compuesto / Ambos) y el informe que lo resuelve.

### Departamento 1 — Comercial y Marketing (Director Comercial Internacional)

| # | Objetivo | Tipo | Informe |
|---|---|---|---|
| OT-01 | Captación y registro de usuarios en mercados internacionales | Ambos | **Simple:** panel con indicadores de distribución por plan, país y rol, con listado filtrable de usuarios registrados. **Compuesto:** embudo de conversión por etapa y costo de adquisición por mercado |
| OT-02 | Conversión de usuarios gratuitos a suscriptores de pago | Compuesto | Tasa de conversión free-to-paid y deserción por región y período |
| OT-03 | Seguimiento del portafolio de suscripciones activas | Ambos | **Simple:** listado de suscripciones vigentes con plan, estado, titular y fecha de inicio. **Compuesto:** distribución de suscriptores por plan y tendencia mensual |

### Departamento 2 — Tecnología (CTO)

| # | Objetivo | Tipo | Informe |
|---|---|---|---|
| OT-04 | Administración de clientes B2B y su consumo de servicios | Ambos | **Simple:** listado de partners activos con tier contratado, fecha de alta y estado. **Compuesto:** volumen de llamadas a la API por partner y tier, con tasa de éxito y latencia promedio |
| OT-05 | Disponibilidad de la infraestructura tecnológica | Ambos | **Simple:** estado actual de cada componente de infraestructura por región. **Compuesto:** tasa de disponibilidad histórica e incidentes por componente y período |
| OT-06 | Detección y seguimiento de errores del sistema | Ambos | **Simple:** listado de errores activos no resueltos con servicio afectado y severidad. **Compuesto:** tendencia de errores por servicio y período |

### Departamento 3 — Financiero (CFO)

| # | Objetivo | Tipo | Informe |
|---|---|---|---|
| OT-07 | Ingresos recurrentes y salud financiera consolidada | Compuesto | MRR, ARR, margen neto y estado de resultados por período |
| OT-08 | Control de gastos operativos y reembolsos procesados | Ambos | **Simple-a:** listado de gastos por categoría y estado. **Simple-b:** listado de reembolsos con monto y transacción asociada. **Compuesto:** comparativa de gastos vs ingresos por período |
| OT-09 | Liquidación y distribución de regalías a titulares de derechos | Ambos | **Simple:** listado de contratos de regalía vigentes con titular, porcentaje y tipo. **Compuesto:** liquidaciones agregadas por contrato, sello y período |
| OT-10 | Monetización por publicidad digital | Ambos | **Simple:** listado de campañas activas con presupuesto, anunciante y fechas. **Compuesto:** ingresos publicitarios por formato y anunciante por período |
| OT-11 | Facturación y estado de cobros a suscriptores | Ambos | **Simple:** panel de facturas emitidas con estado de pago, monto y suscriptor. **Compuesto:** volumen de facturación y tasa de cobro exitoso por período |

### Departamento 4 — Ingeniería de Datos (Ingeniero Jefe de Datos)

| # | Objetivo | Tipo | Informe |
|---|---|---|---|
| OT-12 | Monitoreo de la carga y actualización del catálogo musical | Ambos | **Simple:** dashboard del pipeline con estado, duración, gráficos y registros procesados. **Compuesto:** tendencia de duración y volumen de ingesta por semana |
| OT-13 | Control de calidad de los datos incorporados al sistema | Compuesto | Distribución por tipo de fuente y % de registros válidos por lote |
| OT-14 | Administración de los datos maestros del modelo | Simple | Listado de registros de cualquier tabla de referencia del sistema |

### Departamento 5 — Analítica y BI (Analista de Datos / Líder BI)

Sin informes simples — los 5 objetivos son exclusivamente compuestos.

| # | Objetivo | Tipo | Informe |
|---|---|---|---|
| OT-15 | Indicadores clave de rendimiento del negocio | Compuesto | Panel ejecutivo con métricas consolidadas de engagement, adquisición y retención |
| OT-16 | Tendencias de consumo por género musical y artista | Compuesto | Ranking de géneros y artistas por volumen de reproducción con variación porcentual |
| OT-17 | Evolución temporal de las métricas de consumo | Compuesto | Series temporales de reproducciones, engagement y popularidad con promedios móviles |
| OT-18 | Proyecciones predictivas sobre mercados emergentes | Compuesto | Modelos de regresión lineal con proyección a 4 semanas por género y artista |
| OT-19 | Comparación del consumo interno frente al mercado externo | Compuesto | Benchmark de popularidad interna vs índice externo por género |

### Departamento 6 — Contenido y A&R (Gerente de Contenido y A&R)

| # | Objetivo | Tipo | Informe |
|---|---|---|---|
| OT-20 | Revisión y aprobación de artistas y material musical nuevo | Ambos | **Simple:** dashboard de solicitudes pendientes con KPIs de aprobación y listado de artistas/tracks en revisión. **Compuesto:** tasa de aprobación/rechazo y tiempo promedio de resolución |
| OT-21 | Licenciamiento del catálogo por sello discográfico y territorio | Ambos | **Simple:** listado de licencias vigentes con sello, territorios cubiertos y fechas. **Compuesto:** cobertura del catálogo por territorio y canal |
| OT-22 | Tramitación de solicitudes de licencia de distribución | Simple | Listado de solicitudes de licencia pendientes con solicitante y territorio |
| OT-23 | Disponibilidad global del catálogo por canal de distribución | Ambos | **Simple:** listado de restricciones geográficas activas por territorio y tipo. **Compuesto:** análisis de cobertura del catálogo por país y canal |

### Departamento 7 — Comunidad y Soporte (Community Manager)

| # | Objetivo | Tipo | Informe |
|---|---|---|---|
| OT-24 | Moderación del contenido generado por usuarios | Ambos | **Simple:** dashboard de moderación con gráficos de actividad y listado de comentarios pendientes. **Compuesto:** volumen de moderación por tipo de acción y período |
| OT-25 | Gestión de denuncias y reportes de la comunidad | Ambos | **Simple:** panel de denuncias pendientes con KPIs, badges de origen y filtros. **Compuesto:** tendencia de denuncias por tipo y relación con sanciones aplicadas |
| OT-26 | Atención y resolución de solicitudes de soporte | Ambos | **Simple:** panel de tickets abiertos con KPIs de resolución, badges de prioridad y filtros. **Compuesto:** tiempo promedio de resolución y distribución por categoría y período |
| OT-27 | Nivel de actividad y participación social de la comunidad | Compuesto | Interacciones totales por tipo y período con indicadores de crecimiento |

### Departamento 8 — Seguridad y Administración TI (Gerente de Seguridad)

| # | Objetivo | Tipo | Informe |
|---|---|---|---|
| OT-28 | Control de accesos, roles y estado de las cuentas del sistema | Simple | Panel de usuarios con filtros por rol y estado, badges de estado de cuenta y detalle 360° por usuario |
| OT-29 | Auditoría de seguridad y trazabilidad de acciones administrativas | Ambos | **Simple:** dashboard de auditoría con KPIs y gráficos de eventos por tipo y período. **Compuesto:** tendencia de eventos de auditoría por tipo de acción y período |
| OT-30 | Supervisión de sesiones activas y dispositivos registrados | Simple | Listado de sesiones abiertas con usuario, dispositivo y dirección IP |
| OT-31 | Gestión de sanciones y estado disciplinario de usuarios | Ambos | **Simple:** panel de strikes activos con KPIs de riesgo, badges de origen y filtro por tipo. **Compuesto:** tendencia de sanciones y tasa de suspensión automática por período |

### Departamento 9 — Producto (Gerente de Producto)

| # | Objetivo | Tipo | Informe |
|---|---|---|---|
| OT-32 | Efectividad del sistema de recomendaciones personalizadas | Ambos | **Simple:** listado de recomendaciones recientes con indicador de reproducción posterior. **Compuesto:** tasa de conversión de recomendación a reproducción por período |
| OT-33 | Programa de experimentación y pruebas A/B | Ambos | **Simple:** panel de experimentos con KPIs de exposiciones por variante y estado vacío contextual. **Compuesto:** resultados por variante con métricas de impacto y significancia |
| OT-34 | Gestión de notificaciones al usuario | Ambos | **Simple:** panel con KPIs de tasa de lectura, filtros por tipo/estado y badges de lectura. **Compuesto:** volumen de notificaciones y tasa de interacción por tipo y período |
| OT-35 | Administración de planes familiares y cuentas compartidas | Simple | Panel con KPIs de familias, miembros y promedio, con filtro por plan |

### Resumen cuantitativo

- Departamentos: **9**
- Objetivos tácticos: **35**
- Solo informe simple: 5 (OT-14, OT-22, OT-28, OT-30, OT-35)
- Solo informe compuesto: 9 (OT-02, OT-07, OT-13, OT-15, OT-16, OT-17, OT-18, OT-19, OT-27)
- Ambos tipos: 21
- Total informes simples: **27** (OT-08 produce 2: gastos y reembolsos)
- Total informes compuestos: **30**

---

## 3. Objetivos Operativos

Un objetivo operativo (OO) por cada capability funcional real de los 14 paquetes de negocio del sistema. Cada uno enlaza al objetivo estratégico (OE) que soporta y a las metas verificables derivadas de lo que la capability realmente hace (evidenciado por sus endpoints).

### Analítica (`analitica`)

Panel analítico del catálogo para Cliente B2B y el equipo interno de Datos/BI: KPIs, perfiles de audio, comparación de artistas, tendencias, engagement y proyecciones.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-ANA-01 | Ofrecer un dashboard ejecutivo con KPIs agregados del catálogo y tendencias por género | Endpoints de dashboard/tendencias devuelven datos reales sobre el catálogo vigente | OE4 |
| OO-ANA-02 | Proveer analítica comparativa entre artistas y géneros, incluido benchmark | Comparación soporta ≥2 artistas/géneros simultáneos con métricas de audio reales | OE4 |
| OO-ANA-03 | Calcular tendencias, engagement relativo y proyecciones estadísticas para tiers Pro/Enterprise | Proyección entrega horizonte de 4 semanas por género/artista | OE4 |
| OO-ANA-04 | Reportar métricas operativas de adquisición, disponibilidad de infraestructura y reporte diario | Reporte diario disponible para revisión administrativa | OE1, OE3 |
| OO-ANA-05 | Exponer indicadores financieros y de retención del negocio (churn, funnel, P&L, MRR/ARR) | Cifras cuadran con el registro de transacciones/suscripciones subyacente | OE4, OE1 |

### Biblioteca personal (`biblioteca`)

Gestión de la biblioteca personal del usuario B2C (favoritos, playlists, historial de reproducción). Sin OT propio en la Sección 2 — soporta indirectamente la retención B2C (OE1).

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-BIB-01 | Gestionar favoritos con límite aplicado según plan (free vs. premium) | El límite de 20 ítems se aplica y se refleja en la respuesta del endpoint | OE1 |
| OO-BIB-02 | Registrar historial de reproducción respetando restricciones geográficas | Un track bloqueado en el país del usuario no se registra en el historial | OE1, OE3 |
| OO-BIB-03 | Permitir creación, edición y reordenamiento de playlists propias | Operaciones CRUD completas sobre una playlist de prueba | OE1 |
| OO-BIB-04 | Habilitar playlists colaborativas y control de visibilidad pública/privada | Un colaborador agregado puede modificar la playlist compartida | OE1 |

### Catálogo (`catalogo`)

Exploración del catálogo musical global y consulta de detalle de cualquier entidad musical. Soporta el consumo B2C (OE1); el takedown administrativo también sostiene el cumplimiento de licencias (enlaza con distribución, OE2).

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-CAT-01 | Ofrecer búsqueda unificada y por entidad sobre el catálogo musical | Búsqueda por texto libre devuelve resultados en tracks/artistas/álbumes | OE1 |
| OO-CAT-02 | Exponer el detalle completo de tracks, artistas, álbumes y géneros | Cada endpoint de detalle responde con el conjunto completo de atributos del modelo dimensional | OE1 |
| OO-CAT-03 | Restringir características de audio avanzadas a suscriptores premium | Un usuario free recibe 403 al pedir audio-features de un track | OE1 |
| OO-CAT-04 | Permitir el retiro (takedown) y restauración administrativa de tracks del catálogo público | Un track oculto deja de aparecer en búsquedas públicas | OE2, OE3 |

### Creadores (`creadores`)

Solicitud/aprobación de cuenta de artista y subida de tracks propios revisados editorialmente antes de promoverse al catálogo real.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-CRE-01 | Resolver solicitudes de cuenta de artista (aprobar/rechazar) | Cola de solicitudes pendientes se vacía tras cada resolución | OE2 |
| OO-CRE-02 | Revisar editorialmente los tracks subidos y promoverlos al catálogo real | Un track aprobado aparece en `catalogo` tras la resolución | OE2 |
| OO-CRE-03 | Permitir que el artista edite o retire (takedown) sus propios tracks | El artista dueño puede retirar un track sin intervención de admin | OE2 |
| OO-CRE-04 | Reportar métricas administrativas del flujo de creadores | Dashboard admin refleja el conteo real de cuentas/tracks por estado | OE4 |

### Distribución (`distribucion`)

Administración de sellos, licencias por país y restricciones de reproducción, con verificación automática al reproducir o consultar disponibilidad.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-DIS-01 | Administrar sellos discográficos y su asignación a artistas/álbumes | Un álbum reasignado de sello refleja el cambio en su ficha | OE2 |
| OO-DIS-02 | Gestionar licencias de distribución y su flujo de solicitud/aprobación/rechazo/revocación | Una licencia revocada deja de habilitar reproducción en su territorio | OE2 |
| OO-DIS-03 | Aplicar restricciones de reproducción por track/país/canal en tiempo real | Un track restringido en un país es bloqueado al reproducirse desde ahí | OE2, OE3 |
| OO-DIS-04 | Configurar moneda, tasa de cambio, IVA y retención fiscal por país | Un país activado expone su configuración fiscal al resto del sistema (facturación, regalías) | OE3 |
| OO-DIS-05 | Consultar disponibilidad del catálogo por país | Endpoint de disponibilidad responde consistente con las restricciones vigentes | OE2, OE3 |

### Experiencia de usuario (`experiencia`)

Telemetría de consumo real, canal de soporte, reflejo analítico de playlists, plan familiar y reproducción de audio real.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-EXP-01 | Generar recomendaciones personalizadas y descubrimiento (radio, mix diario) | Recomendaciones varían según el historial real del usuario | OE1, OE4 |
| OO-EXP-02 | Capturar telemetría enriquecida de reproducción e impresiones publicitarias | Cada reproducción/impresión queda registrada con su contexto (dispositivo, plan) | OE4 |
| OO-EXP-03 | Canalizar tickets de soporte al usuario hasta su resolución | Un ticket creado puede cambiar de estado hasta "resuelto" | OE1 |
| OO-EXP-04 | Reflejar analíticamente las playlists del catálogo (ranking, sincronización) | El ranking de playlists se recalcula tras una sincronización forzada | OE4 |
| OO-EXP-05 | Administrar planes familiares (alta de titular, miembros) en autoservicio y vía admin | Un titular puede agregar/quitar miembros dentro del límite de su plan | OE1 |
| OO-EXP-06 | Reportar paneles administrativos de tickets, pruebas A/B y familias | Cada panel admin refleja el conteo real de su entidad subyacente | OE4 |

### Facturación (`facturacion`)

Registro de método de pago, cobro de suscripciones con emisión de invoice, historial propio y auditoría ampliada para admin.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-FAC-01 | Registrar y validar métodos de pago (incluye checkout simulado) | Una tarjeta inválida es rechazada antes de asociarse a la cuenta | OE1 |
| OO-FAC-02 | Procesar el pago de una suscripción y emitir su invoice automáticamente | Cada transacción exitosa genera exactamente un invoice asociado | OE1, OE4 |
| OO-FAC-03 | Exponer historial de facturación propio y auditoría admin de terceros | Un admin puede consultar transacciones/invoices de cualquier usuario | OE4 |
| OO-FAC-04 | Configurar la empresa emisora y el IVA aplicable, con override por país | El IVA facturado corresponde al país configurado del suscriptor | OE3 |
| OO-FAC-05 | Reportar panel administrativo de ingresos por facturación | Panel refleja el ingreso histórico real acumulado | OE4 |

### Gestión de datos (`gestion_datos`)

Ejecución/monitoreo de la ingesta de nuevos lotes del catálogo, auditoría de historial/calidad de cargas y administración de dimensiones.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-GES-01 | Disparar y monitorear ejecuciones de ingesta de nuevos lotes del catálogo | Una ejecución en curso no permite disparar otra en paralelo (idempotencia) | OE3, OE4 |
| OO-GES-02 | Auditar la calidad y el historial de las cargas realizadas | Cada carga histórica muestra su tasa de registros válidos | OE4 |
| OO-GES-03 | Administrar (CRUD) las dimensiones y consultar los hechos del catálogo | Un registro de dimensión editado se refleja en los hechos que lo referencian | OE4 |
| OO-GES-04 | Recalificar en bloque el catálogo existente (año/país/coherencia audio-género) | Una recalificación corrige inconsistencias detectadas sin duplicar registros | OE4 |
| OO-GES-05 | Inspeccionar los datos cargados por semana (muestra y distribución) | La distribución mostrada corresponde al lote real de esa semana | OE4 |

### Partners / integradores (`partners`)

Consumo del catálogo vía API por Partners/Integradores externos, autenticado y segmentado por tier contratado.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-PAR-01 | Exponer catálogo de datos vía API segmentado por tier de acceso | Los campos devueltos varían según el tier (básico/pro/enterprise) del partner | OE2 |
| OO-PAR-02 | Habilitar exportación masiva exclusiva para tier enterprise | Un partner no-enterprise recibe 403 al intentar exportar | OE2 |
| OO-PAR-03 | Administrar partners y sus API keys (alta, rotación, desactivación) | Una key rotada invalida inmediatamente la anterior | OE2 |
| OO-PAR-04 | Reportar métricas agregadas de uso por partner (llamadas, éxito, latencia) | Métricas reflejan el volumen real de llamadas del período consultado | OE2, OE4 |

### Publicidad (`publicidad`)

Financiamiento del tier free con anuncios reales entre canciones; el ingreso publicitario real alimenta el mismo pool de regalías.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-PUB-01 | Administrar anunciantes y campañas publicitarias durante su ciclo de vida completo | Una campaña pausada deja de servir impresiones de inmediato | OE1 |
| OO-PUB-02 | Servir impresiones de anuncio (audio y display) a usuarios sin plan de pago | Un usuario premium nunca recibe una impresión de anuncio | OE1 |
| OO-PUB-03 | Reconocer ingreso publicitario real al completar una impresión o registrar un click | El ingreso reconocido alimenta el pool real de regalías | OE1, OE4 |
| OO-PUB-04 | Reportar ingreso publicitario por campaña y período | El ingreso reportado cuadra con las impresiones completadas del período | OE4 |

### Regalías (`regalias`)

Reparto del ingreso real (suscripciones + publicidad) entre titulares de derechos de cada track, según contratos vigentes, sobre streams reales.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-REG-01 | Gestionar contratos de reparto (productores, splits, cuentas de sello) | Un contrato terminado deja de recibir liquidaciones futuras | OE4 |
| OO-REG-02 | Liquidar periódicamente las regalías aplicando retención fiscal por país del titular | La retención aplicada corresponde a la configuración fiscal del país (`distribucion`) | OE3, OE4 |
| OO-REG-03 | Exponer consulta de ganancias propias a artistas y sellos | Un artista solo puede consultar sus propias ganancias, nunca las de terceros | OE1, OE4 |
| OO-REG-04 | Procesar solicitudes de retiro de ganancias (aprobar/rechazar) | Un retiro procesado descuenta el saldo disponible del titular | OE4 |

### Seguridad y administración (`seguridad`)

Gobierno de identidad, autenticación, permisos por rol, auditoría de operaciones sensibles y registro de errores del sistema.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-SEG-01 | Autenticar usuarios y administrar sesiones multi-dispositivo y perfil propio | Cerrar una sesión desde el listado la invalida de inmediato | OE3 |
| OO-SEG-02 | Habilitar recuperación de contraseña y verificación de email por token de un solo uso | Un token de recuperación usado una vez no puede reutilizarse | OE3 |
| OO-SEG-03 | Gestionar permisos granulares y roles administrativos segmentados por área de negocio | Un rol admin sin permiso sobre un recurso recibe 403 al operarlo | OE3 |
| OO-SEG-04 | Auditar operaciones sensibles y registrar/consultar errores de sistema | Toda operación sensible administrativa queda registrada en la auditoría | OE3, OE4 |
| OO-SEG-05 | Administrar integralmente usuarios (búsqueda, vista 360°, suspensión, strikes) | Un usuario suspendido no puede autenticarse hasta ser reactivado | OE3 |
| OO-SEG-06 | Permitir exportación de datos personales y baja de cuenta propia | Un usuario puede exportar sus datos y dar de baja su cuenta sin intervención de soporte | OE3 |

### Social (`social`)

Seguimiento de artistas, comentarios/respuestas en tracks y compartir contenido, con moderación admin y acceso de solo lectura para B2B.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-SOC-01 | Permitir seguir artistas y consultar el feed de actividad | El feed de un usuario refleja la actividad reciente de a quién sigue | OE1 |
| OO-SOC-02 | Habilitar comentarios en tracks con bloqueo usuario-a-usuario | Un usuario bloqueado no puede comentar en el contenido del bloqueador | OE1 |
| OO-SOC-03 | Moderar comentarios y resolver denuncias, emitiendo strikes cuando corresponde | Resolver una denuncia con sanción genera un strike real sobre el infractor | OE1, OE3 |
| OO-SOC-04 | Permitir compartir contenido (track/playlist/perfil) fuera de la plataforma | Se genera un enlace de compartición válido para cada tipo de contenido | OE1 |
| OO-SOC-05 | Notificar actividad relevante y exponer perfiles públicos de usuario | Una notificación marcada como leída no vuelve a contarse como pendiente | OE1 |

### Suscripciones (`suscripciones`)

Selección de plan por Usuario B2C (incluido trial/estudiante) y por Cliente B2B (tier), habilitando funciones según el plan contratado.

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-SUS-01 | Ofrecer selección y confirmación de plan, incluidos trial premium y plan estudiante | Un trial expirado degrada automáticamente el plan a free | OE1 |
| OO-SUS-02 | Permitir gestión del propio plan activo: consulta, cancelación y cambio con prorrateo | Un cambio de plan a mitad de período prorratea el cobro correctamente | OE1 |
| OO-SUS-03 | Reintentar cobros fallidos (dunning) con degradación automática tras máximo de intentos | Tras el máximo de reintentos, la suscripción se degrada sin intervención manual | OE1, OE4 |
| OO-SUS-04 | Administrar comercialmente precios de plan y suscripciones individuales | Un cambio de precio de plan no afecta retroactivamente a suscriptores ya facturados | OE1 |

### Nota — paquete adicional fuera de los 14 solicitados

El objetivo táctico **OT-08** (control de gastos operativos y reembolsos) está respaldado íntegramente por el paquete `finanzas`, que no forma parte de la lista de 14 paquetes de esta sección pero existe en el sistema real (`api/paquetes/finanzas`) y tiene spec propio en OpenSpec (`openspec/specs/finanzas`). Se documenta aquí por completitud de trazabilidad:

| Código | Objetivo operativo | Meta verificable | OE |
|---|---|---|---|
| OO-FIN-01 | Registrar y anular gastos operativos por categoría | Un gasto anulado deja de sumar al total activo mostrado | OE4 |
| OO-FIN-02 | Procesar reembolsos y mantener su historial por rango de fechas | Un reembolso queda asociado a la transacción original que lo origina | OE4 |
| OO-FIN-03 | Gestionar cuentas por cobrar y por pagar | El saldo de cuentas por cobrar/pagar refleja los movimientos reales del período | OE4 |
| OO-FIN-04 | Administrar presupuesto de campañas y dashboard financiero consolidado | El dashboard consolida gastos, reembolsos e ingresos del mismo período | OE4 |

---

## 4. Matriz de trazabilidad

Estado según evidencia real (código + rutas de frontend verificadas al 2026-07-29, ver `docs/BITACORA_S13.md`):
- **Implementado** — endpoint y vista existen y devuelven datos reales.
- **Parcial** — existe backend sin frontend equivalente, viceversa, o el dato disponible no coincide del todo con lo descrito en el objetivo.
- **Pendiente** — no existe ni endpoint ni vista.

| OE | OT | OO principal(es) | Paquete | Estado |
|---|---|---|---|---|
| OE1 | OT-01 | OO-SEG-01 | seguridad | Implementado |
| OE1 | OT-02 | OO-SUS-01/02, OO-ANA-05 | suscripciones, analitica | Implementado |
| OE1, OE4 | OT-03 | OO-SUS-01/02/04 | suscripciones | Implementado |
| OE2 | OT-04 | OO-PAR-01/03/04 | partners | Parcial — panel admin de métricas real; autoservicio B2B (`/analitica/partners`) sigue como placeholder "próximamente" |
| OE3 | OT-05 | OO-ANA-04 | analitica | Parcial — el dato agrupa por *componente* de infraestructura, no por *región* geográfica como pide el objetivo |
| OE3 | OT-06 | OO-SEG-04 | seguridad | Implementado |
| OE4, OE2 | OT-07 | OO-ANA-05 | analitica | Implementado |
| OE4 | OT-08 | OO-FIN-01/02/04 | finanzas (no listado en los 14, ver nota) | Parcial — ambos informes simples completos; sin vista dedicada de "comparativa gastos vs ingresos" |
| OE4 | OT-09 | OO-REG-01/02/03 | regalias | Implementado |
| OE1, OE4 | OT-10 | OO-PUB-01/03/04 | publicidad | Implementado |
| OE4 | OT-11 | OO-FAC-02/03/05 | facturacion | Implementado |
| OE3, OE4 | OT-12 | OO-GES-01/05 | gestion_datos | Implementado |
| OE4 | OT-13 | OO-GES-02 | gestion_datos | Parcial — `DataQualityPage` admin real; vista de analítica B2B (`/analitica/ingestas`) sigue como placeholder |
| OE4 | OT-14 | OO-GES-03 | gestion_datos | Implementado |
| OE4 | OT-15 | OO-ANA-01 | analitica | Implementado |
| OE4 | OT-16 | OO-ANA-02 | analitica | Implementado |
| OE4 | OT-17 | OO-ANA-01/03 | analitica | Implementado |
| OE4 | OT-18 | OO-ANA-03 | analitica | Implementado |
| OE4 | OT-19 | OO-ANA-02 | analitica | Implementado |
| OE2 | OT-20 | OO-CRE-01/02/04 | creadores | Implementado |
| OE2 | OT-21 | OO-DIS-01/02 | distribucion | Implementado |
| OE2 | OT-22 | OO-DIS-02 | distribucion | Implementado |
| OE2, OE3 | OT-23 | OO-DIS-03/05 | distribucion | Parcial — restricciones se consultan por track individual, no como listado global por territorio |
| OE1 | OT-24 | OO-SOC-02/03 | social | Implementado |
| OE1 | OT-25 | OO-SOC-03 | social | Implementado |
| OE1 | OT-26 | OO-EXP-03 | experiencia | Implementado — sin badge de prioridad (el modelo de ticket no define ese campo) |
| OE1 | OT-27 | OO-SOC-01/04/05 | social | Parcial — datos base existen repartidos (feed, comparticiones, notificaciones); sin vista agregada de "interacciones totales por tipo" |
| OE3 | OT-28 | OO-SEG-03/05 | seguridad | Implementado |
| OE3 | OT-29 | OO-SEG-04 | seguridad | Implementado |
| OE3 | OT-30 | OO-SEG-01 | seguridad | Pendiente — no existe listado global de sesiones; solo un contador agregado y el detalle por usuario individual |
| OE3 | OT-31 | OO-SEG-05 | seguridad | Implementado |
| OE1, OE4 | OT-32 | OO-EXP-01 | experiencia | Parcial — vista B2C real; sin versión admin/reporte ni indicador de reproducción posterior |
| OE4 | OT-33 | OO-EXP-06 | experiencia | Implementado |
| OE1 | OT-34 | OO-SOC-05 | social | Implementado |
| OE1 | OT-35 | OO-EXP-05/06 | experiencia | Implementado |

### Brechas y observaciones adicionales

- **OT-30 (sesiones abiertas)** es la única brecha total de la matriz: no existe endpoint ni vista de listado global usuario/dispositivo/IP — solo un conteo agregado (`AuditoriaPage`) y el arreglo `sesiones_activas` dentro del detalle 360° de un usuario puntual (`UsuariosAdminPage`).
- **Capabilities sin OT asociado** (soporte transversal, no un objetivo departamental propio): `biblioteca` (OO-BIB-01 a 04, favoritos/playlists/historial — sostiene la retención B2C de OE1 sin ser un objetivo táctico nombrado) y buena parte de `catalogo` (búsqueda/detalle B2C, OO-CAT-01/02/03 — sostiene el consumo de OE1) y `seguridad` (OO-SEG-01/02/06, autenticación/recuperación/privacidad — infraestructura de cuenta transversal a todos los departamentos).
- **Placeholders detectados en `/analitica`**: dos rutas (`/analitica/partners`, `/analitica/ingestas`) todavía renderizan `ComingSoonPage` aunque la capability subyacente ya existe y tiene vista real del lado admin (`PartnersMetricasPage`, `DataQualityPage` respectivamente) — la brecha es solo la vista de autoservicio B2B, no la capability en sí.
- **OT-05 y OT-23** tienen un desajuste de modelo de datos frente al enunciado del objetivo (componente vs. región; restricción por track vs. listado por territorio) más que una ausencia de funcionalidad — se marcan Parcial por esa razón, no porque falte código.
