## MODIFIED Requirements

### Requirement: Gestión de plan familiar
El sistema SHALL permitir a un usuario con rol admin designar como titular de un plan familiar a un usuario con una suscripción activa en el plan premium (B2C), y agregar o quitar miembros de ese plan familiar. El admin SHALL poder localizar al usuario objetivo (titular o miembro) mediante una búsqueda por nombre o correo, sin requerir que conozca ni escriba su `usuario_id`. El sistema SHALL rechazar designar como titular a un usuario cuya suscripción activa no sea del plan premium. El sistema SHALL rechazar agregar un miembro si el plan familiar ya alcanzó el límite de 5 personas, incluido el titular. Un usuario SHALL poder ser titular o miembro de, como máximo, un plan familiar activo a la vez.

#### Scenario: Buscar el usuario por nombre o correo antes de designarlo titular o miembro
- **WHEN** un usuario con rol admin escribe parte del nombre o correo de un usuario para designarlo titular o agregarlo como miembro de un plan familiar
- **THEN** el sistema muestra las coincidencias encontradas para que el admin seleccione el usuario exacto

#### Scenario: Crear un titular de plan familiar
- **WHEN** un usuario con rol admin designa como titular a un usuario con suscripción activa en el plan premium que no es titular ni miembro de otro plan familiar activo
- **THEN** el sistema registra a ese usuario como titular de un nuevo plan familiar asociado a su suscripción activa

#### Scenario: Intento de designar titular con un plan no premium
- **WHEN** un usuario con rol admin intenta designar como titular a un usuario cuya suscripción activa es un plan distinto de premium (incluidos los planes B2B)
- **THEN** el sistema rechaza la operación indicando que el plan familiar solo aplica a suscriptores del plan premium

#### Scenario: Agregar un miembro dentro del límite
- **WHEN** un usuario con rol admin agrega un usuario como miembro de un plan familiar que tiene menos de 5 personas registradas
- **THEN** el sistema registra al usuario como miembro de ese plan familiar, con la fecha de unión

#### Scenario: Intento de agregar un miembro al alcanzar el límite
- **WHEN** un usuario con rol admin intenta agregar un miembro a un plan familiar que ya tiene 5 personas registradas
- **THEN** el sistema rechaza la operación indicando que se alcanzó el límite de miembros

#### Scenario: Intento de agregar un usuario que ya pertenece a otro plan familiar
- **WHEN** un usuario con rol admin intenta agregar como miembro a un usuario que ya es titular o miembro de otro plan familiar activo
- **THEN** el sistema rechaza la operación indicando que el usuario ya pertenece a un plan familiar

#### Scenario: Quitar un miembro de un plan familiar
- **WHEN** un usuario con rol admin quita a un miembro existente de un plan familiar
- **THEN** el sistema elimina la asociación de ese usuario con el plan familiar

#### Scenario: Usuario sin rol admin intenta administrar un plan familiar
- **WHEN** un usuario con rol distinto de admin intenta crear un titular, agregar o quitar un miembro de un plan familiar
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin
