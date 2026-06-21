# Capability: partners

## Objetivo

Permitir que un Partner/Integrador externo consuma datos del catálogo musical mediante una integración programática (API), autenticado y segmentado según su tier de acceso.

## Contexto

OE2 (Escalabilidad Comercial vía Plataformas de Ecosistema) busca que Tracklytics se integre en el software que ya usan sellos y distribuidoras sin requerir fuerza de ventas directa. Esta capability cubre el consumo operativo de esa API por parte de un partner ya autenticado; el diseño y publicación de la especificación OpenAPI pertenece al nivel táctico (CU-T03, OO-2.1.1), fuera de esta capability.

## Actores

- **Partner / Integrador**: empresa externa que consume datos vía API.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Partner / Integrador | Integraciones y socios | CU-O12 Consumir datos del catálogo mediante integración | Como Partner/Integrador, quiero consumir datos del catálogo vía API, para integrarlos en mi propio software de gestión |

## ADDED Requirements

### Requirement: Autenticación por llave de API
El sistema SHALL autenticar cada solicitud de API mediante una llave de API (API key) asociada al partner. Las llaves de API SHALL transmitirse únicamente vía header de autenticación, nunca como parámetro de query string visible en logs.

#### Scenario: Autenticación con llave de API en el header
- **WHEN** un partner envía una solicitud incluyendo su llave de API en el header de autenticación
- **THEN** el sistema valida la llave contra el partner asociado y, si es válida, continúa procesando la solicitud

### Requirement: Rechazo de llave de API inválida o expirada
Una llave de API inválida o expirada SHALL rechazar la solicitud con código de autenticación fallida, sin exponer detalle de la causa ni datos del catálogo.

#### Scenario: Llave de API inválida
- **WHEN** el partner envía una llave de API inválida o expirada y realiza cualquier solicitud
- **THEN** el sistema rechaza la solicitud con un error de autenticación, sin exponer datos del catálogo ni el detalle de la causa

### Requirement: Endpoints de solo lectura sobre el catálogo musical
El sistema SHALL exponer endpoints de solo lectura sobre el catálogo musical (tracks, artistas, álbumes, géneros) para consumo de partners.

#### Scenario: Consumo exitoso de API
- **WHEN** el partner posee una llave de API válida y vigente y realiza una solicitud a un endpoint dentro de su tier
- **THEN** el sistema responde con los datos solicitados y registra la llamada

### Requirement: Segmentación de acceso por tier de suscripción
El sistema SHALL limitar los campos y volumen de datos accesibles según el tier de suscripción del partner (básico/pro/enterprise). Un partner con tier básico SHALL no poder acceder a endpoints reservados para tier pro/enterprise (ej. exportación masiva de datos).

#### Scenario: Acceso fuera de tier
- **WHEN** un partner con tier básico solicita un endpoint reservado para tier enterprise
- **THEN** el sistema rechaza la solicitud indicando que el endpoint requiere un tier superior

### Requirement: Registro de cada llamada de API
El sistema SHALL registrar cada llamada de API con identificador del partner, endpoint consumido, volumen de datos y tiempo de respuesta. Cada llamada exitosa o fallida SHALL quedar registrada para trazabilidad y control de consumo (auditoría a nivel táctico, CU-T03).

#### Scenario: Registro de una llamada exitosa
- **WHEN** una solicitud de API se procesa exitosamente
- **THEN** el sistema registra el identificador del partner, el endpoint consumido, el volumen de datos y el tiempo de respuesta

#### Scenario: Registro de una llamada fallida
- **WHEN** una solicitud de API es rechazada (por autenticación inválida o por acceso fuera de tier)
- **THEN** el sistema registra igualmente la llamada con su resultado, para trazabilidad y control de consumo

### Requirement: Tiempo de respuesta de la API de partners
Cada llamada de API SHALL responder en menos de 2 segundos bajo condiciones normales de carga.

#### Scenario: Respuesta dentro del tiempo esperado
- **WHEN** un partner con llave de API válida realiza una solicitud a un endpoint dentro de su tier en condiciones normales de carga
- **THEN** el sistema responde con los datos correspondientes en menos de 2 segundos

## Entradas

- Llave de API (header de autenticación).
- Parámetros de consulta del endpoint (filtros por género, artista, etc.).

## Salidas

- Datos del catálogo en formato estructurado (JSON).
- Mensaje de error de autenticación o de acceso restringido por tier.

## Dependencias

- **ClickHouse**: FACT_TRACKS y dimensiones técnicas (datos consumidos por la API).
- **FACT_INTEGRACION_PARTNER, DIM_PARTNER** (modelo de negocio) para registro de consumo.
- **Capability táctica de administración de partners (CU-T03)** para el alta inicial de la llave de API — fuera de alcance de esta capability operativa.

## Fuera de alcance

- Documentación interactiva (Swagger/Redoc) de la API — pertenece a OO-2.1.1 a nivel táctico.
- Alta y gestión de partners (creación de llaves de API nuevas).
- Webhooks o notificaciones push hacia el partner.
