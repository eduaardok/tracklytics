## Purpose

Alinear el gating de "staff interno" de `analitica` (paneles B2B sin necesidad de
suscripción, reporte diario operativo) con el mismo modelo de autorización administrativa
que ya usa `seguridad` (`require_rol_admin`): reconocer también un rol `superadmin` vigente
en `BRIDGE_USUARIO_ROL_ADMIN`, no solo `record.role == 'admin'` de PocketBase. Antes de este
cambio, una cuenta `superadmin` cuyo campo `role` de PocketBase no fuera literalmente
`admin` (posible por drift de datos, o por haber recibido el rol `superadmin` vía
`BRIDGE_USUARIO_ROL_ADMIN` en vez de por el campo nativo de PocketBase) quedaba rechazada
con 403 en `analitica` pese a tener acceso total en el resto del sistema.

## MODIFIED Requirements

### Requirement: Acceso a paneles analíticos condicionado a suscripción activa

El acceso a los paneles analíticos B2B SHALL requerir una suscripción activa (ver capability
`suscripciones`); un Cliente B2B sin plan activo no puede consultar estos dashboards. Además, el
acceso SHALL graduarse según el tier de la suscripción activa (`básico < pro < enterprise`): los
paneles comparativos (comparar artistas, benchmark de artista vs. género, índice de desempeño
relativo, adquisición por canal) SHALL requerir tier Pro o superior; el resto de paneles operativos
base (dashboard ejecutivo, perfil de audio por género, tendencias temporales, disponibilidad de
infraestructura, engagement de un track/artista, y la búsqueda de artista que lo soporta) SHALL
permanecer accesibles desde tier Básico. Los paneles predictivos/estratégicos (proyección de
tendencia de género, proyección de trayectoria de artista) SHALL requerir tier Enterprise. Esta
graduación por tier es independiente del gating de staff interno (reporte diario operativo,
churn, funnel de conversión, P&L, MRR/ARR), que SHALL seguir siendo exclusivo de Data Analyst/BI
Lead o Lead Data Engineer/CTO sin relación con el tier de ningún Cliente B2B. Staff interno SHALL
reconocerse por `record.role == 'admin'` de PocketBase O por un rol `superadmin` vigente en
`BRIDGE_USUARIO_ROL_ADMIN` — el mismo criterio que usa `require_rol_admin` en `seguridad`, no un
chequeo más estricto exclusivo de este paquete.

#### Scenario: Acceso sin suscripción activa
- **WHEN** un Cliente B2B sin una suscripción activa intenta acceder a cualquier panel analítico
- **THEN** el sistema le niega el acceso y lo redirige a la pantalla de suscripción

#### Scenario: Cliente B2B Básico accede a un panel operativo base
- **WHEN** un Cliente B2B con tier Básico activo consulta el dashboard ejecutivo, el perfil de
  audio de un género, las tendencias temporales, la disponibilidad de infraestructura, o el
  engagement de un track/artista
- **THEN** el sistema muestra el panel solicitado

#### Scenario: Cliente B2B Básico intenta acceder a un panel comparativo
- **WHEN** un Cliente B2B con tier Básico activo intenta comparar artistas, consultar un
  benchmark, el índice de desempeño relativo, o la adquisición por canal
- **THEN** el sistema le niega el acceso indicando que ese panel requiere tier Pro o superior, sin
  desactivar la suscripción activa del cliente

#### Scenario: Cliente B2B Pro accede a los paneles comparativos
- **WHEN** un Cliente B2B con tier Pro o Enterprise activo consulta cualquier panel comparativo
- **THEN** el sistema muestra el panel solicitado

#### Scenario: Cliente B2B Pro intenta acceder a un panel predictivo Enterprise
- **WHEN** un Cliente B2B con tier Pro (no Enterprise) intenta consultar la proyección de
  tendencia de un género o la proyección de trayectoria de un artista
- **THEN** el sistema le niega el acceso indicando que ese panel requiere tier Enterprise

#### Scenario: Superadmin por BRIDGE (sin `record.role == 'admin'`) accede como staff interno
- **WHEN** una cuenta tiene un rol `superadmin` vigente en `BRIDGE_USUARIO_ROL_ADMIN` pero su
  `record.role` en PocketBase no es literalmente `admin`
- **THEN** el sistema la trata como staff interno: acceso sin suscripción a los paneles
  analíticos y al reporte diario operativo
