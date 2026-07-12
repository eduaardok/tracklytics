## MODIFIED Requirements

### Requirement: Gestión de plan familiar
El sistema SHALL permitir a un usuario con rol admin designar como titular de un plan familiar a un usuario con una suscripción activa en el plan premium (B2C), y agregar o quitar miembros de ese plan familiar. El admin SHALL poder localizar al usuario objetivo (titular o miembro) mediante una búsqueda por nombre o correo, sin requerir que conozca ni escriba su `usuario_id`. Adicionalmente, el sistema SHALL permitir que el propio usuario con suscripción activa en el plan premium se autogestione como titular de su plan familiar: crear su plan, agregar miembros por correo electrónico y quitarlos, sin depender de un administrador. El flujo admin se conserva como capacidad de soporte/override. El sistema SHALL rechazar designar como titular a un usuario cuya suscripción activa no sea del plan premium. El sistema SHALL rechazar agregar un miembro si el plan familiar ya alcanzó el límite de 5 personas, incluido el titular. Un usuario SHALL poder ser titular o miembro de, como máximo, un plan familiar activo a la vez. Un titular NO SHALL poder quitarse a sí mismo del plan familiar mediante el flujo de autoservicio.

#### Scenario: Buscar el usuario por nombre o correo antes de designarlo titular o miembro (admin)
- **WHEN** un usuario con rol admin escribe parte del nombre o correo de un usuario para designarlo titular o agregarlo como miembro de un plan familiar
- **THEN** el sistema muestra las coincidencias encontradas para que el admin seleccione el usuario exacto

#### Scenario: Crear un titular de plan familiar (admin)
- **WHEN** un usuario con rol admin designa como titular a un usuario con suscripción activa en el plan premium que no es titular ni miembro de otro plan familiar activo
- **THEN** el sistema registra a ese usuario como titular de un nuevo plan familiar asociado a su suscripción activa

#### Scenario: Un usuario premium crea su propio plan familiar (autoservicio)
- **WHEN** un Usuario B2C autenticado con una suscripción activa en el plan premium, que no es titular ni miembro de otro plan familiar, solicita crear su propio plan familiar
- **THEN** el sistema lo registra como titular de un nuevo plan familiar asociado a su suscripción activa, sin requerir intervención de un administrador

#### Scenario: Intento de crear un plan familiar sin plan premium (autoservicio)
- **WHEN** un Usuario B2C autenticado sin una suscripción activa en el plan premium solicita crear su propio plan familiar
- **THEN** el sistema rechaza la operación indicando que el plan familiar solo aplica al plan premium

#### Scenario: Intento de designar titular con un plan no premium (admin)
- **WHEN** un usuario con rol admin intenta designar como titular a un usuario cuya suscripción activa es un plan distinto de premium (incluidos los planes B2B)
- **THEN** el sistema rechaza la operación indicando que el plan familiar solo aplica a suscriptores del plan premium

#### Scenario: Agregar un miembro dentro del límite (admin)
- **WHEN** un usuario con rol admin agrega un usuario como miembro de un plan familiar que tiene menos de 5 personas registradas
- **THEN** el sistema registra al usuario como miembro de ese plan familiar, con la fecha de unión

#### Scenario: El titular agrega un miembro por correo (autoservicio)
- **WHEN** el titular de un plan familiar con menos de 5 personas registradas agrega un miembro especificando su correo electrónico
- **THEN** el sistema resuelve el correo a un usuario existente y lo registra como miembro de ese plan familiar

#### Scenario: El titular intenta agregar un correo que no corresponde a ningún usuario (autoservicio)
- **WHEN** el titular de un plan familiar intenta agregar un miembro especificando un correo que no corresponde a ningún usuario registrado
- **THEN** el sistema rechaza la operación indicando que no existe un usuario con ese correo

#### Scenario: Intento de agregar un miembro al alcanzar el límite
- **WHEN** un admin o el titular intenta agregar un miembro a un plan familiar que ya tiene 5 personas registradas
- **THEN** el sistema rechaza la operación indicando que se alcanzó el límite de miembros

#### Scenario: Intento de agregar un usuario que ya pertenece a otro plan familiar
- **WHEN** un admin o el titular intenta agregar como miembro a un usuario que ya es titular o miembro de otro plan familiar activo
- **THEN** el sistema rechaza la operación indicando que el usuario ya pertenece a un plan familiar

#### Scenario: Quitar un miembro de un plan familiar (admin)
- **WHEN** un usuario con rol admin quita a un miembro existente de un plan familiar
- **THEN** el sistema elimina la asociación de ese usuario con el plan familiar

#### Scenario: El titular quita un miembro (autoservicio)
- **WHEN** el titular de un plan familiar quita a un miembro existente (distinto de sí mismo)
- **THEN** el sistema elimina la asociación de ese usuario con el plan familiar

#### Scenario: El titular intenta quitarse a sí mismo (autoservicio)
- **WHEN** el titular de un plan familiar intenta quitarse a sí mismo mediante el flujo de autoservicio
- **THEN** el sistema rechaza la operación

#### Scenario: Un miembro (no titular) intenta administrar el plan familiar (autoservicio)
- **WHEN** un usuario que es miembro (no titular) de un plan familiar intenta agregar o quitar a otro miembro mediante el flujo de autoservicio
- **THEN** el sistema rechaza la operación indicando que solo el titular puede administrar miembros

#### Scenario: Usuario sin rol admin intenta administrar el plan familiar de otro usuario
- **WHEN** un usuario con rol distinto de admin intenta crear un titular, agregar o quitar un miembro del plan familiar de un usuario que no es él mismo
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin
