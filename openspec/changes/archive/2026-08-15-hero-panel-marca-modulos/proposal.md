## Why

El panel de marca público de login/registro ya mostraba un resumen real de los tracks más
populares del catálogo, pero como columna única apilada: una sola visualización, sin
estadísticas compuestas y sin distinción visual entre módulos. El panel no comunicaba con
suficiente densidad qué es Tracklytics ni qué se puede explorar antes de iniciar sesión.

## What Changes

- El panel de marca se recompone en una grilla de módulos de tamaños distintos (Top Tracks,
  popularidad por género, estadísticas del catálogo, funcionalidades) en vez de una columna
  apilada de bloques del mismo ancho.
- Se agrega un segundo módulo de visualización real: popularidad promedio por género, usando el
  mismo endpoint público de catálogo que ya expone conteos y promedios por género.
- El bloque de estadística única (total de tracks) se convierte en un bloque compuesto de
  estadísticas del catálogo (tracks totales + géneros catalogados), mostrando únicamente las
  métricas cuyo dato real esté disponible.
- La fila de tracks más populares gana un indicador visual de popularidad adicional (barra corta)
  junto al valor numérico ya existente.
- Ningún dato se inventa: cada módulo se omite por completo si su fuente no responde, igual que ya
  ocurría con el resumen de tracks.

## Capabilities

### New Capabilities
(ninguna — este cambio extiende una capability ya existente, no introduce una nueva)

### Modified Capabilities
- `seguridad`: el requirement "Panel de marca público con datos reales del catálogo" se amplía
  para cubrir el módulo de popularidad por género y el bloque compuesto de estadísticas del
  catálogo, manteniendo la misma regla de omitir por completo cualquier módulo cuya fuente de
  datos falle.

## Impact

- Frontend: panel de marca de login/registro (mismo componente compartido entre ambas páginas).
- Ningún cambio a mecanismos de autenticación, endpoints existentes ni modelo de datos.
