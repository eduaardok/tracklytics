# Bitácora de Desarrollo — Semana 15
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 15 (post-cierre de S14)

---

## S15-P1 — Auditoría exhaustiva de validación de entrada de datos, los 17 paquetes (12 ago 2026)

Modo autónomo: se decidió y documentó sin pausar a preguntar, salvo las decisiones de criterio
de negocio ya justificadas caso por caso en cada reporte de paquete. Encargo: auditar
campo por campo los ~115 endpoints de escritura del backend (17 paquetes) más sus forms de
frontend, corrigiendo tipos/rangos/longitudes/PK-inmutable/inyección donde faltaran, sin tocar
DAGs ni terminología de "sintético" en mensajes visibles al usuario.

### Fase 0 — Censo real

Censo propio recalculado (no se confió en el del enunciado): **115 endpoints de escritura**
reales, coincide exactamente con la estimación una vez sumado `simulacion` (1 endpoint que el
grep inicial no detectaba por vivir en un router secundario, `router_bajo_demanda`). El mismo
patrón se repitió en `partners` (4 endpoints reales via `v1_router`, el censo original decía 0).

### El intento con agentes en background se interrumpió a mitad de camino

Se lanzaron 5 agentes en background, uno por lote de paquetes, para paralelizar la auditoría.
Todos murieron por un límite de gasto mensual de la cuenta antes de terminar — algunos ni
siquiera llegaron a tocar código (`creadores`, `finanzas`), otros dejaron el código corregido
pero sin su reporte, y al menos dos (`biblioteca`, `suscripciones`) dejaron imports sin usar
(`EmailStr`, `Annotated`, `PlanId`, `EstadoSuscripcion`) que eran la señal de un fix a medio
aplicar. El resto de la sesión fue una revisión manual completa de cada diff dejado a medias —
nunca se asumió que un paquete estaba terminado sin comparar el diff real contra el archivo.
Esa revisión encontró trabajo genuinamente bueno en la mayoría de los paquetes que sí alcanzaron
a tocarse (código con justificación de negocio real, no solo `Field(...)` mecánico), pero
también los huecos reales que quedaban.

### Hallazgo prioridad #1 confirmado: inyección SQL real en `gestion_datos`

El enunciado señalaba `gestion_datos.DimRecord` como punto ciego a revisar primero. Resultó ser
el hallazgo más grave del repo: el CRUD genérico de dimensiones (`dim_create`/`dim_update`)
armaba `INSERT`/`UPDATE` por concatenación de f-strings con las keys y values del payload sin
escapar — inyección SQL real, verificada con `curl`: un payload con
`x'); DROP TABLE DIM_GENRES; --` se insertó como texto literal inocuo en vez de ejecutarse.
Corregido con el protocolo nativo del driver (`insert_row()`, mismo patrón que ya usa el resto
del código) y una whitelist de columnas reales contra `system.columns`.

### Segundo patrón de inyección, encontrado en 3 paquetes más

El mismo tipo de vulnerabilidad (identificador de recurso interpolado sin validar en un filtro o
URL de PocketBase) apareció también en `partners`, `biblioteca` y `experiencia` — los tres
corregidos con `Path(pattern=...)`/`Field(pattern=...)` validando el formato real de un ID de
PocketBase (15 caracteres base32) en el borde de la API, verificado con `curl` real en los tres.
En `partners` el blast radius era mayor (token de superusuario de PocketBase); en `experiencia`
era alcanzable con input admin-controlado sin pasar por ningún picker de UI.

### Otros hallazgos reales (no solo ausencia de constraint)

- `regalias`: los 5 campos de split de reparto podían sumar 100% con un valor negativo
  individual (`150 + -50 = 100` pasaba la única validación existente).
- `social`: una denuncia "resuelta" podía re-resolverse o volver a "revisada" — sin chequeo de
  transición de estado.
- `finanzas`: `ReembolsoBody.motivo` no tenía absolutamente ninguna validación (ni vacío) para
  una operación contable auditable; un gasto `anulado` podía editarse como si estuviera vigente.
- `creadores`: `duration_ms` sin ninguna validación de signo ni rango — rango real consultado en
  ClickHouse (`docker exec tracklytics_api python -c "..."`) para fijar el límite superior.
- `distribucion`: `PaisConfigBody.tasa_cambio_a_usd` sin `gt=0` — una tasa 0/negativa rompe
  conversiones de moneda aguas abajo.
- `seguridad`: un permiso podía crearse para un usuario/recurso/acción que no existen.
- `suscripciones`: un filtro admin ("suspendida") que nunca podía devolver resultados porque el
  backend nunca escribe ese estado — dead code en el frontend, ahora cerrado en ambos lados.

### Verificación real (Fase 3)

`curl` real (no simulado) contra el stack levantado, con la cuenta demo `superadmin` de
`docs/CUENTAS_DEMO.md`. Se priorizaron los 13 hallazgos críticos — cubre 10 de los 17 paquetes
con evidencia ejecutada y pegada en
`docs/auditoria_validacion/REPORTE_FINAL.md`, incluyendo la prueba de inyección SQL real contra
`gestion_datos` y las tres pruebas de inyección de filtro PocketBase. `creadores` quedó
verificado contra el modelo Pydantic directo en el contenedor (el endpoint real está detrás de
un gate de email-verificado preexistente no relacionado con esta auditoría).

Build: `python -m py_compile` limpio y `npm run build` limpio, tanto en el working tree como en
un clone local aparte (`npm ci` desde `package-lock.json`, sin el bug de S13-P4). Los 6 servicios
del stack siguieron `healthy` tras un `docker compose restart api` puntual — nunca se usó `down`.

### Archivos nuevos o modificados

- `api/core/database.py` — `insert_row()` nuevo (protocolo nativo, usado por `gestion_datos`).
- 16 paquetes de `api/paquetes/*/router.py` (+ `planes.py` en `suscripciones`, `pb_client.py`
  intacto en los 3 casos de inyección PocketBase — el fix vive en el borde de la API, no en el
  cliente).
- Forms correspondientes en `frontend/src/packages/*/` — `maxLength`/`min`/`max` reflejando los
  mismos límites del backend, más un `.errorText`/`.modalWarn` nuevo en 2 CSS modules que no
  tenían un estilo de advertencia de texto.
- `docs/auditoria_validacion/` — 17 reportes por paquete + `REPORTE_FINAL.md` consolidado.

16 commits atómicos a `main`, uno por paquete (`fix(validacion): <paquete> — ...`) más uno de
documentación para `analitica`/`reportes` (0 endpoints de escritura, confirmado).
