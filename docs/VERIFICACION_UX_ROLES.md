# Verificación de UX por rol (S16-P3)

Auditoría de las 7 cuentas demo (`docs/CUENTAS_DEMO.md`, password `Demo12345!` para todas)
contra el stack levantado — login real por navegador (Playwright), no solo `curl` con Bearer
token, siguiendo el mismo criterio que dejó `docs/CUENTAS_DEMO.md` tras el bug de S14-P5
("un Bearer token nunca pasa por los guards de React Router del frontend"). Objetivo del
prompt: **verificación y relleno de huecos, no reconstrucción** — el gating de sidebar
(`SeguridadShell.tsx`, mapa `roles: [...]` por link) y la landing post-login
(`frontend/src/shared/lib/roles.ts`) ya existían y, tras esta auditoría, se confirma que están
bien diseñados; se encontraron y corrigieron 2 huecos puntuales de permisos en el backend, no
en el diseño de sidebar/landing.

## Metodología

Por cada una de las 7 cuentas: login real vía formulario (`/login`), captura de la URL de
aterrizaje, captura del `RoleBadge` visible en el header, recolección de todos los `<a href>`
del sidebar (`/seguridad/*`, `/reportes/*`, `/analitica`) realmente renderizados por
`SeguridadShell`/`AnalyticaShell` para esa sesión, y navegación real a **cada uno** de esos
links con inspección de las respuestas de red (`GET /app/v1/**`) buscando `401`/`403` — un link
visible que dispara un 403 en su propia carga es exactamente el síntoma que pedía el prompt
("ítems visibles que luego rebotan por falta de permiso backend").

## Resultado por cuenta

| Cuenta | Landing real | RoleBadge | Links visibles verificados | Problemas encontrados |
|---|---|---|---|---|
| `superadmin@demo.tracklytics.com` | `/analitica` | `Superadmin` | 1 (superadmin ve todo vía bypass, no se enumeran los ~60 links individualmente) | 0 |
| `admin_finanzas@demo.tracklytics.com` | `/seguridad/finanzas` | `Admin · Finanzas` | 6 | 1 → **corregido** (ver abajo) |
| `admin_contenido@demo.tracklytics.com` | `/seguridad/catalogo` | `Admin · Contenido` | 4 | 0 |
| `admin_comunidad@demo.tracklytics.com` | `/seguridad/social` | `Admin · Comunidad` | 15 | 0 |
| `admin_datos@demo.tracklytics.com` | `/seguridad/ingesta` | `Admin · Datos` | 5 | 1 → **corregido** (ver abajo) |
| `admin_comercial@demo.tracklytics.com` | `/seguridad/partners` | `Admin · Comercial` | 5 | 0 |
| `analyst@demo.tracklytics.com` | `/suscripciones?onboarding=1` | `Analista` | 1 | 0 (comportamiento correcto, ver nota) |

Los 6 landings de rol administrativo coinciden exactamente con `LANDING_POR_ROL` en `roles.ts` y
son coherentes con el área de cada rol (finanzas → Finanzas, contenido → Catálogo/Takedown,
comunidad → Moderación social, datos → Ingesta ETL, comercial → Partners, superadmin →
Dashboard ejecutivo). **Ningún rol cae a un default genérico** — no hubo nada que corregir en
`LANDING_POR_ROL`.

Los 7 `RoleBadge` muestran el label y color exactos de `ROL_LABELS`/`ROL_COLORS` — verificado
con `page.getByText(label, { exact: true })` tras login real, 1-2 coincidencias por cuenta
(header + sidebar/menú donde aplica).

### Nota — `analyst` aterriza en `/suscripciones`, no en `/analitica`

`LANDING_POR_ROL.analyst = '/analitica'`, pero esta cuenta demo específica no tiene
suscripción B2B activa en este momento del dataset (confirmado con `curl`:
`GET /app/v1/analitica/dashboard` → `403 {"detail":"Se requiere una suscripción activa..."}`,
mismo 403 tanto antes como después de los cambios de esta fase — no es una regresión). El
redirect a `/suscripciones?onboarding=1` lo resuelve `resolverDestinoPostAuth` (no
`landingPostLogin`, que es solo para cuentas admin) y muestra una pantalla de upsell coherente
("Activa tu cuenta empresarial... El plan Básico incluye todos los paneles analíticos"), no una
pantalla rota. Esto es un estado de **datos** (sin suscripción activa en el seed), no un bug de
landing — fuera de alcance de esta verificación (no se tocan datos de seed en esta fase).

## Hueco encontrado y corregido — `/seguridad/disponibilidad` daba 403 a los 5 admins de área

**Síntoma:** el link "Disponibilidad" no tiene `roles:` en `SECCIONES` de `SeguridadShell.tsx`
— por diseño, visible a **cualquier** admin. Pero la página (`DisponibilidadInfraPage`, reusa
`/app/v1/analitica/disponibilidad`) heredaba el gating de `v1_router`
(`require_b2b_panel_access`), que solo reconoce staff bootstrap (`role=="admin"`) o
`superadmin` vía BRIDGE — **ningún admin de área** (`admin_finanzas`, `admin_contenido`,
`admin_comunidad`, `admin_datos`, `admin_comercial`) califica, así que los 5 recibían 403 al
entrar, pese a que el sidebar les mostraba el link sin restricción.

**Verificado con `curl` aislado, antes del fix** (los 5 devuelven 403 de forma consistente):
```
admin_finanzas@demo.tracklytics.com  -> 403 http://localhost:8082/seguridad/disponibilidad
admin_comunidad@demo.tracklytics.com -> 403 http://localhost:8082/seguridad/disponibilidad
admin_contenido@demo.tracklytics.com -> 403 http://localhost:8082/seguridad/disponibilidad
admin_datos@demo.tracklytics.com     -> 403 http://localhost:8082/seguridad/disponibilidad
admin_comercial@demo.tracklytics.com -> 403 http://localhost:8082/seguridad/disponibilidad
```

**Fix:** nuevo router `router_infra` en `api/paquetes/analitica/router.py`
(`api/paquetes/analitica/deps.py::require_cualquier_admin`) — acepta cualquier rol
administrativo vigente (`roles_admin_vigentes` no vacío) y, si no hay ninguno, delega
íntegramente en `require_b2b_panel_access` (sin duplicar esa lógica) para no romper el
consumo B2B original de este mismo endpoint (`/analitica/disponibilidad`, visible en
`AnalyticaShell` a cualquier tier con sesión activa). Un primer intento (mover la ruta con un
gate que NO delegaba en `require_b2b_panel_access`) rompía el acceso B2B — detectado
comparando contra `/analitica/dashboard` con la cuenta `analyst` antes/después del cambio
(mismo 403 "requiere suscripción activa" en ambos casos → el fix correcto no cambia ese
comportamiento, solo agrega el de admins de área).

**Verificado con `curl` aislado, después del fix** (los 5 ahora devuelven 200; `analyst` sin
suscripción sigue en 403 exactamente igual que antes, sin regresión):
```
admin_finanzas@demo.tracklytics.com  -> 200 http://localhost:8082/seguridad/disponibilidad
admin_comunidad@demo.tracklytics.com -> 200 http://localhost:8082/seguridad/disponibilidad
admin_contenido@demo.tracklytics.com -> 200 http://localhost:8082/seguridad/disponibilidad
admin_datos@demo.tracklytics.com     -> 200 http://localhost:8082/seguridad/disponibilidad
admin_comercial@demo.tracklytics.com -> 200 http://localhost:8082/seguridad/disponibilidad

curl analyst  -> GET /app/v1/analitica/dashboard -> 403 "Se requiere una suscripción activa..."
curl superadmin -> GET /app/v1/analitica/disponibilidad -> 200
```

## Hueco encontrado y corregido — dropdowns vacíos en Regalías para `admin_finanzas`

**Síntoma:** `admin_finanzas` SÍ tenía acceso legítimo a `/seguridad/regalias` (la página
carga, sin bounce, sin texto de error) — pero dos llamadas de fondo que pueblan los
`<select>` del formulario "Registrar liquidación" (`GET /distribucion/sellos`,
`GET /creadores/admin/cuentas?estado=aprobada`) devolvían 403, porque ambos endpoints están
gateados `admin_contenido`-only (gestión de sellos/cuentas de artista es, correctamente, un
área de contenido) — dejando los selectores de "sello" y "artista" vacíos, sin ningún error
visible en pantalla (bug silencioso, el tipo más difícil de encontrar sin probar como el rol
real).

**Fix:** en vez de abrir todo `distribucion`/`creadores` a `admin_finanzas` (que sería
sobre-otorgar permiso de escritura sobre contenido), se creó un segundo dependency SOLO para
esas 2 lecturas puntuales —
`distribucion/router.py::require_admin_lectura_sellos` y
`creadores/deps.py::require_admin_lectura_cuentas`, ambos
`require_rol_admin("admin_contenido", "admin_finanzas")` — aplicado únicamente a
`GET /sellos` y `GET /admin/cuentas`. Alta/edición de sellos y aprobación/rechazo de cuentas de
artista siguen exclusivas de `admin_contenido` (`require_admin` original, sin tocar).

**Verificado con `curl`** (antes: 403 en ambas lecturas; después: 200 en las lecturas,
403 sin cambios en la escritura):
```
GET  /distribucion/sellos                          (admin_finanzas) -> 200  (antes: 403)
GET  /creadores/admin/cuentas?estado=aprobada       (admin_finanzas) -> 200  (antes: 403)
POST /creadores/admin/cuentas/1/resolver            (admin_finanzas) -> 403  (sin cambio — correcto)
```

## Conclusión

De los 7 roles, 6 (todos los administrativos) aterrizan y navegan sin ningún link roto; el 7º
(`analyst`) se comporta correctamente dado su estado de datos actual (sin suscripción). Se
encontraron y corrigieron 2 huecos de permisos backend — ninguno de diseño de sidebar/landing,
que ya estaban bien construidos — ambos siguiendo el mismo patrón: un link visible sin
restricción de rol (o una llamada de soporte dentro de una página) que el backend no
reconocía para admins de área. Los 30 informes compuestos (`DEPTO_ROLES` en
`SeguridadShell.tsx`) ya calcaban exactamente `api/paquetes/reportes/deps.py`
(`require_<depto>`) — comparación campo a campo confirmada, sin discrepancias.
