# Módulo Distribución — Documentación de negocio

> Redactado al archivar la capability `distribucion` (2026-07-02), siguiendo la regla de
> documentación en paralelo con la implementación. Segunda entrega de la serie
> `docs/negocio/<capability>.md` (después de
> `social.md`), pendiente de consolidarse en el documento final de Word al cerrar las seis
> capabilities nuevas del semestre (Fase 7). Queda `experiencia` como última capability nueva.

## Propósito

Hasta ahora, el catálogo de Tracklytics se mostraba igual a cualquier oyente en cualquier país,
y el sello discográfico de un artista o álbum era apenas una etiqueta de texto sin ninguna
relación estructurada con el resto del sistema. El módulo Distribución introduce el mercado
real detrás del catálogo: qué sello discográfico respalda a cada artista o álbum, en qué países
tiene autorización de distribución ese sello, y qué tracks puntuales tienen una restricción de
reproducción vigente en un país o canal determinado.

Esta pieza es central para el negocio B2B de Tracklytics: los clientes de datos son
precisamente los sellos discográficos, productoras y agencias de artistas, y su interés
principal es entender y controlar dónde se distribuye su catálogo. Sin un modelo de mercado y
licencias, Tracklytics no podía representar esa relación.

## Funcionalidad

### Sellos discográficos

El equipo de administración de la plataforma mantiene un catálogo de sellos discográficos y
puede asociar cada artista o álbum del catálogo con el sello que lo respalda. Esta asociación es
la base sobre la que se apoya todo lo demás: licencias y restricciones se gestionan a nivel de
sello, no track por track.

### Licencias de distribución por país

Una licencia autoriza a un sello discográfico a distribuir la totalidad de su catálogo en un
país específico, durante un período de vigencia determinado (con fecha de inicio y,
opcionalmente, fecha de fin). El equipo de administración puede consultar en cualquier momento
las licencias vigentes o vencidas de un sello, o todas las licencias otorgadas para un país en
particular.

### Restricciones de reproducción

Independientemente del estado de las licencias, el equipo de administración puede restringir la
reproducción de un track puntual en un país y canal de distribución específicos (por ejemplo,
streaming), indicando el motivo de la restricción: no disponible, solo disponible como vista
previa, o bloqueado por una limitación de derechos geográfica. Una restricción puede
desactivarse en cualquier momento sin perder su historial, para reflejar que la limitación dejó
de aplicar.

### Verificación al momento de reproducir

Cuando un oyente intenta reproducir un track, el sistema verifica automáticamente si existe una
restricción vigente para su país. Si la hay, la reproducción se bloquea y se le informa el
motivo; si no, la reproducción continúa con normalidad. Un oyente también puede consultar por
adelantado si un track está disponible en su país antes de intentar reproducirlo, sin que esa
consulta tenga ningún efecto sobre su cuenta.

## Permisos por rol

| Rol | Gestionar sellos | Asignar sello a artista/álbum | Gestionar licencias | Gestionar restricciones | Consultar disponibilidad | Reproducción sujeta a restricción |
|---|---|---|---|---|---|---|
| Oyente (B2C) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Cliente de datos (B2B) | ❌ | ❌ | ❌ | ❌ | ❌ (no aplica a su rol) | ❌ (no reproduce) |
| Administración de plataforma | ✅ | ✅ | ✅ | ✅ | ❌ (no aplica a su rol) | ❌ (no aplica a su rol) |

La gestión de sellos, licencias y restricciones es exclusiva del equipo de administración de la
plataforma, que actúa como intermediario operativo entre los sellos discográficos (clientes B2B)
y la experiencia real de reproducción de los oyentes (B2C). Toda acción de administración sobre
sellos, licencias o restricciones queda registrada en el historial de auditoría de la
plataforma, con el responsable, la fecha y el cambio aplicado.

## Valor para el negocio

- **Confianza de los sellos discográficos:** poder demostrar control granular sobre dónde se
  distribuye su catálogo es un requisito de fondo para que un sello discográfico confíe su
  música a Tracklytics — sin esta capacidad, la relación B2B carecería de la pieza que
  justifica su interés comercial.
- **Cumplimiento de acuerdos de licenciamiento:** el modelo de licencias por país refleja cómo
  operan realmente los acuerdos de distribución musical, sentando la base para que decisiones
  de negocio (expansión a nuevos mercados, renovación o vencimiento de acuerdos) tengan un
  correlato directo en el sistema.
- **Experiencia de oyente coherente:** en vez de que un track simplemente falle sin explicación,
  el oyente recibe un motivo claro cuando algo no está disponible en su país, y puede verificarlo
  antes de intentar reproducir — una experiencia más cercana a la de un servicio de streaming
  real.
- **Trazabilidad para auditoría comercial:** cada restricción aplicada y cada intento de
  reproducción bloqueado queda registrado, lo que permite a la administración de la plataforma
  reportar con precisión a un sello discográfico dónde y cuántas veces se intentó acceder a su
  catálogo fuera de los mercados autorizados.
