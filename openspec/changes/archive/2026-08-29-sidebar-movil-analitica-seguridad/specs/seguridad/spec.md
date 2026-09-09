## Tabla de trazabilidad (nuevas filas)

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Roles administrativos de área / Superadmin | Administración | CU-O101 Navegar el panel de administración desde un dispositivo móvil | Como usuario con rol administrativo de área o superadmin, quiero abrir la navegación completa del panel de administración desde mi celular o tablet, para gestionar la plataforma sin depender de un sidebar de escritorio |

## ADDED Requirements

### Requirement: Navegación del panel de administración accesible en móvil
El sistema SHALL ofrecer, en el panel de administración, un botón de navegación visible únicamente en anchos de pantalla menores a 768px que abre un panel superpuesto a pantalla completa con la misma navegación agrupada (las seis secciones temáticas, incluido el submenú anidado de Informes Compuestos y el selector de área para superadmin) que el sidebar de escritorio, respetando exactamente el mismo filtrado por rol administrativo de área. El panel SHALL cerrarse al pulsar el fondo, al pulsar un botón de cierre, al presionar la tecla Escape, o al navegar a una nueva ruta.

#### Scenario: Abrir la navegación móvil del panel de administración
- **WHEN** un usuario con un rol administrativo de área o superadmin ve el panel de administración en una pantalla menor a 768px y pulsa el botón de navegación
- **THEN** el sistema muestra un panel superpuesto a pantalla completa con las mismas secciones y enlaces visibles que tendría el sidebar de escritorio para ese mismo usuario

#### Scenario: Cerrar la navegación móvil al elegir una sección
- **WHEN** el panel de navegación móvil está abierto y el usuario selecciona un enlace de navegación
- **THEN** el sistema navega a la sección elegida y cierra el panel superpuesto

#### Scenario: Cerrar la navegación móvil sin elegir una sección
- **WHEN** el panel de navegación móvil está abierto
- **THEN** el usuario puede cerrarlo pulsando el fondo, el botón de cierre, o la tecla Escape, sin cambiar de sección
