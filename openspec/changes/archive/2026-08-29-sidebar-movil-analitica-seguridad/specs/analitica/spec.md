## Tabla de trazabilidad (nuevas filas)

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Cliente B2B / Data Analyst-BI Lead | Inteligencia de negocio y comparativa | CU-O100 Navegar el panel de analítica desde un dispositivo móvil | Como Cliente B2B o Data Analyst/BI Lead, quiero abrir la navegación completa del panel de analítica desde mi celular o tablet, para moverme entre secciones sin depender de conocer cada URL de memoria |

## ADDED Requirements

### Requirement: Navegación del panel de analítica accesible en móvil
El sistema SHALL ofrecer, en el panel de analítica, un botón de navegación visible únicamente en anchos de pantalla menores a 768px que abre un panel superpuesto a pantalla completa con la misma navegación agrupada (nav base más grupos Operativo/Táctico/Estratégico/Herramientas) que el sidebar de escritorio, respetando exactamente el mismo filtrado por rol y por plan. El panel SHALL cerrarse al pulsar el fondo, al pulsar un botón de cierre, al presionar la tecla Escape, o al navegar a una nueva ruta.

#### Scenario: Abrir la navegación móvil del panel de analítica
- **WHEN** un Cliente B2B o Data Analyst/BI Lead con acceso autorizado ve el panel de analítica en una pantalla menor a 768px y pulsa el botón de navegación
- **THEN** el sistema muestra un panel superpuesto a pantalla completa con los mismos grupos de navegación visibles que tendría el sidebar de escritorio para ese mismo usuario

#### Scenario: Cerrar la navegación móvil al elegir una sección
- **WHEN** el panel de navegación móvil está abierto y el usuario selecciona un enlace de navegación
- **THEN** el sistema navega a la sección elegida y cierra el panel superpuesto

#### Scenario: Cerrar la navegación móvil sin elegir una sección
- **WHEN** el panel de navegación móvil está abierto
- **THEN** el usuario puede cerrarlo pulsando el fondo, el botón de cierre, o la tecla Escape, sin cambiar de sección
