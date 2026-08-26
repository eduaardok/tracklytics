#!/usr/bin/env bash
# Reconstruye y redespliega el frontend React, y verifica que el container
# terminó sirviendo el commit que se acaba de reconstruir.
#
# Por qué existe este script (S17): `docker compose up -d` NO reconstruye
# imágenes que ya existen localmente aunque el código fuente haya cambiado
# — Compose solo invoca `docker build` si la imagen no existe o si se pasa
# `--build`/`build`. Eso dejó el container `tracklytics_frontend_react`
# sirviendo un build de varios commits atrás en una sesión de verificación
# real, sin ningún error visible (la app "andaba", solo mostraba código
# viejo). Este script hace explícito el paso que `docker compose up -d`
# por sí solo no garantiza, y se autoverifica al final para no depender de
# que alguien reconozca visualmente si una página cambió.
#
# Uso: ./scripts/rebuild-frontend.sh   (desde cualquier directorio)

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

commit="$(git rev-parse --short HEAD)"
echo "Reconstruyendo frontend-react para el commit ${commit}..."

VITE_GIT_COMMIT="$commit" docker compose build frontend-react
docker compose up -d frontend-react

echo "Esperando a que el container quede arriba..."
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:8082/ -o /tmp/rebuild-frontend-index.html 2>/dev/null; then
    break
  fi
  sleep 1
done

servido="$(grep -o 'name="build-commit" content="[^"]*"' /tmp/rebuild-frontend-index.html 2>/dev/null | sed -E 's/.*content="([^"]*)"/\1/' || true)"
rm -f /tmp/rebuild-frontend-index.html

if [ "$servido" = "$commit" ]; then
  echo "OK: el frontend en http://localhost:8082 sirve el commit ${commit}."
else
  echo "FALLA: el frontend sirve '${servido:-<no se pudo leer>}', se esperaba '${commit}'." >&2
  echo "Revisa 'docker compose logs frontend-react' y que el build haya terminado sin errores." >&2
  exit 1
fi
