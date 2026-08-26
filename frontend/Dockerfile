# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# URL pública de Airflow (accesible desde el navegador, no la interna de red
# Docker `http://airflow:8080` que usa el backend) — Vite la hornea en el
# bundle en build time, así que necesita entrar como build arg para poder
# overridearla sin tocar código (ej. si el docente no accede desde localhost).
ARG VITE_AIRFLOW_PUBLIC_URL=http://localhost:8080
ENV VITE_AIRFLOW_PUBLIC_URL=$VITE_AIRFLOW_PUBLIC_URL

# Fingerprint del commit horneado en el HTML servido (ver <meta name="build-commit">
# en index.html) — permite confirmar con un solo `curl` si el container está
# sirviendo el código actual sin necesidad de comparar visualmente páginas
# (S17: se encontró un `frontend-react` sirviendo un build de varios commits
# atrás porque `docker compose up -d` sin `--build` no reconstruye imágenes
# ya existentes). Default "sin-commit" si nadie pasa el build arg — deja
# rastro explícito de que no se siguió el flujo de `scripts/rebuild-frontend.sh`.
ARG VITE_GIT_COMMIT=sin-commit
ENV VITE_GIT_COMMIT=$VITE_GIT_COMMIT

RUN npm run build

# ── Stage 2: production ───────────────────────────────────────────────────────
FROM nginx:alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
