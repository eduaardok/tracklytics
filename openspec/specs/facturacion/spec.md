# Capability: facturacion

## Objetivo

Permitir que un usuario registre un método de pago, pague una suscripción existente y reciba el invoice correspondiente, y que pueda consultar su propio historial de facturación — con auditoría ampliada para `admin`.

## Contexto

`suscripciones` registra la intención de compra (plan, monto, moneda, estado) pero declara explícitamente la facturación fuera de su alcance. Esta capability cierra ese vacío: cobra (de forma simulada) la suscripción ya contratada y deja un rastro de facturación (transacción + invoice) auditable, sin integrar una pasarela de pago real.

## Actores

- **Usuario B2C** (`role=user`): registra métodos de pago, paga su suscripción y consulta su propio historial de facturación.
- **Cliente B2B** (`role=analyst`): mismo flujo que Usuario B2C.
- **Lead Data Engineer / CTO** (`role=admin`): además de su propio flujo, puede consultar el historial de facturación de cualquier usuario.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Usuario B2C / Cliente B2B | Facturación y cobros | CU-O20 Registrar un método de pago | Como Usuario B2C, quiero registrar un método de pago, para poder pagar mi suscripción |
| Operativo | Usuario B2C / Cliente B2B | Facturación y cobros | CU-O21 Pagar una suscripción existente y recibir el invoice | Como Usuario B2C, quiero pagar mi suscripción con un método de pago registrado, para mantener mi acceso y recibir un comprobante |
| Operativo | Usuario B2C / Cliente B2B | Facturación y cobros | CU-O22 Consultar mi historial de transacciones e invoices | Como Usuario B2C, quiero ver mi historial de pagos e invoices, para llevar control de mis cobros |
| Operativo | Lead Data Engineer / CTO | Facturación y cobros | CU-O23 Auditar el historial de facturación de cualquier usuario | Como Lead Data Engineer/CTO, quiero consultar el historial de facturación de cualquier usuario, para dar soporte y auditar cobros |

## Requirements

### Requirement: Registro de método de pago
El sistema SHALL permitir a un usuario autenticado registrar un método de pago simulado (tipo, últimos 4 dígitos, país), asociado únicamente a su propia cuenta.

#### Scenario: Registro exitoso de un método de pago
- **WHEN** un usuario autenticado envía tipo, últimos 4 dígitos y país válidos para registrar un método de pago
- **THEN** el sistema registra el método de pago asociado a ese usuario y queda disponible para pagar una suscripción

### Requirement: Pago de una suscripción existente
El sistema SHALL permitir simular el pago de una suscripción activa del usuario autenticado usando uno de sus métodos de pago registrados, y SHALL registrar el resultado de la transacción como exitoso o fallido.

#### Scenario: Pago simulado exitoso
- **WHEN** un usuario autenticado con una suscripción activa y un método de pago registrado inicia un pago, y la transacción simulada resulta exitosa
- **THEN** el sistema registra la transacción con estado exitoso, asociada a la suscripción y al método de pago utilizados

#### Scenario: Pago simulado fallido
- **WHEN** un usuario autenticado inicia un pago y la transacción simulada resulta fallida
- **THEN** el sistema registra la transacción con estado fallido, sin generar ningún invoice

### Requirement: Rechazo de pago sin suscripción activa
El sistema SHALL rechazar el intento de pago si el usuario no tiene ninguna suscripción activa, sin registrar transacción ni invoice.

#### Scenario: Usuario sin suscripción activa intenta pagar
- **WHEN** un usuario autenticado sin ninguna suscripción activa intenta iniciar un pago
- **THEN** el sistema rechaza la operación indicando que no existe una suscripción activa, sin registrar transacción ni invoice

### Requirement: Emisión automática de invoice
El sistema SHALL emitir automáticamente un invoice (monto e IVA) al momento de registrar una transacción exitosa, sin acción manual adicional del usuario.

#### Scenario: Invoice emitido junto con una transacción exitosa
- **WHEN** una transacción de pago se registra con estado exitoso
- **THEN** el sistema emite automáticamente un invoice con el monto y el IVA correspondientes, asociado a esa transacción

### Requirement: Consulta del propio historial de facturación
El sistema SHALL permitir a un usuario autenticado consultar su propio historial de transacciones e invoices.

#### Scenario: Consultar historial propio
- **WHEN** un usuario autenticado solicita su historial de transacciones o de invoices
- **THEN** el sistema retorna únicamente los registros asociados a ese usuario

### Requirement: Acceso restringido al historial de facturación de terceros
El sistema SHALL restringir la consulta del historial de facturación de otro usuario exclusivamente a `admin`; un usuario con rol distinto de `admin` SHALL recibir un rechazo al intentarlo.

#### Scenario: Admin consulta el historial de otro usuario
- **WHEN** un usuario con rol `admin` solicita el historial de transacciones o invoices de otro usuario
- **THEN** el sistema retorna los registros solicitados

#### Scenario: Usuario sin rol admin intenta consultar el historial de otro usuario
- **WHEN** un usuario con rol distinto de `admin` intenta consultar el historial de transacciones o invoices de otro usuario
- **THEN** el sistema rechaza la operación indicando que esa consulta es exclusiva de `admin`

## Entradas

- Tipo, últimos 4 dígitos y país (registro de método de pago).
- Identificador del método de pago a usar (pago de suscripción).
- Identificador de usuario objetivo, opcional (consulta de historial; por defecto el propio usuario autenticado).

## Salidas

- Confirmación del método de pago registrado.
- Resultado de la transacción (exitosa/fallida) y, si aplica, el invoice emitido (monto, IVA, fecha de emisión).
- Historial de transacciones e invoices del usuario consultado.
- Mensaje de error si no hay suscripción activa o si la consulta de terceros no está autorizada.

## Dependencias

- **PocketBase**: colección `suscripciones` (de solo lectura), para resolver si el usuario tiene una suscripción activa antes de simular un pago.
- **ClickHouse**: `DIM_METODO_PAGO`, `FACT_TRANSACCION_PAGO`, `FACT_INVOICE`.
- **Capability `seguridad`**: token de sesión autenticado (`core.deps.get_current_user`) y gating de `admin` para el acceso a terceros.

## Fuera de alcance

- Integración con una pasarela de pago real (Stripe/Adyen/PayPal).
- Reintento automático de transacciones fallidas.
- Anulación, corrección o nota de crédito sobre un invoice ya emitido.
- Tarificación de IVA variable por país/región.
