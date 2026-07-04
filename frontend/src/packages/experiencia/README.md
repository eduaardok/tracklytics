# Package: experiencia

Telemetría de consumo enriquecida, soporte al usuario, exposición a experimentos,
reflejo analítico de playlists y agrupación de suscriptores bajo un plan familiar.

## Páginas

- `SoportePage` — Usuario B2C: crear ticket de soporte, ver los propios con su estado. Ruta `/soporte`.
- `TicketsAdminPage` — admin: consulta todos los tickets (filtrables por estado), actualiza estado. Ruta `/seguridad/soporte`.
- `FamiliaAdminPage` — admin: designa titular de plan familiar (solo suscripciones `premium`), agrega/quita miembros contra el límite de 5. Ruta `/seguridad/familia`.
- `TopTracksPlaylistsPage` — Cliente B2B (analyst) y admin: tracks más agregados a playlists desde el reflejo analítico; admin además puede forzar una resincronización fuera del ciclo semanal. Ruta `/analitica/playlists-top`.

La reproducción de audio real (RF-EXP-010) y la portada real (RF-EXP-009) no
viven en este paquete — extienden `shared/context/PlayerContext.tsx`,
`shared/components/PlayerBar.tsx` y `packages/catalogo` directamente (ver
`openspec/changes/experiencia/design.md`).

## Estructura

```
packages/experiencia/
├── pages/          # Vistas de nivel ruta (cada archivo = una ruta)
├── components/     # Componentes internos — NO exportar desde aquí
├── api/            # Llamadas tipadas a los endpoints FastAPI de este paquete
├── types.ts        # Tipos del dominio de esta capability
└── index.ts        # Única interfaz pública — lo único importable por otros paquetes
```

## Regla de aislamiento

Otros paquetes **solo pueden importar desde `index.ts`** de este módulo.
Nunca importar directamente desde `components/`, `pages/`, ni `api/`.
