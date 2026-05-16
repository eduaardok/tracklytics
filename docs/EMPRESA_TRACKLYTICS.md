# TRACKLYTICS — Perfil Empresarial Completo
> **Versión:** 2.0 — Sprint Columnar | **Fecha:** Mayo 2026

---

## 1. Descripción de la Empresa

**Tracklytics** es una empresa de tecnología especializada en analítica musical e inteligencia de negocio basada en datos de plataformas de streaming. Procesa, almacena y visualiza grandes volúmenes de información musical para generar métricas estratégicas orientadas a la industria discográfica.

**Sector:** Tecnología / Analítica de Datos / Industria Musical  
**Tipo de empresa:** Startup tecnológica B2B  
**Mercado objetivo:** Sellos discográficos, productoras musicales, agencias de artistas, curadores de playlists y analistas de mercado musical.

---

## 1.1 Stack Tecnológico (v2)

| Capa | Tecnología |
|---|---|
| Fuente de datos | PocketBase (113.550 registros Spotify) |
| Staging | Parquet (vía PyArrow) |
| Base de datos | ClickHouse 24.3 (motor columnar MergeTree) |
| Orquestación ETL | Apache Airflow 2.9 (DAG `tracklytics_etl`) |
| API REST | FastAPI + Uvicorn (Python 3.11) |
| Frontend | HTML + CSS + JavaScript + Plotly.js |
| Servidor web | Nginx (reverse proxy → API) |
| Contenedores | Docker + Docker Compose |
| Datos sintéticos | NumPy + Faker (seed determinístico por semana) |

---

## 2. Misión

Proporcionar herramientas de análisis musical basadas en datos que permitan a la industria discográfica interpretar tendencias, evaluar características de audio y medir popularidad de manera clara, accesible y accionable para la toma de decisiones estratégicas.

---

## 3. Visión

Convertirse en la plataforma de referencia en analítica musical de Latinoamérica para 2030, integrando ingeniería de datos avanzada, visualización interactiva y modelos de inteligencia artificial dentro del ecosistema digital de la industria musical.

---

## 4. Valores Corporativos

- **Precisión:** Los datos son la base de cada decisión. No hay espacio para la especulación.
- **Transparencia:** Los procesos de análisis son auditables y documentados.
- **Innovación:** La tecnología avanza; la plataforma avanza con ella.
- **Accesibilidad:** La analítica compleja debe ser comprensible para cualquier usuario del negocio.
- **Responsabilidad:** El uso de datos respeta los marcos éticos y legales aplicables.

---

## 5. Objetivos Estratégicos
*(Nivel directivo — largo plazo, 3 a 5 años)*

**OE-01.** Posicionar a Tracklytics como la solución de analítica musical preferida por sellos discográficos independientes en Latinoamérica, alcanzando 50 clientes activos para 2028.

**OE-02.** Expandir el modelo de datos para incorporar fuentes adicionales de streaming (Apple Music, YouTube Music, Deezer), ampliando la cobertura analítica a más de 500.000 registros activos para 2027.

**OE-03.** Desarrollar un módulo de inteligencia artificial que prediga tendencias de popularidad y recomiende estrategias de lanzamiento a sellos discográficos, generando una ventaja competitiva diferencial.

**OE-04.** Establecer alianzas estratégicas con al menos 3 distribuidoras musicales regionales para integrar datos de ventas y streams directos a la plataforma.

**OE-05.** Alcanzar autosuficiencia financiera mediante un modelo de suscripción SaaS con tres niveles (Básico, Profesional, Enterprise) antes del cierre del año fiscal 2027.

---

## 6. Objetivos Tácticos
*(Nivel gerencial — mediano plazo, 6 a 18 meses)*

**OT-01.** Implementar el pipeline ETL de manera completamente automatizada y programada (ejecución diaria), eliminando la intervención manual en la actualización de datos.

**OT-02.** Desarrollar un módulo de reportes exportables (PDF y Excel) que permita a los clientes generar informes personalizados sobre géneros, artistas y tendencias directamente desde la plataforma.

**OT-03.** Refactorizar la API REST para soportar autenticación con JWT y control de acceso por roles (administrador, analista, ejecutivo), habilitando el uso multiusuario seguro.

**OT-04.** Integrar un sistema de alertas configurables que notifique a los usuarios cuando un artista o género supere umbrales de popularidad definidos por el cliente.

**OT-05.** Construir un panel de administración interno que permita monitorear el estado del ETL, los logs de ejecución y la salud de la base de datos sin acceso directo al servidor.

**OT-06.** Optimizar las consultas analíticas principales para reducir el tiempo de respuesta promedio de los endpoints a menos de 200ms bajo carga de producción.

---

## 7. Objetivos Operacionales
*(Nivel operativo — corto plazo, día a día o semana a semana)*

**OO-01.** Ejecutar el pipeline ETL diariamente a las 03:00 AM y registrar el resultado en `etl_logs` con estado, conteos y observaciones.

**OO-02.** Monitorear el endpoint `/health` cada 5 minutos mediante un proceso de vigilancia automatizado; emitir alerta si el tiempo de respuesta supera los 2 segundos.

**OO-03.** Revisar semanalmente los registros rechazados en `etl_logs` para identificar patrones de datos corruptos o cambios en el formato del dataset fuente.

**OO-04.** Mantener la documentación técnica (schema, API, ETL) actualizada con cada cambio de código antes de mergear a la rama principal.

**OO-05.** Ejecutar la suite de tests (Python + Vitest) en cada pull request como condición obligatoria de aprobación del código.

**OO-06.** Realizar backups automáticos diarios de la base de datos PostgreSQL y verificar la integridad del backup mediante restauración de prueba semanal.

---

## 8. Diez Problemas en el Ámbito de Sistemas y Software

Estos son los problemas técnicos actuales que Tracklytics identifica dentro de su plataforma y que deben resolverse durante el ciclo de desarrollo.

---

**PS-01. Ausencia de autenticación y control de acceso**
La API REST actualmente opera sin ningún mecanismo de autenticación. Cualquier cliente que conozca la URL puede consultar o modificar datos. Esto representa un riesgo crítico de seguridad que impide la comercialización de la plataforma a clientes externos.

---

**PS-02. ETL ejecutado manualmente sin programación automática**
El pipeline ETL (`etl/main.py`) debe ejecutarse de forma manual cada vez que se requiere actualizar los datos. No existe un scheduler, cron job ni sistema de orquestación que lo automatice. Esto genera dependencia operativa de intervención humana y riesgo de datos desactualizados.

---

**PS-03. Frontend no sirve datos en tiempo real desde la API**
Las páginas HTML consumen la API REST via fetch, pero no existe un mecanismo de actualización automática (polling, WebSocket o Server-Sent Events). Los dashboards muestran datos del momento de carga y no se refrescan sin intervención del usuario.

---

**PS-04. Ausencia de sistema de caché para consultas analíticas**
Los endpoints `/genre-trends` y `/artist-stats` ejecutan queries directas a PostgreSQL en cada request. Bajo carga concurrente, esto puede degradar severamente el rendimiento. No existe capa de caché (Redis, Memcached o caché en memoria) que absorba la repetición de consultas idénticas.

---

**PS-05. Logs ETL sin sistema de alertas ni monitoreo activo**
Los resultados del ETL se registran en `etl_logs` pero no existe ningún sistema que lea esos registros y emita alertas cuando el status es `failed` o `partial`. Los errores pueden pasar desapercibidos hasta que un usuario reporte datos incorrectos.

---

**PS-06. Escalabilidad limitada por arquitectura monolítica**
Toda la lógica (API, servicio de archivos estáticos, conexión a BD) reside en un único proceso FastAPI. No existe separación de servicios. Si la carga de usuarios crece, no es posible escalar horizontalmente sin refactorizar la arquitectura.

---

**PS-07. Falta de versionamiento de la API**
La API no implementa versionamiento (`/v1/`, `/v2/`). Cualquier cambio en los contratos de los endpoints rompe de inmediato a los clientes que los consumen. Esto impide la evolución controlada de la API sin coordinación manual con cada integración externa.

---

**PS-08. Limitación del modelo de datos: homónimos y álbumes duplicados**
El MVP usa `artist.name` y `album.name` como claves únicas globales (DD-03, DD-04). Artistas con el mismo nombre y álbumes homónimos de distintos artistas se fusionan en un solo registro, comprometiendo la integridad de los datos analíticos.

---

**PS-09. Ausencia de pruebas de integración y cobertura insuficiente**
Los tests existentes cubren únicamente funciones utilitarias del frontend (Vitest). No existen tests de integración para los endpoints de la API, el pipeline ETL ni las queries SQL. Los errores en la lógica de negocio solo se detectan en producción.

---

**PS-10. Sin gestión de configuración de entornos (dev/staging/prod)**
Las credenciales de base de datos y la configuración del sistema se gestionan con un único archivo `.env`. No existe diferenciación entre entornos de desarrollo, staging y producción. Esto aumenta el riesgo de operar con configuración incorrecta o exponer credenciales de producción.

---

## 9. Diez Problemas de Toma de Decisiones

Estos son los desafíos analíticos y estratégicos que los usuarios de Tracklytics (ejecutivos, analistas, curadores) deben poder resolver usando la plataforma.

---

**PTD-01. ¿Qué géneros tienen mayor potencial de popularidad para enfocar inversión en producción?**
Un sello discográfico necesita decidir en qué géneros musicales invertir su presupuesto de producción para el siguiente año. Sin datos comparativos de popularidad promedio por género, la decisión se toma por intuición o experiencia subjetiva. Tracklytics debe proveer un ranking de géneros por popularidad promedio con tendencia histórica.

---

**PTD-02. ¿Qué características de audio definen a las canciones más exitosas?**
Los productores necesitan saber si las canciones con alta popularidad comparten patrones de audio (alta energía, alta danceability, baja acousticness). Sin esta información, el proceso creativo no tiene referencia objetiva sobre qué perfiles sónicos tienden a resonar con el público masivo.

---

**PTD-03. ¿Qué artistas tienen consistencia de popularidad suficiente para justificar un contrato discográfico?**
Una agencia de artistas debe decidir a quién contratar. Un artista puede tener una canción viral pero bajo promedio general. Tracklytics debe permitir comparar `avg_popularity` vs `track_count` para identificar artistas con rendimiento sostenido, no solo picos aislados.

---

**PTD-04. ¿Cuándo y en qué formato lanzar una canción para maximizar su alcance?**
Las productoras necesitan saber si las canciones explícitas tienen mayor o menor popularidad en determinados géneros, y si la duración afecta el rendimiento. Esta decisión impacta directamente el formato del single, el contenido del master y la estrategia de distribución.

---

**PTD-05. ¿Qué géneros están saturados y cuáles tienen menor competencia relativa?**
Un curador de playlists o un A&R (Artist & Repertoire) necesita identificar géneros con alta cantidad de tracks pero popularidad promedio baja — señal de saturación — versus géneros con pocos tracks pero alta popularidad promedio, que representan oportunidades de posicionamiento.

---

**PTD-06. ¿Vale la pena invertir en un artista emergente de un género específico?**
Cuando un sello identifica a un artista nuevo en un género determinado, necesita contexto: ¿cómo se desempeñan típicamente los artistas de ese género? ¿Cuántos tracks necesita un artista para estabilizar su popularidad promedio? Esta decisión requiere benchmarks por género que Tracklytics puede proveer.

---

**PTD-07. ¿Qué géneros son más propicios para contenido explícito sin penalización de popularidad?**
Los sellos que producen contenido adulto necesitan saber en qué géneros el material explícito no afecta negativamente la popularidad. Géneros como rap o hip-hop pueden tener alta tolerancia; géneros infantiles o pop mainstream, no. Esta información orienta la estrategia editorial.

---

**PTD-08. ¿Cómo distribuir el catálogo de un artista entre géneros para maximizar su alcance?**
Un artista que cruza géneros (crossover) puede clasificarse bajo múltiples categorías. La relación N:M entre tracks y géneros en Tracklytics permite analizar qué combinaciones de géneros tienen mejor desempeño promedio, ayudando a decidir cómo etiquetar y distribuir el catálogo en plataformas de streaming.

---

**PTD-09. ¿En qué momento del año conviene actualizar las métricas y re-evaluar el portafolio de artistas?**
Los ejecutivos de sellos necesitan saber con qué frecuencia los rankings de popularidad se mueven significativamente. Si los datos cambian rápido, las decisiones de inversión deben revisarse más seguido. La frecuencia del ETL y la comparación de runs históricos en `etl_logs` permite responder esta pregunta.

---

**PTD-10. ¿Qué álbumes del catálogo tienen un rendimiento por debajo del promedio del género y merecen ser relanzados o descontinuados?**
Un sello con un catálogo amplio necesita priorizar sus recursos de marketing. Tracklytics permite cruzar la popularidad promedio de los tracks de un álbum con el benchmark de su género (`genre_trends.avg_popularity`), identificando qué álbumes están por debajo del estándar y requieren una decisión: relanzamiento, descontinuación o reclasificación.

---

## 10. Resumen Ejecutivo

| Elemento | Detalle |
|---|---|
| Nombre | Tracklytics |
| Sector | Analítica musical / Tecnología B2B |
| Dataset base | Spotify — 113.550 registros reales + datos sintéticos semanales |
| Base de datos | ClickHouse (columnar) |
| Tablas en el modelo | 15 (11 dimensiones + 1 hechos + 3 infraestructura) |
| Orquestador | Apache Airflow 2.9 |
| Objetivos estratégicos | 5 |
| Objetivos tácticos | 6 |
| Objetivos operacionales | 6 |
| Problemas de sistemas/software | 10 |
| Problemas de toma de decisiones | 10 |

---

## 11. Estado de Implementación v2

Estado de los Problemas de Sistemas (PS) al cierre del Sprint Columnar:

| Problema | Descripción | Estado |
|---|---|---|
| PS-01 | Autenticación y control de acceso | Pendiente |
| PS-02 | ETL ejecutado manualmente sin programación | **Resuelto** — Airflow orquesta el DAG automáticamente |
| PS-03 | Frontend sin actualización en tiempo real | **Parcial** — Polling automático del estado ETL implementado |
| PS-04 | Ausencia de caché para consultas analíticas | Pendiente |
| PS-05 | Logs ETL sin alertas ni monitoreo activo | **Parcial** — Panel ETL muestra estado en vivo con notificaciones |
| PS-06 | Escalabilidad limitada por arquitectura monolítica | **Parcial** — Arquitectura de microservicios en Docker Compose |
| PS-07 | Falta de versionamiento de la API | Pendiente |
| PS-08 | Homónimos y álbumes duplicados en el modelo | Pendiente |
| PS-09 | Ausencia de pruebas de integración | Pendiente |
| PS-10 | Sin gestión de configuración de entornos | **Parcial** — Variables de entorno vía `.env` y Docker secrets |

**Resueltos completamente:** PS-02  
**Resueltos parcialmente:** PS-03, PS-05, PS-06, PS-10  
**Pendientes para sprint siguiente:** PS-01, PS-04, PS-07, PS-08, PS-09