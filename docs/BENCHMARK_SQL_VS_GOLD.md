# Benchmark: SQL directo vs. capa Gold pre-agregada

S16-P1 (fase 1 del prompt "Benchmark SQL vs Gold + polish visual + verificación de UX por rol").
Evidencia real, medida contra el stack levantado en este equipo (no estimada, no redondeada a
mano) de por qué existe la capa Gold (ClickHouse 8124) en vez de calcular los 30 informes
compuestos agregando en caliente sobre el catálogo (ClickHouse 8123, 76 tablas físicas) en cada
carga de página.

## Cómo reproducirlo

- Backend: `POST /app/v1/analitica/benchmark-sql/{informe_id}/ejecutar` (gateado
  `require_staff`, igual que `/analitica/bsc/resumen` y `/analitica/reporte-diario`).
  `GET /app/v1/analitica/benchmark-sql/informes` lista los 3 disponibles.
- Frontend: `/analitica/benchmark-sql` (sección "Benchmark SQL vs Gold" del sidebar de
  Analítica, solo staff/admin) — botón **"Medir ahora"** por informe, nunca se dispara solo al
  entrar a la pantalla (la versión SQL directa escanea millones de filas).
- Código: `api/paquetes/analitica/benchmark_sql.py`.

No confundir con `/analitica/benchmark` (`ArtistaBenchmarkPage`, comparación de popularidad
entre dos artistas — un informe de negocio, C18, sin relación con rendimiento de
infraestructura). Esta pantalla nueva vive en `/analitica/benchmark-sql`.

## Metodología

1. Se eligieron 3 de los 30 informes compuestos ya existentes como tabla Gold, priorizando los
   que agregan sobre `FACT_TRACKS` (1 313 556 filas reales) y/o `FACT_ENGAGEMENT_USUARIO`
   (1 010 518 filas reales, de las cuales 929 663 son `event_type = 'reproduccion'`).
2. Para cada informe se escribió la query SQL que lo calcula **desde cero** sobre las tablas
   base, reproduciendo la misma lógica de negocio que ya corre en `etl/gold_ch/*.py` (no una
   versión simplificada).
3. La ventana de tiempo (y, para el informe B, el conjunto exacto de géneros) **no se fija a
   mano**: se lee del contenido real de la tabla Gold en el momento de la medición
   (`_ventana_desde_gold` en `benchmark_sql.py`) — es la única forma de que "los resultados
   coinciden" sea una comprobación real y no una coincidencia forzada por parámetros elegidos a
   ciegas para que calcen.
4. Cada query (directa y Gold) se ejecuta **3 veces reales** y se promedia — nunca una sola
   corrida en frío, ClickHouse cachea (mark cache / page cache) entre corridas idénticas. Se
   reportan las 3 mediciones individuales, no solo el promedio.
5. `filas_leidas` sale de `result.summary['read_rows']`, expuesto directamente por
   `clickhouse-connect` (encabezado `X-ClickHouse-Summary` del propio ClickHouse) — no es una
   estimación.
6. Se verifica que ambos caminos devuelven el mismo resultado numérico (tolerancia de redondeo
   ±0.5–1 donde aplica). Si no coincidieran sería un bug de la query directa, a corregir antes
   de documentar — los 3 informes de abajo coinciden.

## Informe A — Reproducciones totales + usuarios activos promedio (52 semanas)

Equivalente a **C14, Panel ejecutivo** (`GOLD_ENGAGEMENT_PERIODO`, fila rollup `genero=''`).
`usuarios_activos_promedio` es un promedio de conteos únicos **por semana** (no el total de
usuarios únicos de las 52 semanas juntas) — el SQL directo agrupa por semana antes de promediar
para reproducir exactamente esa semántica.

**SQL directo** (catálogo, 8123):
```sql
SELECT
    (SELECT count() FROM FACT_ENGAGEMENT_USUARIO
     WHERE event_type = 'reproduccion'
       AND event_timestamp >= {desde:DateTime} AND event_timestamp < {hasta:DateTime}) AS reproducciones,
    (SELECT round(avg(activos), 2) FROM (
        SELECT toStartOfWeek(event_timestamp, 1) AS semana, uniqExact(user_id) AS activos
        FROM FACT_ENGAGEMENT_USUARIO
        WHERE event_timestamp >= {desde:DateTime} AND event_timestamp < {hasta:DateTime}
        GROUP BY semana
    )) AS usuarios_activos_promedio
```

**SQL Gold** (8124):
```sql
SELECT sum(reproducciones_total) AS reproducciones,
       round(avg(usuarios_activos), 2) AS usuarios_activos_promedio
FROM GOLD_ENGAGEMENT_PERIODO WHERE granularidad = 'semana' AND genero = ''
```

**Medición real** (3 corridas cada uno):

| Camino | Corrida 1 | Corrida 2 | Corrida 3 | Promedio | Filas leídas | Resultado |
|---|---|---|---|---|---|---|
| SQL directo | 0.2505s | 0.3521s | 0.4319s | **0.3448s** | 2 021 033 | `(611617, 6473.35)` |
| Gold | 0.0320s | 0.0278s | 0.0288s | **0.0295s** | 1 936 | `(611617, 6473.35)` |

**Factor de mejora: 11.7x más rápido.** Resultados idénticos.

## Informe B — Top 10 géneros por reproducciones (52 semanas)

Equivalente a **C15, Ranking de géneros** (`GOLD_CONSUMO_GENERO_PERIODO`). Esta tabla Gold ya
restringe a los 15 géneros históricamente más reproducidos (`etl/gold_ch/consumo_genero.py`) —
el SQL directo agrega sobre exactamente ese mismo conjunto de `genre_id` (leído de la propia
tabla Gold, no recalculado aparte), para comparar la misma pregunta de negocio con los mismos
datos de entrada.

**SQL directo** (catálogo, 8123 — join de las 3 tablas más grandes involucradas):
```sql
SELECT g.name AS genero, count() AS reproducciones
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS t ON t.fact_id = e.fact_id
JOIN DIM_GENRES g ON g.genre_id = t.genre_id
WHERE e.event_type = 'reproduccion'
  AND t.genre_id IN (45,16,71,24,82,10,84,95,81,66,56,6,98,80,34)
  AND e.event_timestamp >= {desde:DateTime} AND e.event_timestamp < {hasta:DateTime}
GROUP BY genero
ORDER BY reproducciones DESC
LIMIT 10
```

**SQL Gold** (8124):
```sql
SELECT genero, sum(reproducciones) AS reproducciones
FROM GOLD_CONSUMO_GENERO_PERIODO WHERE granularidad = 'semana' AND genre_id != 0
GROUP BY genero ORDER BY reproducciones DESC LIMIT 10
```

**Medición real:**

| Camino | Corrida 1 | Corrida 2 | Corrida 3 | Promedio | Filas leídas |
|---|---|---|---|---|---|
| SQL directo | 0.2905s | 0.3750s | 0.3570s | **0.3408s** | 1 272 493 |
| Gold | 0.0410s | 0.0294s | 0.0249s | **0.0317s** | 4 394 |

**Factor de mejora: 10.8x más rápido.** Top 10 idéntico en ambos caminos:

`pop-film (8797), k-pop (8511), chill (8024), sad (7889), grunge (7593), indian (7488), emo (7279), sertanejo (7277), anime (7245), progressive-house (7123)`

## Informe C — Popularidad promedio del catálogo completo

Equivalente a **C18, Benchmark de popularidad** (`popularidad_catalogo_base` en
`GOLD_CONSUMO_GENERO_PERIODO`). A propósito, distinto de A/B: sin joins ni ventana de tiempo, un
único `avg()` sobre las 1 313 556 filas completas de `FACT_TRACKS` — contraste deliberado para
mostrar que el costo no siempre viene de un join, a veces es un full scan de agregación.

**SQL directo:**
```sql
SELECT round(avg(popularity), 2) AS popularidad_catalogo_base FROM FACT_TRACKS
```

**SQL Gold:**
```sql
SELECT popularidad_catalogo_base FROM GOLD_CONSUMO_GENERO_PERIODO
WHERE granularidad = 'semana' LIMIT 1
```

**Medición real:**

| Camino | Corrida 1 | Corrida 2 | Corrida 3 | Promedio | Filas leídas | Resultado |
|---|---|---|---|---|---|---|
| SQL directo | 0.0284s | 0.0345s | 0.0222s | **0.0284s** | 1 313 556 | `44.21` |
| Gold | 0.0229s | 0.0111s | 0.0158s | **0.0166s** | 4 394 | `44.209999...` |

**Factor de mejora: 1.7x más rápido.** Resultado prácticamente idéntico (diferencia de
redondeo de punto flotante, no de datos).

## Conclusión

| Informe | Filas escaneadas (directo) | Filas escaneadas (Gold) | Factor de mejora |
|---|---|---|---|
| A — Reproducciones + usuarios activos | 2 021 033 | 1 936 | **11.7x** |
| B — Ranking de géneros (join de 3 tablas) | 1 272 493 | 4 394 | **10.8x** |
| C — Popularidad de catálogo (full scan, sin join) | 1 313 556 | 4 394 | **1.7x** |

La ganancia real de Gold no es constante — depende de qué tan cara es la pregunta que
reemplaza:

- Cuando el informe requiere **joins entre tablas grandes** agrupados por una dimensión (género,
  período) — informes A y B — Gold gana por **~11x**: ClickHouse tiene que materializar y
  cruzar más de un millón de filas de dos o tres tablas distintas en el camino directo, contra
  leer unos pocos miles de filas ya resueltas en Gold.
- Cuando el informe es un **único agregado columnar sin join** sobre una sola tabla (`avg()`
  simple) — informe C — la ventaja se reduce a **~1.7x**: el motor columnar de ClickHouse ya es
  extremadamente eficiente para ese caso por sí solo, sin necesitar una capa de pre-agregación.

En los 3 casos los resultados numéricos **coinciden exactamente** (o difieren solo por redondeo
de punto flotante) entre el camino directo y Gold — la capa Gold no sacrifica exactitud a cambio
de velocidad, en este dataset. La razón de negocio para que exista Gold no es "SQL directo es
lento" en términos absolutos (0.03s–0.34s siguen siendo interactivos para una sola consulta) —
es que los 30 informes compuestos, con selectores de período/granularidad y múltiples usuarios
concurrentes en el panel de reportes, multiplican ese costo; pre-agregar una vez por semana
(`dag_gold_aggregations`, ver `docs/BITACORA_S16.md`) y leer un puñado de filas en cada request
es lo que mantiene esos 30 endpoints por debajo de 50ms sin importar cuántos se abran a la vez.

## Ambiente de medición

- Stack local (`docker compose up`), sin otra carga concurrente durante la medición.
- ClickHouse catálogo (8123): 1 313 556 filas en `FACT_TRACKS`, 1 010 518 en
  `FACT_ENGAGEMENT_USUARIO`, 114 en `DIM_GENRES`.
- ClickHouse Gold (8124): `GOLD_ENGAGEMENT_PERIODO` 1 936 filas, `GOLD_CONSUMO_GENERO_PERIODO`
  4 394 filas.
- Medido 2026-08-12, `main` @ `9fe5951` (rama con el schedule `@weekly` de
  `dag_gold_aggregations` ya activo, ver `docs/BITACORA_S16.md`).
