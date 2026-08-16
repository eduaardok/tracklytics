## Context

El panel de marca (`AuthHero.tsx`, compartido por login y registro) ya consulta un endpoint
público de tracks más populares y renderizaba el resultado como una columna vertical de bloques
del mismo ancho. El resto del catálogo público (endpoint de géneros, con conteo y popularidad
promedio por género) no se usaba en este panel.

## Goals / Non-Goals

**Goals**
- Recomponer el panel en módulos de tamaño visual distinto, reutilizando datos públicos ya
  expuestos por el backend de catálogo.
- Agregar un segundo módulo de visualización (popularidad por género) y convertir el stat único
  en un bloque de estadísticas compuesto.
- Mantener la regla existente de omitir cualquier módulo cuya fuente de datos falle, ahora a
  nivel de módulo individual en vez de a nivel de todo el panel.

**Non-Goals**
- No se toca el mecanismo de autenticación ni la lógica de los formularios de login/registro.
- No se agregan endpoints nuevos al backend: todo módulo usa endpoints públicos ya existentes.
- No se introduce ninguna métrica de tendencia/crecimiento temporal: no existe un endpoint
  público que la respalde con datos reales.

## Decisions

- **Reutilizar `/genres` para el segundo módulo** en vez de crear un endpoint nuevo: ese endpoint
  ya devuelve `track_count` y `avg_popularity` reales por género, sin autenticación.
- **Cada módulo se controla por su propia consulta** (independiente entre sí) para que la falla
  de una fuente de datos no oculte los demás módulos — mismo criterio que ya regía para el
  resumen de tracks.
- **El bloque de estadísticas del catálogo solo incluye métricas con endpoint público real**
  (tracks totales, géneros catalogados). Se decidió no incluir conteo de artistas ni variación
  semanal porque no existe un endpoint público que devuelva esos valores como total real.

## Risks / Trade-offs

- [Riesgo] Un visitante que abre el panel justo cuando ambas consultas (tracks y géneros) fallan
  ve un panel con menos contenido dinámico → Mitigación: el panel conserva identidad de marca,
  propuesta de valor y funcionalidades como contenido estático que nunca depende de la red.

## Migration Plan

Cambio de solo frontend, sin migración de datos ni de esquema. Se despliega junto al resto del
frontend; no requiere pasos manuales adicionales.

## Open Questions

Ninguna pendiente.
