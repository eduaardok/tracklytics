## 1. PocketBase: colección de suscripciones

- [x] 1.1 Crear colección `suscripciones` (usuario_o_cliente, tipo_plan, monto, moneda, fecha_inicio, estado) con regla de acceso: solo el propietario puede leer/crear su suscripción
- [x] 1.2 Configurar la colección para que monto y moneda no sean editables tras la creación (sin endpoint de update sobre esos campos), preservando el rastro auditable (RNF-SUS-002)
- [x] 1.3 Verificar que las reglas de acceso impiden que un usuario/cliente lea o modifique la suscripción de otro

## 2. FastAPI: catálogo de planes

- [x] 2.1 Definir el catálogo de planes disponibles (free, premium para B2C; básico, pro, enterprise para B2B) con descripción y precio (RF-SUS-001)
- [x] 2.2 Implementar endpoint `GET /app/v1/suscripciones/planes` que devuelve los planes correspondientes al tipo de actor autenticado (B2C o B2B)

## 3. FastAPI: alta y confirmación de suscripción

- [x] 3.1 Implementar endpoint `POST /app/v1/suscripciones` que valida el plan seleccionado contra el tipo de actor (RN-SUS-003: B2C solo free/premium, B2B solo básico/pro/enterprise)
- [x] 3.2 Implementar validación de método de pago válido antes de activar un plan de pago, sin integrar pasarela real (RN-SUS-002, Escenario 2)
- [x] 3.3 Implementar, dentro de la misma operación de confirmación, la cancelación atómica de cualquier suscripción previa activa del mismo usuario/cliente antes de crear la nueva en estado "activa" (RN-SUS-001, CA-SUS-002)
- [x] 3.4 Registrar la suscripción con tipo de plan, monto, moneda, fecha de inicio y estado "activa" (RF-SUS-003)
- [ ] 3.5 Medir y validar que la confirmación completa en menos de 3 segundos en condiciones normales (RNF-SUS-001)

## 4. FastAPI: consulta y cancelación

- [x] 4.1 Implementar endpoint `GET /app/v1/suscripciones/activa` para consultar el plan activo del usuario/cliente autenticado (RF-SUS-004)
- [x] 4.2 Implementar endpoint `POST /app/v1/suscripciones/{id}/cancelar` que cambia el estado de una suscripción activa a "cancelada" (RF-SUS-005)
- [x] 4.3 Exponer `require_active_subscription` como dependencia de FastAPI reutilizable (PocketBase en tiempo real, no FACT_SUSCRIPCION) para que `analitica` la consuma sin redefinirla

## 5. Frontend: planes y suscripción

- [x] 5.1 Construir vista de planes disponibles, filtrada según el tipo de actor autenticado (B2C o B2B), con descripción y precio
- [x] 5.2 Construir formulario de selección y confirmación de plan, incluyendo el campo de método de pago y su validación antes de habilitar la confirmación
- [x] 5.3 Mostrar mensaje de error claro cuando falta un método de pago válido o el plan no existe (Escenario 2, CA-SUS-003)
- [x] 5.4 Construir vista de "mi plan" para consultar el plan activo actual
- [x] 5.5 Construir acción de cancelación de suscripción activa con confirmación del usuario/cliente

## 6. Verificación end-to-end

- [x] 6.1 Verificar CA-SUS-001: un plan válido seleccionado activa la suscripción y se refleja en el perfil del usuario/cliente
- [x] 6.2 Verificar CA-SUS-002: confirmar un nuevo plan cancela automáticamente la suscripción previa activa
- [x] 6.3 Verificar CA-SUS-003: un intento sin método de pago válido es rechazado con mensaje claro
- [x] 6.4 Verificar que un Cliente B2B no puede seleccionar un plan B2C y viceversa (RN-SUS-003)
