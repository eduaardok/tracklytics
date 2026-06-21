## Why

OE2 (Escalabilidad Comercial vía Plataformas de Ecosistema) busca que Tracklytics se integre en el software que ya usan sellos y distribuidoras sin requerir fuerza de ventas directa. Hoy no existe un consumo programático del catálogo musical por parte de partners externos ya autenticados.

## What Changes

- Autenticación de cada solicitud de API mediante una llave de API (API key) asociada al partner.
- Endpoints de solo lectura sobre el catálogo musical (tracks, artistas, álbumes, géneros) para consumo de partners.
- Limitación de campos y volumen de datos accesibles según el tier de suscripción del partner (básico/pro/enterprise).
- Registro de cada llamada de API con identificador del partner, endpoint consumido, volumen de datos y tiempo de respuesta.
- Rechazo de solicitudes con llave de API inválida o expirada, sin exponer datos del catálogo ni el detalle de la causa.

## Capabilities

### New Capabilities
- `partners`: consumo programático autenticado del catálogo musical por parte de Partners/Integradores externos, segmentado por tier de acceso y con registro de cada llamada.

### Modified Capabilities
(ninguna; no se modifican requisitos de capabilities existentes)

## Impact

- **ClickHouse**: lectura de FACT_TRACKS y dimensiones técnicas (datos consumidos por la API); registro de consumo en FACT_INTEGRACION_PARTNER, DIM_PARTNER (modelo de negocio).
- **FastAPI**: nuevos endpoints de solo lectura del catálogo destinados a partners, con autenticación por API key.
- **Dependencia externa**: el alta y gestión de llaves de API (creación de partners nuevos) pertenece a la capability táctica de administración de partners (CU-T03) — fuera de alcance de esta capability.
