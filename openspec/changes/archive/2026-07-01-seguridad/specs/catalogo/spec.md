## REMOVED Requirements

### Requirement: Registro de usuario
**Reason**: La propiedad del flujo de autenticación se traslada a la capability `seguridad`, que introduce un paquete backend propio (`api/paquetes/seguridad/`) para registro/login/logout en vez de que el frontend llame a PocketBase directamente. `catalogo` nunca implementó este requisito en su propio paquete backend — solo lo documentaba.
**Migration**: Ver `seguridad` → "Registro de usuario". Sin cambios de comportamiento para el usuario final; cambia únicamente el endpoint que el frontend invoca (`/app/v1/seguridad/auth/registro` en vez de PocketBase directo).

### Requirement: Inicio de sesión
**Reason**: Trasladado a `seguridad`, que además vincula cada login a un registro de sesión en `FACT_SESION` y a un dispositivo en `DIM_DISPOSITIVO` — capacidades que no existían en `catalogo`.
**Migration**: Ver `seguridad` → "Inicio de sesión".

### Requirement: Cierre de sesión
**Reason**: Trasladado a `seguridad`, que además cierra el registro de sesión correspondiente en `FACT_SESION`.
**Migration**: Ver `seguridad` → "Cierre de sesión".

### Requirement: Seguridad de credenciales
**Reason**: Requisito transversal de manejo de credenciales; pertenece naturalmente a `seguridad`, dueña del flujo de autenticación.
**Migration**: Ver `seguridad` → "Seguridad de credenciales". Sin cambio de comportamiento: PocketBase sigue gestionando el hashing.
