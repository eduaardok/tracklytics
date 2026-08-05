# Cuentas de demostración (S14-P3)

**Estas son credenciales de demostración académica de un entorno local de desarrollo.
Nunca son credenciales reales ni deben usarse fuera de este proyecto.** Todas las cuentas
comparten la misma contraseña de prueba, siguiendo la misma convención que las cuentas
demo ya existentes del proyecto.

Creadas el 2026-08-05 por los endpoints reales de la API (`POST /app/v1/seguridad/auth/registro`
+ `POST /app/v1/seguridad/admin/usuarios/{usuario_id}/rol-admin`) — nunca con `INSERT` directo
a ClickHouse, para que PocketBase (autenticación) y `DIM_USUARIO` (espejo analítico) queden
sincronizados desde el origen.

## Tabla de cuentas

| Correo | Rol administrativo | Contraseña | Informes compuestos que ve |
|---|---|---|---|
| `superadmin@demo.tracklytics.com` | `superadmin` | `Demo12345!` | Los 30 (acceso total, `*`) |
| `admin_finanzas@demo.tracklytics.com` | `admin_finanzas` | `Demo12345!` | Financiero (C07–C11: MRR/ARR, gastos vs ingresos, regalías, publicidad, facturación) |
| `admin_contenido@demo.tracklytics.com` | `admin_contenido` | `Demo12345!` | Contenido y A&R (C19–C21: revisión, licencias, cobertura) |
| `admin_comunidad@demo.tracklytics.com` | `admin_comunidad` | `Demo12345!` | Comunidad y Soporte (C22–C25) + Producto (C28–C30: recomendaciones, A/B, notificaciones) |
| `admin_datos@demo.tracklytics.com` | `admin_datos` | `Demo12345!` | Tecnología (C04–C06) + Ingeniería de Datos (C12–C13) + Analítica y BI (C14–C18) |
| `admin_comercial@demo.tracklytics.com` | `admin_comercial` | `Demo12345!` | Comercial y Marketing (C01–C03) |
| `analyst@demo.tracklytics.com` | — (cliente B2B, sin rol administrativo) | `Demo12345!` | Ninguno de los 30 informes internos — ve el panel de analítica B2B de su propio plan (`analitica`), no la capa `reportes` |

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
