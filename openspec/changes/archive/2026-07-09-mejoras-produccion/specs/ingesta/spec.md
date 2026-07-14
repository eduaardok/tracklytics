## ADDED Requirements

### Requirement: Estabilidad del identificador de track entre cargas
El `fact_id` asignado a un track SHALL permanecer estable a través de sucesivas ejecuciones de la ingesta, incluidas recargas forzadas y cargas de semanas adicionales. El sistema NO SHALL reasignar un `fact_id` ya utilizado a un track distinto del que originalmente lo ocupaba, ya que otras capabilities (biblioteca, social, distribución) referencian tracks por `fact_id` de forma persistente.

#### Scenario: Cargar una semana adicional no reasigna fact_id existentes
- **WHEN** el Lead Data Engineer ejecuta la ingesta de una semana adicional después de que el catálogo ya tiene tracks reales y sintéticos cargados
- **THEN** los nuevos tracks sintéticos se insertan con `fact_id` posteriores al máximo existente, sin colisionar con ningún `fact_id` ya asignado

#### Scenario: Una recarga forzada de una semana ya cargada no reasigna fact_id existentes
- **WHEN** el Lead Data Engineer ejecuta una recarga forzada de una semana que ya fue cargada previamente
- **THEN** el sistema no genera ningún `fact_id` que ya esté en uso por un track de otra semana o carga

### Requirement: Asignación de identificador único al crear una dimensión
Al crear un nuevo valor de dimensión desde el CRUD de la interfaz de gestión, el sistema SHALL asignar automáticamente un identificador único cuando el operador no especifique uno, calculado a partir del máximo identificador existente en esa tabla. El sistema NO SHALL dejar un registro nuevo con un identificador vacío, nulo o repetido respecto a otro registro existente.

#### Scenario: Crear un valor de dimensión sin especificar id
- **WHEN** el Lead Data Engineer crea un nuevo valor de dimensión sin especificar su identificador
- **THEN** el sistema le asigna un identificador único, distinto de cualquier otro registro existente en esa tabla

#### Scenario: Editar o eliminar un registro recién creado por su id
- **WHEN** el Lead Data Engineer edita o elimina un registro que fue creado sin especificar id
- **THEN** la operación afecta únicamente a ese registro, sin impactar a ningún otro registro de la misma tabla
