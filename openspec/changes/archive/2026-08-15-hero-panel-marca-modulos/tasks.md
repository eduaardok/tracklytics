## 1. Módulo de popularidad por género

- [x] 1.1 Consultar `/genres` desde `AuthHero.tsx` (mismo criterio que la consulta de tracks más populares: pública, `staleTime` de 5 minutos, `retry: 1`)
- [x] 1.2 Ordenar géneros por `avg_popularity` real y tomar el top 5
- [x] 1.3 Renderizar el módulo con barra corta + valor real por género, omitiendo el módulo por completo si la consulta falla

## 2. Bloque de estadísticas del catálogo

- [x] 2.1 Calcular géneros catalogados como el conteo real de la respuesta de `/genres`
- [x] 2.2 Componer el bloque de estadísticas con las métricas disponibles (tracks totales, géneros catalogados), omitiendo individualmente cualquiera cuyo dato no esté disponible
- [x] 2.3 Omitir el bloque completo cuando ninguna estadística tenga dato real

## 3. Indicador visual adicional en Top Tracks

- [x] 3.1 Agregar barra corta de popularidad junto al valor numérico ya existente en cada fila

## 4. Recomposición visual del panel

- [x] 4.1 Reestructurar el panel en una grilla de módulos de tamaño distinto (CSS Grid con áreas nombradas)
- [x] 4.2 Verificar con curl que los valores mostrados en cada módulo coinciden con la respuesta real de `/tracks/top` y `/genres`
- [x] 4.3 Verificar con Playwright (login/registro, claro/oscuro, 1920×1080 y 1366×768) que ningún módulo requiere scroll y que los módulos con falla de datos se omiten sin dejar la interfaz vacía

## 5. Documentación de la spec

- [x] 5.1 Actualizar el requirement "Panel de marca público con datos reales del catálogo" en `openspec/specs/seguridad/spec.md` para cubrir el módulo de géneros y el bloque de estadísticas
