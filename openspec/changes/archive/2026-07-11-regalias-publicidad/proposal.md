## Why

La auditoría de S10 (semana 10 de 16) encontró que dos piezas centrales del modelo de negocio
real de streaming musical no existían en absoluto, ni en datos ni en código: **regalías**
(cómo se le paga a un sello/artista/productor por sus streams) y **publicidad** (cómo se
financia el tier free, y cómo ese ingreso entra al mismo pool que reparte regalías). El modelo
dimensional tenía 54 tablas pero ninguna de las 9 requeridas para estos dos dominios
(`DIM_PRODUCTOR`, `BRIDGE_PRODUCTOR_TRACK`, `DIM_CONTRATO_REGALIA`, `FACT_LIQUIDACION_REGALIA`,
`DIM_CUENTA_SELLO`, `DIM_ANUNCIANTE`, `DIM_CAMPANA_PUBLICITARIA`, `FACT_IMPRESION_ANUNCIO`,
`FACT_INGRESO_PUBLICITARIO`) existía. Se agrupan en un solo change porque están acopladas por
diseño: el ingreso publicitario alimenta el mismo pool que reparte `regalias`, igual que en el
modelo real de Spotify (pool "market-centric": ingreso total del período repartido pro-rata por
streams reales).

## What Changes

- **Nueva capability `regalias`**: dos tipos de derecho (master/grabación y publishing/
  composición, sin `DIM_EDITORIAL` — decisión explícita del usuario, la publicidad de un track
  sin editorial separada se reparte entre sello/artista), contratos de reparto por track con
  vigencia, y liquidación real por período: `pool_rightsholders = (Σ transacciones exitosas +
  Σ ingreso publicitario del período) × 70%`, repartido pro-rata entre tracks por su participación
  real en streams (`FACT_ENGAGEMENT_USUARIO`, `event_type='reproduccion'`), y dentro de cada track
  entre sello/artista/productor según su contrato vigente. Login propio de sello
  (`DIM_CUENTA_SELLO`, análogo a `DIM_CUENTA_ARTISTA` pero de alta exclusiva de admin — un sello ya
  es una entidad de catálogo administrada, no de autoservicio).
- **Nueva capability `publicidad`**: anunciantes y campañas con CPM real, impresión de anuncio
  entre canciones a un usuario del plan free, e ingreso publicitario reconocido en tiempo real
  por cada impresión completada (`monto = cpm/1000`), sin agregación diferida.
- **Ejecución periódica real**: nuevo DAG `finanzas_periodicas` (`schedule_interval="@weekly"`,
  cron real — no disparo manual) que primero renueva suscripciones vencidas (cierra el hueco de
  "facturación recurrente" señalado en la auditoría, cobrando de verdad contra
  `DIM_METODO_PAGO`/`FACT_TRANSACCION_PAGO` del usuario) y luego liquida regalías del período con
  el ingreso ya actualizado.
- **React**: vista de ganancias para artista (sus tracks, streams del período, monto) y para sello
  (ganancias agregadas de todos sus artistas), anuncio real entre canciones para usuarios free
  (interrumpe el reproductor, requiere completarse antes de continuar) con registro de impresión.

## Capabilities

### New Capabilities
- `regalias`
- `publicidad`

### Modified Capabilities
- `suscripciones`: `require_active_subscription` (código muerto, ningún router lo usaba) se
  conecta como gating real de un límite adicional de plan free (ver tasks.md); se documenta la
  decisión en design.md de esta capability.

## Impact

- **Backend**: `api/paquetes/regalias/` (nuevo), `api/paquetes/publicidad/` (nuevo),
  `api/paquetes/suscripciones/{deps,router}.py`.
- **ETL**: `etl/gold/regalias_liquidacion.py` (nuevo), `etl/gold/facturacion_recurrente.py`
  (nuevo), `etl/dags/finanzas_periodicas_dag.py` (nuevo).
- **Datos**: 9 tablas nuevas en `init_clickhouse.py`. Ninguna tabla existente se modifica.
- **Frontend (`frontend/`, React — único frontend vigente tras retirar `app/` en S10 Día 1)**:
  `packages/regalias/` (nuevo), `packages/publicidad/` (nuevo, componente de anuncio integrado en
  `PlayerContext`).
- **Fuera de alcance**: pasarela de anuncios de video/display fuera del reproductor de audio;
  segmentación de campañas por audiencia (toda campaña activa es elegible para cualquier usuario
  free); `DIM_EDITORIAL`/gestión de composición separada del artista (decisión explícita del
  usuario — el reparto de publishing sin editorial se queda entre sello/artista).
