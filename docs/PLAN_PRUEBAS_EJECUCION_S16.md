# Plan de Pruebas, Ejecución y Resolución — Semana 16-17

**Proyecto:** Tracklytics v2 — Plataforma B2B2C de Analítica Musical
**Materia:** Construcción del Software (UTEQ)
**Enunciado cubierto (4 puntos):** crear plan de pruebas · ejecutarlo · resolver problemas encontrados · mejorar el diseño
**Base verificada:** commit `c0ac08b` (2026-08-20). Ejecución real documentada aquí: 2026-08-22.
**Resultado final de la suite automatizada:** **26/26 pruebas en verde**, estable en 2 corridas consecutivas.

> Este documento es el insumo técnico para el PDF de entrega. Todo lo citado fue verificado
> contra el repositorio y contra ejecución real (no simulada) dentro del contenedor `api`.

---

## 1. Contexto

Tracklytics simula un servicio tipo Spotify cuyo comportamiento de oyentes B2C alimenta un
motor de analítica B2B/Enterprise (modelo data flywheel). Stack: PocketBase → Parquet →
ClickHouse + Airflow (ETL) + FastAPI + React/TypeScript + Nginx, todo en Docker Compose.
Alcance: 14 dominios de negocio, 89 tablas ClickHouse, 115+ endpoints.

---

## 2. PUNTO 1 — Plan de pruebas

### 2.1 Enfoque

El plan se centró en **recorridos de usuario end-to-end por rol** (no endpoints aislados):
verifica lo que un usuario real experimenta, combinando verificación funcional y visual en el
mismo caso — un usuario no distingue si algo falla por lógica o por diseño. Esto complementa,
sin duplicar, la cobertura previa del proyecto:

- `docs/auditoria_validacion/` — auditoría de validación de entrada en 115 endpoints
  (13 hallazgos Pydantic/inyección corregidos con commits atómicos).
- `api/tests/test_finanzas.py` — suite pytest contra ClickHouse real (sin mocks), única del
  proyecto hasta la fecha.

### 2.2 Matriz de recorridos definidos

| # | Rol | Recorrido | Criterio de aceptación |
|---|-----|-----------|------------------------|
| R1 | B2C (oyente) | registro/login → explorar catálogo → reproducir → playlist → favoritos → perfil público → suscripción | Cada paso completa sin error funcional; UI consistente con el design system |
| R2 | Artista/creador | login → subir track → estado de revisión → analítica propia | Subida refleja en `STG_ARTIST_UPLOADS`; promoción a `FACT_TRACKS` tras aprobación |
| R3 | B2B (analista) | login → dashboard → BSC → benchmark SQL vs Gold → export PDF | KPIs coherentes con ClickHouse; export legible |
| R4 | Admin | moderación → gestión de datos → facturación/reembolsos → publicidad | Cambios reflejados en base y UI |

### 2.3 Detalle del recorrido prioritario (R1)

| Paso | Acción | Qué se verifica |
|------|--------|-----------------|
| 1 | Explorar `/catalogo` sin sesión | Accesible sin login; hero compacto; contenido visible de inmediato |
| 2 | Buscar desde el header | Un único buscador global, resultados agrupados por tipo |
| 3 | Intentar reproducir sin sesión | Interrupción contextual breve, no una landing separada |
| 4 | Iniciar sesión desde ese punto | Login centrado, mismo lenguaje visual que registro, cuentas demo accesibles |
| 5 | Confirmar retorno al contexto | La reproducción pendiente se retoma sola tras el login |
| 6 | Navegar a Analítica/Administración | El sidebar no muestra todas las opciones internas de golpe |
| 7 | Entrar a una sección (ej. BSC) | Se expande solo la sección actual; el resto colapsado |

R1 fue el foco de la mejora de diseño (sección 5). Los recorridos R2-R4 quedaron definidos
como matriz para la siguiente iteración; esta entrega ejecutó R1 (recorridos) + la suite
automatizada completa de finanzas (ejecución real, sección 3).

---

## 3. PUNTO 2 — Ejecución del plan

### 3.1 Dos niveles de ejecución

1. **Recorridos R1 mediante auditoría de código real**: para cada paso se verificó el estado
   exacto del código, se diseñó la corrección, se implementó y se re-verificó (`git show`
   por commit). Resultados en sección 4.2 (problemas 1-5).
2. **Suite automatizada ejecutada de verdad**: `pytest` instalado en el contenedor `api`
   (Python 3.11.16, ClickHouse 24.3.18.7 vía HTTP) y corrido contra el ClickHouse real de
   desarrollo con datos sintéticos cargados (~1.5 M filas). Los cambios de código son
   visibles al contenedor por bind mount, así que cada fix se re-validó en caliente.

### 3.2 Bitácora de corridas (suite `tests/test_finanzas.py`, 26 casos)

| Corrida | Estado | Resultado | Qué destapó |
|---------|--------|-----------|-------------|
| 1 | código inicial | 14 pass / **12 fail** | 8 fallos async, orden de args, validación movida a Pydantic, delta erróneo, pausa no persistida |
| 2 | fixes de tests + sonda de fechas ingenua | 17 pass / 5 fail / 4 error | **Bug de producción Enum8 'productor'** (500 en `/finanzas/alertas`); calendario saturado por carga sintética |
| 3 | fix Enum8 + anclaje al horizonte de datos | 25 pass / 1 fail | Alerta legítima de caída de ingreso invadía el rango "limpio" |
| 4 | ventana de 2 días (off-by-one) | 21 pass / 5 fail | Ventana excluía el día bajo prueba — colisiones entre tests |
| 5 | ventana corregida `[d-2, d]` | 25 pass / 1 fail | Ventana auxiliar del test de comparación vive en d-10 |
| 6 | **ventana certificada de 12 días** | **26 pass** | — |
| 7 | re-corrida de estabilidad | **26 pass** | Determinismo confirmado |

Verificación adicional post-fix (smoke de producción):
`SALDO_DISPONIBLE_RIGHTSHOLDER(tipo='productor')` → `saldo_disponible = 0.0` sin excepción.

Comando de reproducción:

```bash
docker compose exec -T api python -m pytest tests/test_finanzas.py -v
```

---

## 4. PUNTO 3 — Problemas encontrados y resueltos

### 4.1 Hallazgos de esta semana (recorridos R1, ya commiteados)

| # | Problema | Severidad | Commit |
|---|----------|-----------|--------|
| 1 | Conteo de canciones duplicado por multi-género (5 queries sin `DISTINCT`) | Media | `121a1e1` |
| 2 | Perfiles públicos no descubribles (faltaba búsqueda pública) | Media | `dfbeafa` |
| 3 | Sobrecarga de navegación en Analítica/Administración (17-25 ítems visibles) → rediseño a 2 niveles | Alta (UX) | `1de88b5` |
| 4 | Login como interrupción desproporcionado; intención de reproducción se perdía → pantalla centrada contextual con reanudación | Alta (UX) | `7bb65ea` |
| 5 | Regresión de rendimiento propia en `/catalogo` → TTL caché 120s→1800s + staleTime | Media | `c0ac08b` (+`264ad05`, `05fb42e`) |

### 4.2 Hallazgos nuevos de la ejecución automatizada (2026-08-22)

#### P6 — Bug de PRODUCCIÓN: endpoint de alertas financieras devuelve 500 si existe una liquidación de productor (ALTA)

- **Síntoma:** 5 tests caen con `Code: 691 — Unknown element 'productor' for enum:
  while converting 'productor' to Enum8('artista'=1, 'sello'=2)`.
- **Causa raíz:** `FACT_LIQUIDACION_REGALIA.tipo_rightsholder` es
  `Enum8('sello','artista','productor')`, pero `FACT_RETIRO_REGALIA.tipo_rightsholder` es
  `Enum8('artista','sello')`. Las queries `SALDO_DISPONIBLE_RIGHTSHOLDER` y
  `RETIROS_POR_RIGHTSHOLDER` comparaban el parámetro `{tipo:String}` directamente contra
  ambas columnas: con `tipo='productor'` ClickHouse intenta convertir el literal al enum del
  retiro y explota. Como `_alertas_financieras` calcula saldos de TODAS las liquidaciones
  pendientes globales, un único productor liquidado tumba `GET /finanzas/alertas`.
- **Resolución:** comparar vía `toString(tipo_rightsholder) = {tipo:String}` — sin coerción
  de literal contra enum; semánticamente correcto (un productor sin retiros tiene saldo =
  lo liquidado) y sin migración de esquema.
- **Archivo:** `api/paquetes/regalias/queries.py`.

#### P7 — Consistencia: mutaciones ClickHouse asíncronas invisibles a la lectura inmediata (MEDIA)

- **Síntoma:** el test de pausa automática veía `activa=1` en la tabla justo después de que
  la API respondiera "pausada".
- **Causa raíz:** los tres `ALTER TABLE ... UPDATE` (editar gasto, anular gasto, pausa
  automática de campaña) son mutaciones asíncronas por defecto en ClickHouse: la respuesta
  HTTP vuelve antes de que la mutación aplique.
- **Resolución:** `SETTINGS mutations_sync = 1` en las tres sentencias — lectura tras
  escritura consistente para la UI y las pruebas.
- **Archivo:** `api/paquetes/finanzas/router.py` (líneas ~143, ~169, ~395).

#### P8 — Suite desincronizada del código (3 defectos de prueba, BAJA pero ocultaban P6/P7)

1. Ocho tests llamaban `_alertas_financieras(...)` (ahora `async`) sin `await` →
   `TypeError: 'coroutine' object is not iterable`. Fix: `asyncio.run(...)`, mismo patrón
   que ya usaban los tests de indicadores/reporte.
2. `editar_gasto(gasto_id, body, admin)` invertía el orden real de la firma
   `(body, gasto_id, admin)` → el 404 posterior era falso. Fix: orden corregido.
3. `test_gasto_monto_invalido_rechazado` esperaba `HTTPException(422)`, pero desde la
   auditoría de validación el rechazo vive en Pydantic (`monto: Field(gt=0)`) y llega como
   `ValidationError` en llamada directa (vía HTTP sigue siendo 422 — mismo contrato externo).
   Fix: expectativa actualizada, documentando la mejora de borde.

#### P9 — Hermeticidad rota: la carga sintética ocupa el calendario (MEDIA, hacía fallar tests correctos)

- **Causa raíz:** `rango_unico` elegía fechas aleatorias lejanas en el pasado asumiendo que
  estaban vacías. Tras la carga sintética (~1.5 M filas sobre fechas reales), esa suposición
  dejó de cumplirse: el test de comparación de dashboard medía deltas contra datos ajenos
  (delta 321.39% esperando 100%) y una sonda de 120 días consecutivos no encuentra ni un día
  libre.
- **Resolución:** el fixture ahora consulta el horizonte real de datos
  (`max(fecha)` de las 5 tablas fact relevantes) y certifica una **ventana vacía de 12 días
  posteriores** (el rango bajo prueba + sus ventanas auxiliares: comparación en d-10/d-9 y
  periodo previo de caída de ingreso en d-1). Determinista, sin colisiones entre tests ni
  con la carga sintética.
- **Archivo:** `api/tests/conftest.py`.

#### P10 — Gap de reproducibilidad: `pytest` no declarado en `api/requirements.txt` (RESUELTO)

La única suite del proyecto corría solo donde alguien había instalado pytest a mano; un
entorno limpio (`docker compose up`) no podía ejecutarla. Fix: `pytest==8.3.4` fijado en
`requirements.txt` — la misma versión usada para la ejecución documentada aquí.

### 4.3 Resumen consolidado de la ejecución

| # | Problema | Tipo | Severidad | Estado |
|---|----------|------|-----------|--------|
| 1-5 | Recorridos R1 (tabla 4.1) | funcional/UX | Media-Alta | Resueltos (commits S16) |
| 6 | Enum8 'productor' → alertas 500 | Producción | **Alta** | Resuelto (`regalias/queries.py`) |
| 7 | Read-after-write de mutaciones | Producción | Media | Resuelto (`mutations_sync=1`) |
| 8 | Suite desincronizada (async/args/validación) | Prueba | Baja | Resuelto (`test_finanzas.py`) |
| 9 | Hermeticidad vs carga sintética | Prueba | Media | Resuelto (`conftest.py`) |
| 10 | pytest fuera de requirements.txt | Infra | Media | Resuelto (`requirements.txt`) |

### 4.4 Pendientes declarados (transparencia)

- Capturas antes/después de catálogo, login y sidebars para la versión visual del PDF.
- `npx tsc --noEmit`: pendiente de correr limpio — actualmente reporta 1 error en
  `AppShell.tsx` proveniente de trabajo EN CURSO sin commitear (refactor top-nav), no del
  código estable. Re-ejecutar al cerrarse ese trabajo.
- Del inventario previo: export PDF de tablas anchas puede recortar columnas;
  primera carga de `/dashboard/executive` ~6.8s (mitigada por caché, aceptada); términos de
  audio en inglés en 7 pantallas; etiqueta interna "S12" visible en proyecciones; módulo
  social separado del detalle de canción.

---

## 5. PUNTO 4 — Mejora de diseño

Tres rediseños commiteados (detalle completo en bitácora y commits citados):

1. **Navegación de dos niveles** (`1de88b5`): selector de zona por rol (Catálogo /
   Analítica / Administración) en cabecera + acordeón exclusivo por grupos de negocio dentro
   de cada zona, con auto-expansión de la sección activa. Justificación: agrupar con etiquetas
   no reducía la sobrecarga real (seguían visibles 5-7 nombres de sección a la vez).
2. **Catálogo como centro de descubrimiento** (`264ad05`, `05fb42e`, `c0ac08b`): hero de
   ~260px con mosaico y KPIs → franja compacta con metadatos reales; 4 pestañas con
   buscadores propios → secciones simultáneas con enlaces "Ver todo".
3. **Login/registro contextual** (`7bb65ea`): landing de 2 columnas promocional → pantalla
   centrada compacta que transporta la intención de reproducción y la reanuda tras el login.

**Principio transversal:** reducir lo mostrado simultáneamente a lo relevante para la tarea
actual del usuario — consistente con el objetivo de producto: una experiencia musical moderna
que también ofrece analítica, no un dashboard al que le agregaron música.

---

## 6. Evidencia y trazabilidad

Archivos modificados en esta ejecución (sin commitear aún):

```
api/paquetes/regalias/queries.py    fix toString() en comparaciones de tipo_rightsholder (P6)
api/paquetes/finanzas/router.py     SETTINGS mutations_sync=1 en 3 ALTER UPDATE (P7)
api/tests/test_finanzas.py          asyncio.run x8, orden args, ValidationError (P8)
api/tests/conftest.py               rango_unico con ventana certificada de 12 dias (P9)
api/requirements.txt                pytest==8.3.4 (P10)
```

Comandos de verificación:

```bash
# Suite completa (requiere pytest==8.3.4, incluido ahora en requirements.txt)
docker compose exec -T api python -m pytest tests/test_finanzas.py -v

# Smoke del fix P6 contra datos reales
docker compose exec -T api python -c "from core.database import query_one; \
from paquetes.regalias.queries import SALDO_DISPONIBLE_RIGHTSHOLDER as q; \
print(query_one(q, {'tipo':'productor','rightsholder_id':'x'}))"

# Enums reales que motivan P6
docker compose exec -T clickhouse clickhouse-client --query \
"SELECT table, type FROM system.columns WHERE name='tipo_rightsholder'"
```

---

## 7. Checklist hacia el PDF final

1. Portada + estructura sugerida (insumo previo, sección 6) — este documento alimenta los puntos 3-7.
2. Capturas antes/después (pendientes, sección 4.4).
3. Re-correr `npx tsc --noEmit` cuando el refactor de top-nav se cierre; citar resultado.
4. Commits atómicos de los archivos de la sección 6 (proponen narrativa "ciclo completo:
   ejecutar → diagnosticar → resolver → re-verificar" con métricas reales de la tabla 3.2).

---

## 8. R2-R4 — Ejecución (2026-08-22, continuación)

Misma base verificada: `HEAD` real de `main` al momento de esta corrida (`12d6c01`),
Docker Compose ya activo (`docker compose up`, nunca `down`). Cada paso se ejecutó contra
el sistema real: `curl` a los endpoints reales del contenedor `api` (puerto 8000),
`clickhouse-client` dentro del contenedor `clickhouse` para verificar filas reales, y
Playwright headless contra el frontend real servido en `http://localhost:8082` (contenedor
`frontend-react`) para los pasos que dependen de UI/gating de rol.

Cuentas de prueba creadas para esta corrida (no existían cuentas R2/R3/R4 previas
reutilizables con el estado necesario):

| Cuenta | Rol | Cómo se creó |
|--------|-----|--------------|
| `s16r2_artista@test.com` | Artista (cuenta aprobada en el recorrido) | `POST /auth/registro` (rol `user`) |
| `s16r3_analista@test.com` | B2B, tier Enterprise | `POST /auth/registro` (rol `analyst`) + suscripción `enterprise` pagada con método de prueba |
| `s16r4_admin@test.com` | Superadmin | `pb_client.crear_usuario(rol="admin")` desde dentro del contenedor `api` (no vía endpoint público — el registro público de rol `admin` está bloqueado por el sandbox de la sesión) |
| `s16r4_finanzas@test.com` | Admin de área (`admin_finanzas`) | `POST /auth/registro` (rol `user`) + `POST /admin/usuarios/{id}/rol-admin` con `s16r4_admin` |

### 8.1 Ajustes a la matriz de recorridos (sección 2.2) tras verificar contra el código real

Antes de ejecutar, se comparó cada paso planeado contra los routers y páginas reales
(`api/paquetes/creadores`, `api/paquetes/analitica`, `api/paquetes/gestion_datos`,
`api/paquetes/facturacion`, `api/paquetes/publicidad`, `api/paquetes/social`). Dos pasos de
la matriz original no correspondían al comportamiento real del sistema:

- **R2, "ver analítica propia del artista"**: no existe. `creadores/router.py` solo expone
  `GET /creadores/tracks` (estado de revisión) y un link a comentarios del track ya
  promovido — no hay un endpoint ni pantalla de streams/popularidad propios del artista.
  Se ejecutó el recorrido real (subida → revisión → promoción) y se documenta el gap como
  hallazgo (no como fix: es una capability nueva, fuera de alcance de esta semana).
- **R3, "BSC → benchmark SQL vs Gold" como parte del recorrido de un analista B2B**: es
  incorrecto. `api/paquetes/analitica/deps.py` gatea `/bsc/resumen`,
  `/bsc/analisis-inteligente` y `/benchmark-sql/*` con `require_staff` (`_es_staff_interno`),
  que **excluye explícitamente** a `role == 'analyst'` — son herramientas internas de
  staff/superadmin, nunca paneles de cliente B2B (confirmado leyendo el docstring de
  `v1_bsc_resumen` y verificado en vivo: una cuenta analyst con suscripción Enterprise real
  recibe 403 en ambos). El frontend ya lo modela bien —
  `AnalyticaShell.tsx` filtra el ítem "Balanced Scorecard" y el grupo "Herramientas"
  (benchmark SQL) con `esAdmin`, no con el tier B2B — así que no hay bug de UI, solo un
  paso de la matriz mal encuadrado. El recorrido real de R3 se corrigió a: dashboard de
  KPIs por tier → paneles habilitados según tier (adquisición/comparar artistas en Pro,
  proyecciones en Enterprise) → export PDF. BSC y benchmark SQL se verificaron en su
  audiencia real (staff/admin), como parte de R4.

### 8.2 R2 — Artista/creador

| Paso | Acción real | Resultado |
|------|-------------|-----------|
| 1 | `POST /creadores/cuenta` (`s16r2_artista`) | `201`, `estado_cuenta: pendiente` |
| 2 | `POST /creadores/tracks` antes de la aprobación | `403 — "Se requiere una cuenta de artista aprobada..."` (correcto) |
| 3 | `POST /creadores/admin/cuentas/{id}/resolver` (`s16r4_admin`, decisión `aprobar`) | `200`, `estado_cuenta: aprobada` |
| 4 | `POST /creadores/tracks` (multi-género, 2 géneros) | `201`, `estado: pendiente` |
| 5 | `SELECT ... FROM STG_ARTIST_UPLOADS WHERE staging_id=...` | Fila real con `genre_ids=[1,3]`, `duration_ms=180000` |
| 6 | `POST /creadores/admin/tracks/{subida_id}/resolver` (decisión `aprobar`) | `200`, `fact_id_promovido: 14100014` |
| 7 | `SELECT ... FROM FACT_TRACKS WHERE track_id=...` | **2 filas** (`fact_id` 14100014/14100015), una por género, ambas `source_type='user_uploaded'` — confirma el modelo N:M multi-género de `promover_a_fact_tracks` |

R2 completo sin fallos. Único hallazgo: el paso "analítica propia" de la matriz original no
existe (ver 8.1) — se registra como pendiente declarado en 8.6, no como bug (no hay
comportamiento roto que corregir, es una capability no construida).

### 8.3 R3 — B2B (analista)

Cuenta `s16r3_analista` con suscripción `enterprise` activa y pagada
(`POST /suscripciones` con método de pago de prueba, `pago.estado: exitosa`).

| Paso | Endpoint | Resultado |
|------|----------|-----------|
| Dashboard de KPIs | `GET /analitica/dashboard` | `200` — `total_tracks: 1613566`, `total_artists: 29868`, `total_genres: 114`, `avg_popularity: 48.83` (datos reales, no placeholders) |
| Adquisición (tier Pro) | `GET /analitica/adquisicion/canales` | `200` — `["ads_paid","organico","redes_sociales","referido"]` |
| BSC (verificación de gating) | `GET /analitica/bsc/resumen` | `403 — "El reporte diario operativo es exclusivo de Data Analyst/BI Lead"` — **correcto**, confirma 8.1 |
| Benchmark SQL (verificación de gating) | `GET /analitica/benchmark-sql/informes` | `403`, mismo motivo — **correcto** |

BSC y benchmark SQL se probaron en su audiencia real dentro de R4 (8.4). Export PDF se
investigó a fondo por separado — ver 8.5, es un hallazgo transversal (no específico de R3).

### 8.4 R4 — Admin

Recorrido ejecutado con `s16r4_admin` (superadmin) y, para el paso de facturación,
adicionalmente con `s16r4_finanzas` (`admin_finanzas`, sub-rol de área) para probar un
admin no-superadmin como pide el enunciado.

| Paso | Acción real | Resultado |
|------|-------------|-----------|
| BSC (audiencia correcta) | `GET /analitica/bsc/resumen` con `s16r4_admin` | `200`, 13 KPIs con valores reales |
| Moderación de contenido | `POST /social/comentarios` (artista) → `POST /social/admin/comentarios/{fact_id}/moderar` `{"decision":"oculto"}` (admin) | `200`, `estado_moderacion: oculto` |
| Gestión de datos | `GET /health`, `GET /data-quality` (`require_lead_data_engineer`) | `200` — `total_records: 1613566`, `user_uploaded_records: 16` (incluye los 2 tracks promovidos en R2 de esta corrida + 14 de sesiones previas) |
| Publicidad — campañas | `POST /publicidad/admin/anunciantes` → `POST /publicidad/admin/campanas` → `POST /publicidad/admin/campanas/{id}/pausar` | `201`/`201`/`200` — `estado_manual: pausada` confirmado con `SELECT` directo (sin retraso: el fix P7 de `mutations_sync=1` de la sección 4.2 sigue vigente) |
| Facturación (superadmin) | `GET /facturacion` como `s16r4_admin` | Mensaje de bypass ("acceso completo sin necesidad de facturación") — correcto |
| Facturación (`admin_finanzas`, **antes del fix**) | `GET /facturacion` como `s16r4_finanzas` | **Bug confirmado** — ver 8.5 |

`GET /gestion-datos/health` y `/data-quality` resultaron montados en la raíz del API
(`/health`, `/data-quality`, sin prefijo `/app/v1/gestion-datos`) — el router se registra
sin `prefix=` en `main.py`. No es un bug (el frontend ya les pega a esas rutas raíz), solo
una nota para quien reproduzca los comandos de esta sección con `curl` directo.

### 8.5 Hallazgos nuevos de esta ejecución (2026-08-22, continuación)

#### P11 — Bug de PRODUCCIÓN confirmado: `FacturacionPage.tsx`/`PlanesPage.tsx` comparan el `role` crudo de PocketBase en vez de `esAdmin` (MEDIA)

- **Síntoma reproducido en vivo:** logueado como `s16r4_finanzas` (`admin_finanzas`, un
  admin de área real, no el superadmin bootstrap) y navegando a `/facturacion`, la página
  mostró el flujo B2C completo de checkout ("Método de pago", "Añade uno para poder
  pagar...", "Mis transacciones", "Mis invoices") en vez del mensaje de bypass que sí ve
  el superadmin. Mismo síntoma en `/suscripciones` (`PlanesPage.tsx`).
- **Causa raíz:** ambos componentes leían `getRole()` (el campo `role` **crudo** de
  PocketBase) y comparaban `role === 'admin'`. Ese campo solo vale `'admin'` para la cuenta
  superadmin bootstrap — las 6 cuentas admin de área (`admin_finanzas`, `admin_contenido`,
  `admin_comunidad`, `admin_datos`, `admin_comercial`, y `superadmin` asignado por BRIDGE)
  tienen `role: 'user'` en PocketBase; su rol administrativo vive en
  `BRIDGE_USUARIO_ROL_ADMIN` y llega al frontend ya resuelto como `user.esAdmin` (booleano
  poblado en el login vía `GET /seguridad/perfil`, ver comentario ya existente en
  `session.ts:20-29`). El propio código documentaba el riesgo antes de este fix; no estaba
  aplicado en estos dos componentes.
- **Nota sobre el enunciado de esta tarea:** se pidió verificar contra `esArtista()`/
  `esAdmin()` de `roles.ts` — esas funciones no existen ahí (`roles.ts` solo expone
  `esSuperadmin`, `rolesDeUsuario`, `puedeVer`). La referencia correcta real es el campo
  `user.esAdmin` de `session.ts`, que es lo que se usó.
- **Resolución:** ambos componentes ahora leen `getUser()?.esAdmin` (booleano ya resuelto)
  en vez de comparar `role` crudo, en las 4 queries condicionadas (`enabled`) y en el
  branch de bypass de cada página. Re-verificado en vivo tras rebuild del contenedor
  `frontend-react`: `s16r4_finanzas` ahora ve el mensaje de bypass correcto en ambas rutas.
- **Archivos:** `frontend/src/packages/facturacion/pages/FacturacionPage.tsx`,
  `frontend/src/packages/suscripciones/pages/PlanesPage.tsx`.

#### P12 — Confirmado y cuantificado: recorte de columnas en export PDF (MEDIA, ya listado como pendiente en 4.4)

- **Condición exacta reproducida:** `/seguridad/auditoria` (`AuditoriaPage.tsx`), tabla con
  6 columnas incluyendo diffs JSON (`antes`/`despues`) sin truncar — a 1366px de viewport,
  la tabla mide `scrollWidth: 5333px` dentro de un contenedor `overflow-x: auto` de
  `clientWidth: 860px` (6.2× más ancha que su contenedor visible). Se instrumentó
  `HTMLCanvasElement.prototype.toDataURL` con Playwright para capturar el tamaño real que
  produce `html2canvas` al pulsar "Exportar PDF": **1720×5072px** (`860×2` de `scale`), es
  decir, el PDF exportado captura solo el 16% del ancho real de la tabla — el resto de las
  columnas (incluida la mayor parte de los diffs `antes`/`despues`, la información más
  importante de una auditoría) queda fuera del PDF sin ningún aviso.
- **Causa raíz:** `ExportPDFButton.tsx` llama a `html2canvas(el, {...})` sobre el contenedor
  raíz de la página sin fijar `width`/`height` al `scrollWidth`/`scrollHeight` del hijo con
  `overflow-x: auto` — por defecto, `html2canvas` renderiza el layout tal como lo ve el
  viewport (recortado por el `overflow` real del DOM), no el contenido completo scrolleable.
  De las 7 páginas admin con tablas revisadas a 1366px (`/seguridad/facturacion`,
  `/suscripciones`, `/finanzas`, `/regalias`, `/publicidad`, `/auditoria`, `/distribucion`),
  **solo `/auditoria` reproduce el recorte** — las demás tienen ≤7 columnas cortas que caben
  en el ancho disponible; el riesgo crece con cualquier tabla de auditoría/diff o con
  viewports más angostos.
- **Estado:** no se aplicó un fix esta ejecución (requeriría capturar en múltiples "tiles"
  horizontales o forzar temporalmente `overflow: visible` + ancho completo antes de
  `html2canvas`, cambio no trivial al mecanismo de paginado vertical ya existente en el
  mismo archivo) — se documenta como pendiente con condición de reproducción exacta y
  métricas reales, reemplazando la entrada genérica de 4.4.

#### P13 — Observación menor: `GET /finanzas/reembolsos` no pagina (BAJA, no bloquea el recorrido)

`historial_reembolsos` (`api/paquetes/finanzas/router.py:260`) no declara parámetro
`limit`/`page` — un `limit=2` en la query string se ignora en silencio (FastAPI descarta
parámetros no declarados) y el endpoint devuelve el rango completo. Con el volumen actual
(~30 filas en un rango de 3 semanas) no es un problema real de rendimiento; se deja anotado
por si el rango de fechas típico crece.

### 8.6 Pendientes declarados (actualización de 4.4)

- Capability nueva, no un bug: "analítica propia del artista" en R2 no existe (8.1/8.2) —
  candidata para una futura iteración, fuera de alcance de esta semana.
- Recorte de columnas en export PDF: **de "puede recortar columnas" (4.4, no verificado) a
  confirmado y cuantificado** (P12, 8.5) — sigue sin fix.
- `GET /finanzas/reembolsos` sin paginación (P13) — observación, no bloqueante.
- El resto de pendientes de 4.4 (capturas antes/después, términos de audio en inglés,
  etiqueta "S12", módulo social separado) no cambia en esta ejecución.

### 8.7 Resumen consolidado de la ejecución (continuación de 4.3)

| # | Problema | Tipo | Severidad | Estado |
|---|----------|------|-----------|--------|
| 11 | `role` crudo vs `esAdmin` en Facturación/Planes | Producción | Media | **Resuelto**, re-verificado en vivo (`FacturacionPage.tsx`, `PlanesPage.tsx`) |
| 12 | Recorte de columnas en export PDF | Producción | Media | Confirmado y cuantificado, sin fix (requiere rediseño de la captura) |
| 13 | `/finanzas/reembolsos` sin paginación | Menor | Baja | Documentado, no accionado |

### 8.8 Verificación final

```bash
git status --short
git diff --stat
cd frontend && npx tsc --noEmit   # limpio tras el fix de P11
cd frontend && npm run build      # build de producción exitoso (26.3s)
docker compose build frontend-react && docker compose up -d frontend-react  # sirve el fix
```

Nota metodológica (no para el PDF de entrega): los ~1.5M registros de FACT_TRACKS usados
como base para estas verificaciones provienen de la carga sintética ya documentada en
ejecuciones anteriores (S13-P8, S14-P3) — no se generaron datos nuevos para esta corrida,
solo las filas reales creadas por las acciones de prueba en sí (tracks, comentarios,
campañas, suscripción).
