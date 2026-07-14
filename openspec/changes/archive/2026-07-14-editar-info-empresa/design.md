## Context

`InvoiceDetailPage.tsx` (líneas 60-62) muestra "Tracklytics S.A." / "RUC 0000000000001" / "Quito,
Ecuador" como JSX estático, sin ningún origen de datos detrás. No existe en el proyecto ninguna
capability, tabla ni colección para "información de la empresa" — es un dato de negocio real
(identidad fiscal del emisor) que hoy vive solo como texto en el código.

## Goals / Non-Goals

**Goals:**
- Que el Lead Data Engineer/CTO pueda editar razón social, RUC y dirección desde la interfaz de
  gestión, sin tocar código.
- Que el encabezado de cada factura siempre refleje el valor vigente.
- Que una instalación nueva del sistema no quede con el encabezado vacío (seed con los valores
  actuales como default).

**Non-Goals:**
- No se agrega historial de cambios de la información de la empresa más allá del registro ya
  estándar en `FACT_AUDIT_LOG` (quién cambió qué y cuándo) — no hay una vista de "versiones
  anteriores" de la razón social.
- No se agregan más campos que los tres ya identificados (razón social, RUC, dirección) — logo y
  otros elementos visuales de la factura quedan fuera de este alcance.
- No se permite más de un registro de empresa (no es un modelo multi-tenant) — el sistema es de una
  sola empresa emisora, consistente con el resto del proyecto.

## Decisions

### 1. `DIM_EMPRESA` en ClickHouse, fila única — no PocketBase, no una tabla nueva de N filas
El resto de "dimensiones" administrables por el Lead Data Engineer (`DIM_SELLO_DISCOGRAFICO`,
`DIM_CANAL_MARKETING`, etc.) ya vive en ClickHouse, y `FACT_INVOICE` — el consumidor natural de este
dato — también. Se agrega `DIM_EMPRESA` con una única fila fija (`empresa_id = 1`), editada vía
`ALTER TABLE ... UPDATE` (mismo patrón que el resto de dimensiones vía `PUT /dim/{table}/{id}` en
`gestion_datos`, pero con su propio endpoint dedicado en `facturacion` en vez de sumarla al CRUD
genérico, porque conceptualmente no es una dimensión "de catálogo" sino una configuración global de
negocio con un único registro válido siempre).

**Alternativa descartada**: usar PocketBase (como hacen `suscripciones`/`creadores` para entidades
operativas). Se descartó porque el dato se consume junto a `FACT_INVOICE`, ya en ClickHouse — cruzar
de PocketBase a ClickHouse en cada render de una factura habría sido una complejidad innecesaria
para un valor que cambia con muy poca frecuencia.

**Alternativa descartada**: sumar `DIM_EMPRESA` al CRUD genérico de dimensiones ya existente
(`PUT /dim/{table}/{record_id}` en `gestion_datos`). Se descartó porque ese CRUD trata cada
dimensión como una lista de N filas con un PK autoincremental — forzar una fila única ahí sería más
confuso que un endpoint propio y explícito (`GET`/`PUT /facturacion/empresa`, sin id en la URL).

### 2. Lectura abierta a cualquier usuario autenticado, escritura solo admin
Cualquier usuario que vea su propia factura necesita leer el encabezado de la empresa — no tiene
sentido restringir la lectura a admin. La escritura sí usa `require_admin`, mismo criterio que el
resto de acciones administrativas de `facturacion` (`dashboard_facturacion`, auditoría de terceros).

## Risks / Trade-offs

- **[Trade-off]** Sin historial de versiones de la información de la empresa — una factura emitida
  antes de un cambio de razón social mostrará, al reabrirla, la razón social ACTUAL, no la vigente
  al momento de emitirse. Aceptado: el proyecto no versiona ningún otro dato de "encabezado" de
  factura tampoco (ej. el logo), y agregar snapshot histórico por invoice está fuera del alcance de
  esta mejora puntual.
