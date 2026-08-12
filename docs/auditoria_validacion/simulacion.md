# Auditoría de validación — `simulacion`

**Corrección al censo original**: "1 endpoint de escritura" contaba solo `@router.post`, pero
el paquete monta un segundo router, `router_bajo_demanda`, con otro endpoint de escritura real:
`POST /generar-historico`. Total real: **2 endpoints de escritura**, 2 `BaseModel`.

## Endpoints y modelos

| Endpoint | Modelo | Estado antes | Estado después |
|---|---|---|---|
| `POST .../generar-historico` (bajo demanda) | `GenerarHistoricoBody` | `periodo_fin > periodo_inicio` ya validado; sin tope superior de rango — un rango de décadas disparaba de más contra Airflow/ClickHouse | tope de 1095 días agregado |
| `POST /generar-actividad` | `GenerarActividadBody` | `n_streams`/`n_suscripciones`/`n_impresiones` sin ningún límite (ni `ge`, ni `le`) | `ge=0`, `le=` 100x el default de cada uno |

## Correcciones aplicadas

- **`GenerarHistoricoBody`**: `RANGO_MAXIMO_DIAS = 1095` (3 años) — mismo horizonte que la capa
  Gold agrega realmente (`etl/gold_ch/base.py::VENTANA_ORIGEN_DIAS`, el mayor de los 5
  horizontes por granularidad). Un rango mayor no rompe nada, pero genera actividad que ningún
  informe compuesto vuelve a leer, además de meses-dominio de más contra Airflow/ClickHouse sin
  beneficio. `HTTPException(422)` explícita con el motivo.
- **`dominios`**: se mantiene la validación explícita contra `DOMINIOS_BAJO_DEMANDA` en el
  handler (ya existía) en vez de tipar el campo `list[Literal[...]]` en el modelo — un
  `Literal` inválido daría 422 igual, pero como error de parseo de Pydantic (lista de objetos en
  `detail`) que `frontend/src/shared/lib/api-client.ts::request()` no interpreta y cae a un
  mensaje genérico. Manteniendo la validación explícita, el cliente sigue mostrando qué dominio
  exacto fue rechazado.
- **`GenerarActividadBody`**: `Field(ge=0, le=N_x_DEFAULT * 100)` en los tres contadores. A
  diferencia de `/generar-historico` (dispara un DAG async y responde de inmediato), este
  endpoint corre **síncrono** en el hilo del request — genera e inserta en ClickHouse antes de
  responder. Sin tope, un valor desmedido (un cero de más, por error o deliberado) bloquea el
  request y arma un batch insert sin límite. 100x cada default (`n_streams` hasta 500.000,
  `n_suscripciones` hasta 5.000, `n_impresiones` hasta 20.000) es generoso para pruebas de carga
  manuales sin permitir eso.

## PK inmutable

No aplica: ninguno de los dos endpoints edita un recurso por ID.

## Inyección SQL

Sin hallazgos — ambos endpoints insertan vía `get_client().insert(...)` (protocolo nativo), no
SQL de texto.

## Frontend — `SimulacionPage.tsx`

`max` agregado a los tres inputs numéricos de `/generar-actividad` (500000 / 5000 / 20000,
reflejando los topes del backend). El rango de fechas de `/generar-historico` no tiene un
control HTML nativo equivalente a "máximo N días entre dos `<input type="date">`" — se dejó sin
tope de frontend; el error 422 real del backend ya se muestra vía `toast.error(apiErrorMessage(...))`,
patrón ya usado en ambos formularios del paquete.
