# TRACKLYTICS — Documento de Contexto del Proyecto

> **Versión:** 2.0.0
> **Estado:** Sprint 0 — Planificación y Diseño Inicial
> **Última actualización:** Mayo 2026

---

# 1. Descripción General del Proyecto

**Tracklytics** es una plataforma web de analítica musical e inteligencia de negocio construida sobre datos de Spotify. El sistema permite procesar, almacenar y analizar grandes volúmenes de información musical para generar visualizaciones, métricas y consultas estratégicas orientadas a la toma de decisiones.

El proyecto se desarrolla en el contexto de una asignatura universitaria relacionada con bases de datos, análisis de datos y desarrollo de sistemas, pero adopta estándares técnicos similares a los utilizados en proyectos reales de ingeniería de software.

Tracklytics utilizará un dataset de Spotify con más de 114.000 registros y 20 columnas relacionadas con canciones, artistas, géneros y características de audio.

El sistema estará enfocado principalmente en:

* Ingeniería de datos
* Modelado relacional
* Procesos ETL
* APIs REST
* Dashboards analíticos
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

1. Implementar un proceso ETL completo en Python para procesar el dataset de Spotify.

2. Diseñar un modelo relacional normalizado en PostgreSQL con al menos 10 tablas relacionadas con el contexto empresarial.

3. Desarrollar una API REST utilizando FastAPI para exponer los datos procesados.

4. Construir dashboards interactivos para análisis de géneros, artistas y características musicales.

5. Implementar consultas analíticas orientadas a inteligencia de negocio.

6. Contenerizar el entorno de desarrollo mediante Docker y Docker Compose.

7. Mantener una arquitectura modular y mantenible durante el desarrollo del proyecto.

---

# 7. Problema que Resuelve el Sistema

La industria musical genera grandes cantidades de datos relacionados con canciones, artistas y comportamiento de consumo, pero gran parte de esa información no es utilizada estratégicamente.

Muchos procesos de análisis musical se realizan manualmente o utilizando métricas limitadas, lo que dificulta:

* Identificar tendencias musicales
* Comparar géneros
* Analizar patrones de popularidad
* Evaluar características de audio
* Generar reportes estructurados

Tracklytics busca centralizar y analizar esta información mediante herramientas de ingeniería de datos y visualización analítica.

---

# 8. Justificación Técnica

## Python

Python será el núcleo del proyecto debido a su ecosistema para análisis y procesamiento de datos:

* Pandas
* SQLAlchemy
* FastAPI
* Plotly

Además, el docente estableció que todo movimiento de datos debe realizarse desde Python.

## PostgreSQL

PostgreSQL será utilizado como base de datos principal debido a:

* Soporte para grandes volúmenes de datos
* Robustez relacional
* Integridad referencial
* Compatibilidad con SQLAlchemy

## Docker

Docker permitirá crear un entorno reproducible y portable para todos los servicios del sistema.

## FastAPI

FastAPI facilitará:

* Creación rápida de APIs REST
* Validación automática
* Documentación Swagger
* Integración con Python moderno

---

# 9. Stack Tecnológico

| Componente           | Tecnología            |
| -------------------- | --------------------- |
| Lenguaje principal   | Python 3.11+          |
| Backend API          | FastAPI               |
| Base de datos        | PostgreSQL            |
| ORM                  | SQLAlchemy            |
| Procesamiento ETL    | Pandas                |
| Dashboards           | Plotly                |
| Contenedores         | Docker                |
| Orquestación         | Docker Compose        |
| Frontend             | HTML, CSS, JavaScript |
| Control de versiones | Git + GitHub          |

---

# 10. Arquitectura General

El sistema seguirá una arquitectura monolítica modular dividida en capas:

```text
Dataset CSV
    ↓
ETL Python
    ↓
PostgreSQL
    ↓
FastAPI REST API
    ↓
Frontend Web + Dashboards
```

Cada módulo tendrá responsabilidades separadas para facilitar mantenimiento y escalabilidad.

### Estructura Real del Repositorio
 
```
TRACKLYTICS/
├── app/                        # Aplicación principal (API + lógica de negocio)
├── dataset/
│   └── spotify.csv             # Dataset fuente — 114k+ registros, 20 columnas
├── docker/                     # Configuraciones Docker por servicio
├── docs/
│   └── TRACKLYTICS_CONTEXT.md  # Documento de contexto del proyecto (este archivo)
├── etl/                        # Pipeline ETL: extracción, transformación, carga
├── notebooks/                  # Jupyter notebooks para exploración y análisis ad-hoc
├── sql/                        # Scripts SQL: schema, migraciones, seeds, vistas
├── tests/                      # Suite de pruebas del sistema
├── .gitignore                  # Excluye __pycache__, *.pyc, .env, venv/, *.log, .DS_Store
├── docker-compose.yml          # Orquestación de servicios del entorno de desarrollo
├── README.md                   # Descripción pública del proyecto
└── requirements.txt            # Dependencias Python del proyecto
```
 
---

# 11. Flujo General del Sistema

1. El dataset CSV es cargado desde Python.
2. El proceso ETL limpia y transforma los datos.
3. Los datos se insertan en PostgreSQL.
4. FastAPI consulta la base de datos.
5. El frontend consume la API.
6. Los dashboards presentan métricas y análisis al usuario.

---

# 12. Descripción del Dataset

El proyecto utilizará un dataset de Spotify con más de 114.000 registros y 20 columnas.

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

# 13. Alcance del MVP

## Incluye

* Pipeline ETL funcional
* Base de datos PostgreSQL
* API REST básica
* Dashboards analíticos
* Dockerización
* Consultas de negocio
* Modelo relacional normalizado

## No incluye inicialmente

* Machine Learning avanzado
* Recomendaciones en tiempo real
* Integración con Spotify API
* Procesamiento distribuido
* Microservicios
* Sistemas complejos de autenticación

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

## ETL Engine

Responsable de extracción, limpieza, transformación y carga de datos.

## Database Layer

Define el modelo relacional y las relaciones entre entidades.

## REST API

Expone endpoints para consultas y dashboards.

## Analytics Module

Genera métricas y consultas analíticas.

## Dashboard Module

Visualiza información mediante gráficos interactivos.

---

# 16. Actores del Sistema

## Analista de Datos

Explora métricas y tendencias musicales.

## Ejecutivo Musical

Consulta dashboards y reportes estratégicos.

## Curador Musical

Busca canciones según características de audio.

## Administrador

Gestiona procesos ETL y estado del sistema.

---

# 17. Procesos Empresariales

1. Ingesta de datos
2. Procesamiento ETL
3. Generación de métricas
4. Visualización de dashboards
5. Generación de reportes
6. Consultas analíticas

---

# 18. Decisiones Estratégicas Soportadas

El sistema permitirá responder preguntas como:

* ¿Qué géneros tienen mayor popularidad?
* ¿Qué características de audio predominan en canciones exitosas?
* ¿Qué artistas tienen mayor consistencia de popularidad?
* ¿Cómo varía la energía o danceability entre géneros?
* ¿Qué géneros muestran mayor crecimiento?

---

# 19. Modelo Relacional Preliminar

## Tablas principales del MVP

1. tracks
2. artists
3. albums
4. genres
5. track_artists
6. audio_profiles
7. genre_trends
8. etl_logs
9. users
10. business_reports

## Tablas futuras opcionales

* api_logs
* dashboard_configs
* artist_segments
* popularity_snapshots

---

# 20. Flujo ETL Preliminar

## Extracción

* Lectura del CSV
* Validación inicial

## Transformación

* Limpieza de nulos
* Eliminación de duplicados
* Normalización de datos
* Separación de artistas

## Carga

* Inserción en PostgreSQL
* Validación referencial
* Registro de logs ETL

---

# 21. Criterios de Éxito

El proyecto se considerará exitoso si logra:

* Procesar correctamente el dataset completo
* Cargar datos desde Python hacia PostgreSQL
* Ejecutarse mediante Docker
* Exponer endpoints funcionales
* Mostrar dashboards interactivos
* Responder consultas de negocio reales

---

# 22. Roadmap Inicial

## Sprint 0

* Estructura del proyecto
* Configuración Git
* Docker inicial
* Diseño de base de datos

## Sprint 1

* Implementación ETL
* Carga inicial del dataset

## Sprint 2

* Desarrollo API REST

## Sprint 3

* Dashboards y visualizaciones

## Sprint 4

* Integración general
* Optimización
* Testing
* Presentación final

---

# 23. Estado Actual

| Componente            | Estado |
| --------------------- | ------ |
| Repositorio Git       | ✅      |
| Dataset               | ✅      |
| Documento de contexto | ✅      |
| Diseño de BD          | ⏳      |
| Docker                | ⏳      |
| ETL                   | ⏳      |
| API                   | ⏳      |
| Frontend              | ⏳      |

---

# 24. Próximo Paso

El siguiente paso del proyecto será diseñar formalmente el modelo relacional y definir las relaciones entre las tablas principales antes de iniciar la implementación del pipeline ETL.
