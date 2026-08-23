## ADDED Requirements

### Requirement: Comprobante de estudiante con revisión administrativa
El sistema SHALL permitir a un usuario autenticado subir un archivo de comprobante (constancia, carnet o certificado de matrícula, en formato PDF, JPG o PNG, hasta 5MB) junto con un email institucional válido, como evidencia aparte de la selección del plan `estudiante` en el checkout. El sistema SHALL rechazar el email institucional con formato inválido, la extensión de archivo no admitida o un archivo que exceda el tamaño máximo. El sistema SHALL registrar cada comprobante con estado `pendiente` y SHALL permitir a un `admin_comercial` listar los comprobantes por estado y aprobarlos o rechazarlos. El sistema SHALL permitir a un usuario autenticado consultar el estado de su comprobante más reciente. Esta verificación es independiente de la elegibilidad de checkout del plan `estudiante`, que sigue autoservida por formato de dominio de email — aprobar o rechazar un comprobante no activa ni cancela ninguna suscripción.

#### Scenario: Subir un comprobante válido
- **WHEN** un usuario autenticado sube un archivo PDF/JPG/PNG de hasta 5MB junto con un email institucional válido
- **THEN** el sistema guarda el archivo, registra la solicitud con estado `pendiente`, y la deja disponible para revisión administrativa

#### Scenario: Rechazar un email institucional inválido
- **WHEN** un usuario intenta subir un comprobante con un email que no pertenece al dominio institucional configurado
- **THEN** el sistema rechaza la subida sin guardar el archivo

#### Scenario: Rechazar un archivo con formato o tamaño inválido
- **WHEN** un usuario intenta subir un archivo que no es PDF/JPG/PNG, o que supera los 5MB
- **THEN** el sistema rechaza la subida sin guardarla

#### Scenario: Consultar el estado del propio comprobante
- **WHEN** un usuario autenticado consulta su solicitud más reciente
- **THEN** el sistema devuelve su email institucional, nombre de archivo, estado y fechas relevantes

#### Scenario: Un admin_comercial aprueba un comprobante
- **WHEN** un `admin_comercial` aprueba una solicitud pendiente
- **THEN** el sistema actualiza su estado a `aprobado`, registra quién y cuándo la revisó, y audita la acción

#### Scenario: Un admin_comercial rechaza un comprobante
- **WHEN** un `admin_comercial` rechaza una solicitud pendiente
- **THEN** el sistema actualiza su estado a `rechazado`, registra quién y cuándo la revisó, y audita la acción

#### Scenario: La revisión del comprobante no afecta el checkout
- **WHEN** un comprobante queda aprobado o rechazado
- **THEN** ninguna suscripción existente cambia de estado como efecto directo de esa revisión
