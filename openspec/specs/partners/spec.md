# Capability: partners

## Purpose

Permitir que un Partner/Integrador externo consuma datos del catálogo musical mediante una integración programática (API), autenticado y segmentado según su tier de acceso.

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
| Operativo | Lead Data Engineer / CTO | Integraciones y socios | CU-O56 Consultar métricas agregadas de uso por partner | Como Lead Data Engineer/CTO, quiero ver el total de llamadas, la tasa de éxito/error y la latencia promedio de cada partner, para monitorear la salud del programa de partners sin consultar la base de datos a mano |
## Requirements
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

### Requirement: Consulta agregada de métricas de uso por partner
El sistema SHALL exponer, exclusivamente para Lead Data Engineer / CTO (`role=admin`), una
consulta agregada del registro de llamadas de API por partner: total de llamadas, tasa de
éxito/error, latencia promedio de las llamadas exitosas, y desglose por tier usado. Esta consulta
SHALL apoyarse en el mismo registro que ya produce el requisito "Registro de cada llamada de API"
(esta capability), sin introducir un mecanismo de captura nuevo.

#### Scenario: Consulta exitosa de métricas agregadas
- **WHEN** un Lead Data Engineer / CTO autenticado solicita las métricas agregadas de uso de partners
- **THEN** el sistema responde con, para cada partner con al menos una llamada registrada, el total de llamadas, la tasa de éxito/error, la latencia promedio de las llamadas exitosas y el desglose por tier usado

#### Scenario: Acceso denegado a usuarios sin rol de administrador
- **WHEN** un usuario autenticado sin `role=admin` (Usuario B2C, Cliente B2B o un Partner/Integrador externo autenticado por llave de API) solicita las métricas agregadas de uso de partners
- **THEN** el sistema rechaza la solicitud sin exponer los datos agregados

#### Scenario: Sin llamadas registradas todavía
- **WHEN** un Lead Data Engineer / CTO autenticado solicita las métricas agregadas de uso de partners y el registro de llamadas no tiene datos aún
- **THEN** el sistema responde con una lista vacía, sin error

### Requirement: Gestión administrativa de partners B2B
El sistema SHALL permitir a un usuario con rol `admin_comercial` crear un partner (nombre, tier `basico` | `pro` | `enterprise`, email de contacto) y listar todos los partners con su tier y estado. Al crear un partner el sistema SHALL generar una API key aleatoria, almacenar únicamente su hash SHA-256, y devolver la key en texto claro **una sola vez**. El listado SHALL NO exponer la key ni su hash. Las acciones SHALL auditarse.

#### Scenario: Crear un partner devuelve la key una sola vez
- **WHEN** un `admin_comercial` crea un partner
- **THEN** el sistema genera una API key, guarda solo su hash SHA-256, y devuelve la key en claro una única vez que no podrá recuperarse después

#### Scenario: El listado de partners no expone las keys
- **WHEN** un `admin_comercial` lista los partners
- **THEN** el sistema devuelve nombre, tier y estado de cada partner, sin la API key ni su hash

### Requirement: Rotación y desactivación de la API key de un partner
El sistema SHALL permitir a un `admin_comercial` rotar la API key de un partner (invalida la actual, genera una nueva, la devuelve en claro una sola vez) y desactivar un partner (`estado = 'inactivo'`), tras lo cual su API key SHALL dejar de autenticar.

#### Scenario: Rotar la key invalida la anterior
- **WHEN** un `admin_comercial` rota la API key de un partner
- **THEN** la key anterior deja de funcionar y la nueva se devuelve en claro una sola vez

#### Scenario: Desactivar un partner corta su acceso
- **WHEN** un `admin_comercial` desactiva un partner
- **THEN** las llamadas autenticadas con la API key de ese partner son rechazadas

### Requirement: Autenticación de partner por hash de API key
El sistema SHALL autenticar a un partner hasheando (SHA-256) la API key recibida por header y comparándola contra el `api_key_hash` almacenado, sin conservar nunca la key en claro.

#### Scenario: Autenticación con key válida
- **WHEN** un partner vigente envía su API key por header
- **THEN** el sistema calcula su hash, encuentra el partner y autoriza la llamada según su tier

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

- Documentación interactiva formal (Swagger/Redoc) de la API — pertenece a OO-2.1.1 a nivel táctico. Ver nota abajo sobre las herramientas de verificación/demo, que son un artefacto distinto y no cubren esta función.
- Alta y gestión de partners (creación de llaves de API nuevas).
- Webhooks o notificaciones push hacia el partner.

## Herramientas de verificación y demo (agregado posterior a la implementación)

Para poder verificar CU-O12 sin depender de `curl` y para tener un artefacto demostrable de cara al caso de uso de negocio (OE2), se agregaron dos páginas dentro de `app/partners/`. Ninguna de las dos sustituye la documentación interactiva formal (Swagger/Redoc) descartada arriba — son herramientas ad-hoc de verificación y demo, no documentación de referencia de la API:

- **Consola de pruebas interna** (`app/partners/console.html`): página dentro de la aplicación, accesible solo para `role=admin` (mismo gating que ETL/CRUD). Permite pegar una API key y probar cada endpoint de `/partners/v1/*` (incluyendo el de exportación enterprise) sin usar la terminal, viendo el código HTTP, el tiempo de respuesta y el JSON de la respuesta. No usa la sesión de PocketBase del staff para llamar a la API de partners — envía la API key igual que lo haría un partner externo real.
- **Landing de demo para integradores** (`app/partners/landing.html`): página pública, sin autenticación, que muestra cómo se vería la oferta de partners de cara a una empresa externa real (tiers, autenticación, ejemplo de `curl`, prueba en vivo embebida). Incluye un aviso explícito de que es una demostración previa a producción, no una oferta comercial activa — evita que se confunda con un canal de venta real mientras CU-T03 (alta y gestión de partners) no existe.
