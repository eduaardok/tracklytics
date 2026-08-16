## MODIFIED Requirements

### Requirement: Cálculo de engagement_score
El sistema SHALL calcular y mostrar el `engagement_score` normalizado (0-100) por track/artista, a partir de favoritos, reproducciones, likes y adiciones a playlist. Un like SHALL sumar puntos al `raw_score` subyacente (peso ×2, entre reproducción ×1 y favorito ×3); un dislike NO SHALL restar puntos del `raw_score` — se registra y se muestra en la interfaz para transparencia social, pero no compone el cálculo del índice (RN-ANA-001, modificación autorizada explícitamente por Eduardo en S16 prompt 09: la fórmula solo agrega señales positivas de interacción; restar complicaría la lectura pedagógica del indicador como "índice de desempeño relativo" sin aportar valor de negocio claro).

#### Scenario: Calcular engagement_score de un track con interacciones
- **WHEN** un track tiene interacciones de usuario registradas (favoritos, reproducciones, likes o adiciones a playlist)
- **THEN** el sistema calcula su `engagement_score` normalizado en el rango 0-100

#### Scenario: Un like eleva el engagement_score
- **WHEN** un usuario da like a un track
- **THEN** el `raw_score` del track sube en 2 puntos y su `engagement_score` se recalcula reflejando ese incremento

#### Scenario: Un dislike no afecta el engagement_score
- **WHEN** un usuario da dislike a un track que no tiene ninguna otra interacción registrada
- **THEN** el `engagement_score` de ese track permanece en 0, igual que antes del dislike

### Requirement: Índice de desempeño relativo (Mercado vs. Tracklytics)
El sistema SHALL calcular el índice de desempeño relativo (`engagement_score / popularity`) y mostrarlo en una vista comparativa "Mercado vs. Tracklytics". El índice de desempeño relativo SHALL calcularse únicamente para tracks que tienen al menos una interacción de usuario registrada (favorito, reproducción, like o adición a playlist), y SHALL recalcularse de forma consistente cada vez que cambian los datos de engagement subyacentes, sin requerir intervención manual. Un like, por sí solo y sin reproducción ni favorito, SHALL contar como interacción suficiente para activar el cálculo.

#### Scenario: Mostrar índice de desempeño relativo de un track con engagement
- **WHEN** un Cliente B2B consulta el índice de desempeño relativo de un track que tiene al menos una interacción de usuario registrada
- **THEN** el sistema muestra el índice (`engagement_score / popularity`) en la vista "Mercado vs. Tracklytics"

#### Scenario: Un like activa el cálculo del índice sin reproducción ni favorito
- **WHEN** un track solo tiene un like registrado (sin reproducciones ni favoritos)
- **THEN** el sistema calcula y muestra su índice de desempeño relativo, en vez de indicar datos insuficientes

#### Scenario: Consulta de índice de desempeño relativo sin datos de engagement
- **WHEN** un track no tiene ninguna interacción de usuario registrada y el Cliente B2B intenta consultar su índice de desempeño relativo
- **THEN** el sistema indica que no hay datos de engagement suficientes para calcular el índice, en lugar de mostrar un valor incorrecto o vacío sin explicación
