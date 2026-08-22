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
