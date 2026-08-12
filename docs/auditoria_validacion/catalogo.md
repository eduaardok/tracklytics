# Auditoría de validación — `catalogo`

0 `BaseModel` definidos, 2 endpoints de escritura. Confirmado el punto ciego señalado como
"BaseModel=0" — pero al inspeccionar, ninguno de los dos endpoints de escritura recibe un
body JSON: son acciones administrativas sobre un recurso identificado por path param.

## Endpoints de escritura

| Endpoint | Payload | Estado antes | Estado después |
|---|---|---|---|
| `POST /admin/tracks/{fact_id}/ocultar` | ninguno (solo path param) | `fact_id: int` sin cota inferior | `fact_id: int = Path(..., ge=1)` |
| `POST /admin/tracks/{fact_id}/restaurar` | ninguno (solo path param) | igual | igual, corregido |

No hay `dict[str, Any]` ni modelo sin tipar en este paquete: la ausencia de `BaseModel` es
correcta para estos dos endpoints (no reciben body), no es el hallazgo crítico que sí es
`gestion_datos`. `fact_id` ya estaba protegido de tipo (`int`, rechaza no-numéricos con 422 por
FastAPI), pero no tenía cota inferior — un `fact_id=-5` o `fact_id=0` llegaba hasta la query
SQL (aunque `TRACK_DISPONIBILIDAD_POR_FACT` simplemente no encuentra la fila y responde 404, no
hay corrupción de datos posible, pero permitir negativos para un ID que nunca es negativo en el
dominio es ruido innecesario en la superficie de la API).

### Corrección aplicada

`Path(..., ge=1)` en ambos endpoints — `fact_id` es un entero autoincremental de ClickHouse,
nunca 0 ni negativo en el dominio real.

## PK inmutable

No aplica: ninguno de los dos endpoints acepta un payload con identificador editable.

## Frontend

El panel de takedown (`RevisionCreadoresPage`/moderación de catálogo, ver paquete `creadores`/
`seguridad`) llama a estos endpoints solo con el `fact_id` ya conocido de una fila listada — no
hay input de usuario libre para `fact_id` en el flujo de UI, así que no hay superficie de
frontend que corregir aquí.

## Resto del paquete (solo lectura, fuera de alcance de esta auditoría)

`GET /search`, `/tracks/*`, `/artists/*`, `/albums/*`, `/genres/*` — todos de solo lectura, ya
usan `Query(..., ge=..., le=...)` donde corresponde (`limit`, `popularity_min`, `energy_min`,
etc.). Sin cambios.
