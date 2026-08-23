# Cuentas de demostración (S14-P3, sembrado automático desde S14-P4)

**Estas son credenciales de demostración académica de un entorno local de desarrollo.
Nunca son credenciales reales ni deben usarse fuera de este proyecto.** Todas las cuentas
comparten la misma contraseña de prueba, siguiendo la misma convención que las cuentas
demo ya existentes del proyecto. La contraseña sale de la variable de entorno
`SUPERADMIN_DEMO_PASSWORD` (default `Demo12345!` — ver `docker-compose.yml`), nunca está
en texto plano en el código (S14-P4, Fase 1).

**Desde S14-P4 estas 8 cuentas se siembran solas**: el servicio `seed-cuentas-demo` de
`docker-compose.yml` (`seed_cuentas_demo.py`) corre automáticamente en cada
`docker compose up`, después de que `api` esté saludable (`depends_on` + `healthcheck`, sin
`sleep`). Es idempotente — si una cuenta ya existe, no la duplica ni falla. Antes de S14-P4
estas cuentas solo existían si alguien las creaba a mano por endpoint; sin ellas,
`dag_backfill_negocio` fallaba en el paso de regalías (necesita loguearse como `superadmin`
para llamar `POST /admin/liquidar`) en cualquier entorno recién levantado.

Todas pasan por los endpoints reales de la API (`POST /app/v1/seguridad/auth/registro` +
`POST /app/v1/seguridad/admin/usuarios/{usuario_id}/rol-admin`) — nunca con `INSERT` directo
a ClickHouse, para que PocketBase (autenticación) y `DIM_USUARIO` (espejo analítico) queden
sincronizados desde el origen. La única excepción es el bootstrap de `superadmin` (ver
docstring de `seed_cuentas_demo.py`): como nadie puede autoasignarse `admin` vía
`/auth/registro` ni asignar un rol administrativo sin ser YA `superadmin`, esa cuenta se crea
llamando a la misma API pública de PocketBase que `pb_client.crear_usuario()` ya usa
internamente — no es un `INSERT` a ClickHouse, es el mismo mecanismo de creación de cuenta
del resto del sistema, con el mismo campo `role` que `require_rol_admin` ya reconoce
automáticamente.

## Tabla de cuentas

| Correo | Rol administrativo | Contraseña | Informes compuestos que ve |
|---|---|---|---|
| `superadmin@demo.tracklytics.com` | `superadmin` | `Demo12345!` | Los 30 (acceso total, `*`) |
| `admin_finanzas@demo.tracklytics.com` | `admin_finanzas` | `Demo12345!` | Financiero (C07–C11: MRR/ARR, gastos vs ingresos, regalías, publicidad, facturación) |
| `admin_contenido@demo.tracklytics.com` | `admin_contenido` | `Demo12345!` | Contenido y A&R (C19–C21: revisión, licencias, cobertura) |
| `admin_comunidad@demo.tracklytics.com` | `admin_comunidad` | `Demo12345!` | Comunidad y Soporte (C22–C25) + Producto (C28–C30: recomendaciones, A/B, notificaciones) |
| `admin_datos@demo.tracklytics.com` | `admin_datos` | `Demo12345!` | Tecnología (C04–C06) + Ingeniería de Datos (C12–C13) + Analítica y BI (C14–C18) |
| `admin_comercial@demo.tracklytics.com` | `admin_comercial` | `Demo12345!` | Comercial y Marketing (C01–C03) |
| `analyst@demo.tracklytics.com` | — (cliente B2B, sin rol administrativo) | `Demo12345!` | Ninguno de los 30 informes internos — ve el panel de analítica B2B de su propio plan (`analitica`), no la capa `reportes`. Desde S17 el seed la deja **lista para demo B2B**: email verificado + método de pago demo + suscripción al plan `basico` activa (`_activar_analyst_b2b` en `seed_cuentas_demo.py`), sin lo cual el gate de `/analitica` la mandaba al onboarding de planes. |
| `usuario@demo.tracklytics.com` | — (Cliente B2C simple, sin rol administrativo) | `Demo12345!` | Ninguno — catálogo, biblioteca, social, creadores, like/dislike, como cualquier usuario B2C (S16 prompt 09, para el acceso rápido de demo en `/login`) |

`superadmin` es la única cuenta que ve **Seguridad** (C26–C27) — ese departamento no tiene
rol administrativo propio en `DIM_ROL_ADMINISTRATIVO` (ver `api/paquetes/reportes/deps.py`),
así que está gateado directamente con `require_admin`.

## Matriz de gating verificada (Fase 5/6, S14-P3)

`curl` real contra un endpoint representativo de cada uno de los 9 departamentos, con cada
una de las 7 cuentas y sin token. `200` = acceso permitido, `403` = rechazado (autenticado
pero sin el rol), `401` = sin autenticación.

```
cuenta            comercial  tecnologia financiero datos      analitica  contenido  comunidad  seguridad  producto
superadmin        200        200        200        200        200        200        200        200        200
admin_finanzas    403        403        200        403        403        403        403        403        403
admin_contenido   403        403        403        403        403        200        403        403        403
admin_comunidad   403        403        403        403        403        403        200        403        200
admin_datos       403        200        403        200        200        403        403        403        403
admin_comercial   200        403        403        403        403        403        403        403        403
analyst           403        403        403        403        403        403        403        403        403
(sin auth)        401        401        401        401        401        401        401        401        401
```

Ningún `403` esperado devolvió `200` — el gating funciona exactamente como está diseñado en
`api/paquetes/reportes/deps.py`.

## Acceso real desde el navegador (S14-P5)

La matriz de arriba se verificó por `curl` con Bearer token — eso confirma que el **backend**
autoriza correctamente, pero un Bearer token nunca pasa por los guards de React Router del
frontend. Esa diferencia escondió un bug real: `RequireAuth roles={['admin']}` (protege todo
`/seguridad/*` y `/reportes/*`) comparaba contra el `role` crudo de PocketBase, que solo vale
`admin` para `superadmin` — las 6 cuentas `admin_*` (rol asignado por
`BRIDGE_USUARIO_ROL_ADMIN`, no por PocketBase) quedaban redirigidas a `/` (catálogo B2C) al
intentar entrar al panel administrativo desde el navegador, aunque el backend las autorizara
sin problema. Corregido en S14-P5 (`RequireAuth.tsx` + `GET /seguridad/perfil` +`roles_admin`
+ `esAdmin` en la sesión, ver `docs/BITACORA_S14.md`, bloque P5) y verificado con Playwright
(login real, no Bearer token manual) para `admin_finanzas`, `admin_comercial` y `superadmin`.
Cualquier verificación futura de estas cuentas SHOULD incluir al menos un login real en
navegador, no solo `curl` — es la única forma de ejercitar `RequireAuth`.
