## MODIFIED Requirements

### Requirement: Asignación de identificador único al crear una dimensión

Al crear un nuevo valor de dimensión desde el CRUD de la interfaz de gestión, el sistema SHALL
asignar automáticamente un identificador único, calculado a partir del máximo identificador
existente en esa tabla. El sistema SHALL ignorar cualquier identificador que el operador incluya
en la solicitud de creación — el id nunca se ingresa ni se controla manualmente, en ningún caso.
El sistema NO SHALL dejar un registro nuevo con un identificador vacío, nulo o repetido respecto
a otro registro existente.

#### Scenario: Crear un valor de dimensión

- **WHEN** el Lead Data Engineer crea un nuevo valor de dimensión
- **THEN** el sistema le asigna un identificador único, distinto de cualquier otro registro
  existente en esa tabla, sin ofrecer forma de especificarlo manualmente

#### Scenario: Un identificador incluido en la solicitud de creación se ignora

- **WHEN** una solicitud de creación de un valor de dimensión incluye un identificador,
  coincida o no con uno ya existente
- **THEN** el sistema lo ignora y asigna igualmente un identificador único calculado por el
  propio sistema, sin usar el valor recibido

#### Scenario: Editar o eliminar un registro recién creado por su id

- **WHEN** el Lead Data Engineer edita o elimina un registro que fue creado por el sistema
- **THEN** la operación afecta únicamente a ese registro, sin impactar a ningún otro registro de
  la misma tabla
