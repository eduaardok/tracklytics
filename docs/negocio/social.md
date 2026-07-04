# Módulo Social — Documentación de negocio

> Redactado al archivar la capability `social` (2026-07-02), siguiendo la regla de
> documentación en paralelo con la implementación (`docs/decisiones-refactorizacion.md`,
> sección 10). Este archivo es la primera entrega de una serie por capability
> (`docs/negocio/<capability>.md`) que se consolidará en el documento final de Word al
> cerrar las seis capabilities nuevas del semestre (Fase 7). Pendiente relacionado: al
> hacer esa consolidación, `docs/EMPRESA_TRACKLYTICS.md` necesita una revisión — su
> tabla de estado (sección 11) todavía marca "PS-01: Autenticación y control de acceso"
> como *Pendiente*, cuando la capability `seguridad` ya lo resolvió; esa y otras
> inconsistencias del documento (predata el refactor hacia ClickHouse/FastAPI/React)
> se corrigen en la misma ronda de consolidación, junto con la integración de este
> archivo y los de `distribucion`/`experiencia`.

## Propósito

Hasta ahora, un oyente en Tracklytics podía explorar el catálogo y armar su propia
biblioteca, pero no tenía ninguna forma de interactuar con la comunidad de la
plataforma ni de expresar su afinidad por un artista más allá de guardarlo en favoritos.
El módulo Social introduce las tres piezas mínimas de una experiencia social real:
seguir artistas, comentar canciones y compartir contenido fuera de la plataforma.

Además de mejorar la experiencia del oyente, cada interacción social es una nueva señal
de comportamiento que alimenta el motor analítico que la plataforma ofrece a sellos
discográficos, productoras y curadores de playlists: qué artistas concentran seguidores,
qué canciones generan conversación y qué contenido se comparte más son indicadores
directos de tracción e interés de mercado.

## Funcionalidad

### Seguir artistas

Un oyente puede seguir a cualquier artista del catálogo con un solo clic, y dejar de
seguirlo cuando lo desee. Su lista de artistas seguidos queda disponible en todo momento
para consulta. El sistema evita que un oyente siga al mismo artista dos veces de forma
simultánea.

### Comentar canciones

Un oyente puede dejar un comentario en cualquier canción del catálogo y responder a los
comentarios de otros oyentes, generando conversación alrededor de la música. Los
comentarios se publican de inmediato y quedan visibles para cualquier persona que
consulte esa canción, incluidos los clientes B2B en su rol de solo lectura.

### Compartir contenido

Un oyente puede generar un enlace o mensaje listo para compartir un track, una playlist
o el perfil de un artista, seleccionando el canal de destino (red social X, WhatsApp, o
copiar el enlace directamente). Esta función está preparada para integrarse con esos
canales externos en una fase posterior del producto; hoy genera el contenido a compartir
dentro de la propia plataforma.

## Moderación

Todo comentario publicado queda sujeto a revisión posterior por parte del equipo de
administración de la plataforma, que puede ocultarlo (permanece visible que hubo
actividad, pero su contenido deja de mostrarse) o eliminarlo por completo si incumple las
normas de la comunidad. Cada acción de moderación queda registrada junto con el
responsable y la fecha, como parte del historial de auditoría de la plataforma.

## Permisos por rol

| Rol | Seguir artistas | Comentar / responder | Compartir | Leer comentarios | Moderar |
|---|---|---|---|---|---|
| Oyente (B2C) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Cliente de datos (B2B) | ❌ | ❌ | ❌ | ✅ (solo lectura) | ❌ |
| Administración de plataforma | ❌ (no aplica a su rol) | ❌ (no aplica a su rol) | ❌ (no aplica a su rol) | ✅ | ✅ |

La distinción entre oyente y cliente de datos es la misma que ya rige el resto de la
plataforma: el cliente de datos consume el catálogo y sus señales agregadas con fines
analíticos, pero no participa como usuario final de la experiencia de escucha ni de la
conversación social alrededor de ella.

## Valor para el negocio

- **Retención:** seguir artistas y comentar canciones son señales de compromiso —
  oyentes que interactúan socialmente son más difíciles de perder frente a la
  competencia.
- **Descubrimiento orgánico:** compartir contenido fuera de la plataforma es un canal de
  adquisición sin costo de marketing directo.
- **Inteligencia de mercado:** el volumen de seguidores por artista y de comentarios por
  canción se convierte en una métrica adicional de tracción que enriquece los reportes
  ya ofrecidos a sellos discográficos y curadores — más allá de streams y popularidad,
  ahora hay una señal directa de conversación e interés de la audiencia.
- **Confianza de marca:** la moderación activa protege la calidad de la conversación
  pública, un requisito para que sellos y artistas confíen en la plataforma como espacio
  de exposición de su música.
