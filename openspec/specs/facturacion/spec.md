# Capability: facturacion

## Purpose

Permitir que un usuario registre un método de pago, pague una suscripción existente y reciba el invoice correspondiente, y que pueda consultar su propio historial de facturación — con auditoría ampliada para `admin`.

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
| Operativo | Lead Data Engineer / CTO | Facturación y cobros | CU-O81 Administrar la información de la empresa emisora | Como Lead Data Engineer/CTO, quiero editar la razón social, RUC y dirección de la empresa que aparece en cada factura, para mantenerla correcta sin depender de un cambio de código |
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
El sistema SHALL restringir la consulta del historial de facturación de otro usuario exclusivamente a `admin`; un usuario con rol distinto de `admin` SHALL recibir un rechazo al intentarlo. El admin SHALL poder localizar al usuario objetivo mediante una búsqueda por nombre o correo, sin requerir que conozca ni escriba su `usuario_id`.

#### Scenario: Buscar el usuario por nombre o correo antes de auditar su facturación
- **WHEN** un usuario con rol `admin` escribe parte del nombre o correo de un usuario para consultar su historial de facturación
- **THEN** el sistema muestra las coincidencias encontradas para que el admin seleccione el usuario exacto

#### Scenario: Admin consulta el historial de otro usuario
- **WHEN** un usuario con rol `admin` solicita el historial de transacciones o invoices de otro usuario
- **THEN** el sistema retorna los registros solicitados

#### Scenario: Usuario sin rol admin intenta consultar el historial de otro usuario
- **WHEN** un usuario con rol distinto de `admin` intenta consultar el historial de transacciones o invoices de otro usuario
- **THEN** el sistema rechaza la operación indicando que esa consulta es exclusiva de `admin`

### Requirement: Renovación automática de suscripción
El sistema SHALL renovar periódicamente cualquier suscripción de pago activa cuyo último cobro
exitoso (o su fecha de alta, si nunca se cobró) tenga 30 días o más, simulando un nuevo cobro con
el último método de pago del usuario. Si el usuario no tiene ningún método de pago registrado, el
sistema SHALL omitir esa renovación sin cancelar la suscripción. Si el cobro simulado de la
renovación falla, el sistema SHALL cancelar la suscripción de inmediato (ver capability
`suscripciones`, "Cancelar suscripción activa") y registrar el motivo como churn involuntario, en
vez de dejarla activa sin haber cobrado.

#### Scenario: Renovación exitosa de una suscripción vencida
- **WHEN** una suscripción de pago activa tiene 30 días o más desde su último cobro exitoso, y el usuario tiene un método de pago registrado
- **THEN** el sistema simula un nuevo cobro por el monto del plan y, si resulta exitoso, registra la transacción y emite el invoice correspondiente

#### Scenario: Renovación fallida cancela la suscripción
- **WHEN** el cobro simulado de una renovación resulta fallido
- **THEN** el sistema registra la transacción fallida, cancela la suscripción y registra la cancelación como involuntaria, sin dejarla activa

#### Scenario: Suscripción vencida sin método de pago registrado
- **WHEN** una suscripción de pago activa tiene 30 días o más desde su último cobro y el usuario no tiene ningún método de pago registrado
- **THEN** el sistema omite la renovación de esa suscripción sin cancelarla ni generar ninguna transacción

#### Scenario: Suscripción aún no vencida
- **WHEN** una suscripción de pago activa tiene menos de 30 días desde su último cobro exitoso
- **THEN** el sistema no genera ninguna renovación para esa suscripción todavía

### Requirement: Administración de la información de la empresa emisora
El sistema SHALL permitir a cualquier usuario autenticado consultar la información vigente de la
empresa emisora (razón social, RUC, dirección) que aparece en el encabezado de cada factura. El
sistema SHALL permitir exclusivamente a un usuario con rol `admin` editar esa información, y SHALL
registrar el cambio en el log de auditoría con el administrador que lo realizó. Solo existe un
registro de información de la empresa en todo el sistema.

#### Scenario: Consultar la información de la empresa
- **WHEN** cualquier usuario autenticado solicita la información de la empresa emisora
- **THEN** el sistema retorna la razón social, el RUC y la dirección vigentes

#### Scenario: Admin edita la información de la empresa
- **WHEN** un usuario con rol `admin` envía una razón social, RUC y/o dirección nuevos
- **THEN** el sistema actualiza el registro único de información de la empresa y registra el cambio en el log de auditoría

#### Scenario: Usuario sin rol admin intenta editar la información de la empresa
- **WHEN** un usuario con rol distinto de `admin` intenta editar la información de la empresa
- **THEN** el sistema rechaza la operación indicando que es exclusiva de `admin`

#### Scenario: El encabezado de una factura refleja la información vigente
- **WHEN** cualquier usuario consulta el detalle de una factura después de que la información de la empresa fue editada
- **THEN** el encabezado de esa factura muestra la razón social, RUC y dirección vigentes al momento de la consulta, no los que tenía la empresa al emitirse la factura

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
- Reintento (dunning) de una renovación fallida — una sola pasada: si falla, cancela de inmediato
  en vez de reintentar en los días siguientes.
- Anulación, corrección o nota de crédito sobre un invoice ya emitido.
- Tarificación de IVA variable por país/región.
