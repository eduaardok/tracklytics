## Why

`publicidad`, `suscripciones` y `analitica` cubren hoy el flujo mínimo de monetización (un solo
formato de anuncio, alta/cancelación de suscripción sin motivo, sin período de prueba, y sin
vista consolidada de negocio). Faltan cuatro piezas que la operación real del negocio freemium
necesita: monetizar también con anuncios display (no solo audio), entender por qué se cancelan
las suscripciones, reducir la fricción de conversión free→premium con un trial gratuito y una
tarifa estudiantil, y darle a Lead Data Engineer/CTO y Data Analyst/BI Lead una vista de negocio
consolidada (funnel de conversión y P&L). Ninguna de las tres capabilities necesita nacer de
nuevo: se trata de ampliar su alcance ya definido.

## What Changes

- **Publicidad — tipo de anuncio (audio vs. display)**: se saca del alcance de `publicidad` el
  formato display, hasta ahora explícitamente excluido. Una campaña pasa a tener un
  `tipo_anuncio` (audio o display, exclusivo), las campañas display llevan una `url_destino` de
  redirect, y las impresiones registran si hubo `click`. El trigger de audio no cambia; se agrega
  un trigger de display independiente del reproductor, disparado al cargar home/catálogo para un
  usuario free.
- **Suscripciones — churn con motivo**: cancelar una suscripción activa pasa a pedir un motivo
  (con default si no se especifica) y a dejar un registro auditable de cada cancelación
  (`FACT_CANCELACION_SUSCRIPCION`), consumido por un nuevo reporte de tasa de churn mensual en
  `analitica`.
- **Suscripciones — trial gratuito + plan estudiante**: la primera vez que un Usuario B2C
  confirma el plan premium, entra a un período de prueba de 7 días sin cobro inmediato; al
  expirar, se cobra automáticamente si no se canceló antes. Se agrega un plan `estudiante` (mismo
  alcance que premium, precio menor) que exige un email institucional en el flujo de selección.
- **Analítica — funnel de conversión y P&L consolidado**: dos vistas nuevas para
  Lead Data Engineer/CTO y Data Analyst/BI Lead — el funnel free → vio anuncio → se suscribió, y
  un P&L que consolida ingreso por suscripciones, ingreso publicitario y regalías pagadas en un
  margen neto por período.
- Ningún cambio afecta al reproductor de audio ni a la resolución de covers — quedan fuera de
  alcance.

## Capabilities

### New Capabilities

Ninguna — este change amplía capabilities ya existentes.

### Modified Capabilities

- `publicidad`: nuevo requirement de administración de campañas con `tipo_anuncio`; nuevo
  requirement de trigger de impresión display independiente del reproductor; el requirement de
  reconocimiento de ingreso pasa a cubrir ambos tipos de anuncio explícitamente.
- `suscripciones`: el requirement "Cancelar suscripción activa" pasa a exigir/registrar un
  motivo de cancelación; el requirement "Selección de plan según tipo de actor" se amplía para
  cubrir el plan `estudiante` con validación de email institucional; nuevo requirement de período
  de prueba gratuito al confirmar premium por primera vez.
- `analitica`: tres requirements nuevos — tasa de churn mensual, funnel de conversión
  free→premium, y P&L consolidado.

## Impact

- **Backend**: `api/paquetes/publicidad` (router, queries, esquema `DIM_CAMPANA_PUBLICITARIA`/
  `FACT_IMPRESION_ANUNCIO` en ClickHouse), `api/paquetes/suscripciones` (router, `pb_client.py`,
  `planes.py`, esquema de la colección `suscripciones` en PocketBase vía `pb_init.py`), nueva
  tabla ClickHouse `FACT_CANCELACION_SUSCRIPCION`, `api/paquetes/analitica` (router, queries).
- **Frontend**: `frontend/src/packages/publicidad` (banner display + admin de campañas),
  `frontend/src/packages/suscripciones` (selección de plan estudiante, motivo de cancelación),
  `frontend/src/packages/analitica` (reemplaza el placeholder `ComingSoonPage` de
  `/analitica/suscripciones` por el dashboard de churn; nuevas rutas de funnel y P&L).
- **Dependencias existentes reutilizadas, sin cambios de contrato**: `facturacion.procesar_pago`
  (cobro automático al expirar el trial y al confirmar plan estudiante), `regalias` (lectura de
  `FACT_LIQUIDACION_REGALIA` para el P&L).
