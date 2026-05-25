# Tracklytics v2 — Pendientes SEMANA 2

## Técnicos

- [ ] Campo `g.genre_id` sale con prefijo de tabla en respuesta de `/genres/trends`
      → Agregar alias explícito `AS genre_id` en la query de api/main.py

- [ ] CRUD de FACT_TRACKS no muestra registros en modo solo lectura
      → Verificar endpoint GET /facts y su integración en crud.html

- [ ] Radar chart de géneros no cierra el polígono correctamente
      → En genres.html repetir primer elemento en categories[] y values[]

## Mejoras futuras (próximos sprints)

- [ ] Reportes con análisis estadístico avanzado (box plot, heatmap, correlaciones)
- [ ] Dockerfile propio para Airflow (evitar reinstalar dependencias en cada arranque)
- [ ] load_pocketbase.py integrado en docker compose up (actualmente es manual)
- [ ] Diagramas ArchiMate en Archi como complemento a los UML