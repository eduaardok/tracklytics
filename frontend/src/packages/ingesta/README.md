# Package: ingesta

> Gestión de datos del catálogo, montado bajo `/seguridad/*` (admin-only vía `SeguridadShell`,
> mismo patrón que los demás back-office de otras capabilities):
> - `EtlPage` (`/seguridad/ingesta`) — disparo de carga por semana (Airflow DAG), monitoreo en
>   tiempo real por polling (no hay websockets — 5s/tick, igual que `app/analytics/etl.html`),
>   idempotencia (`forzar_recarga`) e historial con tasa de rechazo.
> - `CrudDimensionesPage` (`/seguridad/ingesta/dimensiones`) — CRUD genérico de las 11 DIM
>   editables (`DIM_TABLES` en `api/core/config.py`) + vista de solo lectura de `FACT_TRACKS`.
>   Confirmación de dos pasos al eliminar una dimensión referenciada (RN-ING-004).
> - `DataQualityPage` (`/seguridad/ingesta/calidad`) — distribución por origen (real/sintético/
>   subido por artista) y salud de la última carga.
>
> El backend real (`api/paquetes/gestion_datos/`) NO usa el prefijo `/app/v1` en la mayoría de
> sus rutas (`/health`, `/etl/*`, `/data-quality`, `/facts`, `/dim/*`) — solo `/app/v1/ingesta/*`
> (disparo/estado/historial) lo tiene. `api/ingesta.api.ts` resuelve esto con un `rawRequest`
> que apunta a la raíz del backend, mismo patrón que `analitica.api.ts` ya usaba para
> `/dashboard/executive`.

## Estructura

```
packages/ingesta/
├── pages/          # Vistas de nivel ruta (cada archivo = una ruta)
├── components/     # Componentes internos — NO exportar desde aquí
├── api/            # Llamadas tipadas a los endpoints FastAPI de este paquete
├── types.ts        # Tipos del dominio de esta capability
└── index.ts        # Única interfaz pública — lo único importable por otros paquetes
```

## Regla de aislamiento

Otros paquetes **solo pueden importar desde `index.ts`** de este módulo.
Nunca importar directamente desde `components/`, `pages/`, ni `api/`.
