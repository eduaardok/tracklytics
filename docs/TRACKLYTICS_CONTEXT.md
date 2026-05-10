# TRACKLYTICS — Documento de Contexto del Proyecto

> **Versión:** 3.0.0
> **Estado:** Sprint 3 completado — Frontend implementado
> **Última actualización:** Mayo 2026

---

# 1. Descripción General del Proyecto

**Tracklytics** es una plataforma web de analítica musical e inteligencia de negocio construida sobre datos de Spotify. El sistema permite procesar, almacenar y analizar grandes volúmenes de información musical para generar visualizaciones, métricas y consultas estratégicas orientadas a la toma de decisiones.

El proyecto se desarrolla en el contexto de una asignatura universitaria relacionada con bases de datos, análisis de datos y desarrollo de sistemas, pero adopta estándares técnicos similares a los utilizados en proyectos reales de ingeniería de software.

Tracklytics utiliza un dataset de Spotify con más de 114.000 registros y 20 columnas relacionadas con canciones, artistas, géneros y características de audio.

El sistema cubre:

* Ingeniería de datos
* Modelado relacional
* Procesos ETL
* APIs REST
* Dashboards analíticos interactivos
* Consultas de inteligencia de negocio

---

# 2. Descripción de la Empresa

**Tracklytics** es una empresa ficticia orientada a la analítica musical y al procesamiento de datos provenientes de plataformas de streaming.

La empresa busca ofrecer herramientas que permitan analizar tendencias musicales, perfiles de géneros, características de audio y patrones de popularidad para apoyar procesos de toma de decisiones dentro de la industria musical.

El modelo de negocio está orientado a clientes como:

* Sellos discográficos
* Productoras musicales
* Curadores de playlists
* Analistas de mercado musical
* Agencias de artistas

Tracklytics funciona como una plataforma de soporte analítico basada en datos estructurados y dashboards interactivos.

---

# 3. Misión

Proporcionar herramientas de análisis musical basadas en datos que permitan interpretar tendencias, características de audio y métricas de popularidad de manera clara, accesible y útil para la toma de decisiones.

---

# 4. Visión

Convertirse en una plataforma de referencia académica y empresarial en analítica musical, integrando ingeniería de datos, visualización y análisis estratégico dentro del ecosistema digital de la industria musical.

---

# 5. Objetivo General

Diseñar e implementar una plataforma web de analítica musical que procese datos de Spotify mediante pipelines ETL en Python, almacene la información en PostgreSQL y permita visualizar métricas estratégicas mediante dashboards interactivos accesibles desde una interfaz web.

---

# 6. Objetivos Específicos

1. Implementar un proceso ETL completo en Python para procesar el dataset de Spotify. ✅

2. Diseñar un modelo relacional normalizado en PostgreSQL con al menos 10 tablas relacionadas con el contexto empresarial. ✅

3. Desarrollar una API REST utilizando FastAPI para exponer los datos procesados. ✅

4. Construir dashboards interactivos para análisis de géneros, artistas y características musicales. ✅

5. Implementar consultas analíticas orientadas a inteligencia de negocio. ✅

6. Contenerizar el entorno de desarrollo mediante Docker y Docker Compose. ✅ (servicio DB)

7. Mantener una arquitectura modular y mantenible durante el desarrollo del proyecto. ✅

---

# 7. Problema que Resuelve el Sistema

La industria musical genera grandes cantidades de datos relacionados con canciones, artistas y comportamiento de consumo, pero gran parte de esa información no es utilizada estratégicamente.

Muchos procesos de análisis musical se realizan manualmente o utilizando métricas limitadas, lo que dificulta:

* Identificar tendencias musicales
* Comparar géneros
* Analizar patrones de popularidad
* Evaluar características de audio
* Generar reportes estructurados

Tracklytics centraliza y analiza esta información mediante herramientas de ingeniería de datos y visualización analítica.

---

# 8. Justificación Técnica

## Python

Python es el núcleo del proyecto debido a su ecosistema para análisis y procesamiento de datos:

* Pandas
* SQLAlchemy
* FastAPI

El docente estableció que todo movimiento de datos debe realizarse desde Python.

## PostgreSQL

PostgreSQL es utilizado como base de datos principal debido a:

* Soporte para grandes volúmenes de datos
* Robustez relacional
* Integridad referencial
* Compatibilidad con SQLAlchemy

## Docker

Docker crea un entorno reproducible y portable para el servicio de base de datos.

## FastAPI

FastAPI provee:

* Creación rápida de APIs REST
* Validación automática
* Documentación Swagger
* Integración con Python moderno
* Servido de archivos estáticos del frontend

## JavaScript (Vanilla)

El frontend se implementó con HTML + CSS + JavaScript puro (sin frameworks), con módulos ES nativos. Plotly.js (CDN) se usa para los gráficos interactivos. Los tests unitarios de JS se ejecutan con Vitest.

---

# 9. Stack Tecnológico

| Componente           | Tecnología                    |
| -------------------- | ----------------------------- |
| Lenguaje principal   | Python 3.11+                  |
| Backend API          | FastAPI                       |
| Base de datos        | PostgreSQL                    |
| ORM                  | SQLAlchemy                    |
| Procesamiento ETL    | Pandas + psycopg2             |
| Dashboards           | Plotly.js (CDN)               |
| Contenedores         | Docker                        |
| Orquestación         | Docker Compose                |
| Frontend             | HTML, CSS, JavaScript (ESM)   |
| Testing JS           | Vitest                        |
| Control de versiones | Git + GitHub                  |

---

# 10. Arquitectura General

El sistema sigue una arquitectura monolítica modular dividida en capas:

```text
Dataset CSV
    ↓
ETL Python (etl/main.py)
    ↓
PostgreSQL (vía Docker Compose)
    ↓
FastAPI REST API (app/main.py)
    ↓
Frontend Web + Dashboards (app/static/)
```

### Estructura Real del Repositorio

```
TRACKLYTICS/
├── app/
│   ├── main.py                  # API REST — FastAPI
│   └── static/                  # Frontend web (servido por FastAPI)
│       ├── css/styles.css        # Estilos globales (tema oscuro)
│       ├── index.html            # Dashboard — métricas globales + gráficos
│       ├── genres.html           # Análisis de géneros
│       ├── artists.html          # Análisis de artistas
│       ├── tracks.html           # Explorador de tracks
│       ├── js/
│       │   ├── api.js            # Cliente HTTP centralizado
│       │   ├── index.js          # Lógica del dashboard
│       │   ├── genres.js         # Lógica de géneros
│       │   ├── artists.js        # Lógica de artistas
│       │   ├── tracks.js         # Lógica de tracks
│       │   └── tests/            # Tests unitarios con Vitest
│       ├── package.json
│       └── vitest.config.js
├── database/
│   └── schema.sql               # Schema PostgreSQL completo
├── dataset/
│   └── spotify.csv              # Dataset fuente — 114k+ registros
├── docs/                        # Documentación técnica del proyecto
├── etl/
│   └── main.py                  # Pipeline ETL completo
├── docker-compose.yml           # Servicio PostgreSQL
├── requirements.txt             # Dependencias Python
└── README.md
```

---

# 11. Flujo General del Sistema

1. El dataset CSV es cargado desde Python.
2. El proceso ETL limpia, transforma y carga los datos en PostgreSQL.
3. FastAPI consulta la base de datos y expone endpoints REST.
4. El frontend (archivos estáticos en `app/static/`) consume la API.
5. Los dashboards Plotly.js presentan métricas y análisis al usuario.

---

# 12. Descripción del Dataset

El proyecto utiliza un dataset de Spotify con 114.000 registros y 20 columnas.

## Principales columnas

* track_id
* artists
* album_name
* track_name
* popularity
* duration_ms
* explicit
* danceability
* energy
* loudness
* speechiness
* acousticness
* instrumentalness
* liveness
* valence
* tempo
* track_genre

## Potencial analítico

El dataset permite:

* Comparación de géneros
* Análisis de popularidad
* Estudio de características de audio
* Generación de rankings
* Visualización de tendencias musicales

---

# 13. Alcance del MVP — Estado Actual

## Implementado ✅

* Pipeline ETL funcional
* Base de datos PostgreSQL (11 tablas)
* API REST completa (11 endpoints)
* Dashboards interactivos (Plotly.js)
* Frontend web con 4 páginas
* Docker Compose para la base de datos

## No incluido (fuera de alcance)

* Machine Learning avanzado
* Recomendaciones en tiempo real
* Integración con Spotify API
* Procesamiento distribuido
* Microservicios
* Autenticación de usuarios

---

# 14. Reglas Técnicas del Proyecto

## RT-01
Todo movimiento de datos debe realizarse desde Python.

## RT-02
El dataset debe contener más de 100.000 registros y más de 12 columnas.

## RT-03
Todos los servicios deben ejecutarse mediante Docker.

## RT-04
El sistema debe incluir una interfaz web funcional.

## RT-05
PostgreSQL será la única fuente principal de datos.

## RT-06
El modelo de datos debe contener al menos 10 tablas relacionadas con el contexto empresarial.

---

# 15. Módulos Principales

## ETL Engine (`etl/main.py`)
Extracción, limpieza, validación de rangos, transformación en 10 DataFrames y carga ordenada en PostgreSQL.

## Database Layer (`database/schema.sql`)
Modelo relacional normalizado. 11 tablas (10 del dataset + `etl_logs`).

## REST API (`app/main.py`)
11 endpoints FastAPI. Paginación, filtros, búsqueda y ordenamiento dinámico. Sirve también los archivos estáticos del frontend.

## Frontend Web (`app/static/`)
4 páginas HTML con tema oscuro, navegación entre páginas, gráficos Plotly.js interactivos, tablas paginadas y modales de detalle.

## Analytics Module
`genre_trends` y `artist_stats` como tablas precalculadas. Endpoints `/genre-trends` y `/artist-stats` con ordenamiento configurable.

---

# 16. Actores del Sistema

## Analista de Datos
Explora métricas y tendencias musicales desde los dashboards.

## Ejecutivo Musical
Consulta dashboards y reportes estratégicos.

## Curador Musical
Busca canciones según características de audio (filtros por popularidad, explicit, radar de audio features).

## Administrador
Gestiona procesos ETL y estado del sistema.

---

# 17. Decisiones Estratégicas Soportadas

El sistema responde preguntas como:

* ¿Qué géneros tienen mayor popularidad promedio?
* ¿Qué características de audio predominan en canciones exitosas?
* ¿Qué artistas tienen mayor consistencia de popularidad?
* ¿Cómo varía la energía o danceability entre géneros?
* ¿Cuántos tracks tiene un artista y cuántos son explícitos?
* ¿Cuál es el perfil de audio (radar) de una canción específica?

---

# 18. Estado Actual

| Componente            | Estado |
| --------------------- | ------ |
| Repositorio Git       | ✅      |
| Dataset               | ✅      |
| Documento de contexto | ✅      |
| Diseño de BD          | ✅      |
| Docker                | ✅ (DB) |
| ETL                   | ✅      |
| API                   | ✅      |
| Frontend              | ✅      |
| README.md público     | ⏳      |

---

# 19. Roadmap

## Sprint 0 ✅
Estructura del proyecto, configuración Git, Docker inicial, diseño de base de datos.

## Sprint 1 ✅
Implementación ETL, carga inicial del dataset (607.209 registros insertados).

## Sprint 2 ✅
Desarrollo API REST — 11 endpoints con FastAPI.

## Sprint 3 ✅
Frontend web: 4 páginas HTML, CSS tema oscuro, dashboards Plotly.js, modales de detalle.

## Sprint 4 ⏳
Integración general, optimización, testing, README público, presentación final.