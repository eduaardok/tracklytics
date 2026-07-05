## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Lead Data Engineer / CTO | Integraciones y socios | CU-O56 Consultar métricas agregadas de uso por partner | Como Lead Data Engineer/CTO, quiero ver el total de llamadas, la tasa de éxito/error y la latencia promedio de cada partner, para monitorear la salud del programa de partners sin consultar la base de datos a mano |

## ADDED Requirements

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
