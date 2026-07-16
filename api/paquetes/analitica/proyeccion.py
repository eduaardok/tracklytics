"""Proyección estadística simple (regresión lineal) para los paneles
predictivos Enterprise (b2b-tier-access-analitica, design.md decisión 3).

Deliberadamente NO es un modelo de Machine Learning: es un ajuste de mínimos
cuadrados (`numpy.polyfit`, ya en requirements.txt) sobre una serie semanal
corta, extrapolado a un horizonte fijo. Se presenta al cliente B2B como
"proyección"/"tendencia estimada", nunca como predicción de IA — no debe
prometer más precisión de la que este cálculo puede sostener.
"""

import numpy as np

MINIMO_SEMANAS = 3
HORIZONTE_SEMANAS = 4
UMBRAL_ALERTA_PCT = 0.10  # caída acumulada > 10% del promedio de la serie


def proyectar_serie(semanas: list[int], valores: list[float]) -> dict:
    """Ajusta una recta a `(semanas, valores)` y la extrapola
    `HORIZONTE_SEMANAS` adelante. Devuelve `suficiente=False` si hay menos de
    `MINIMO_SEMANAS` puntos distintos — no tiene sentido extrapolar una recta
    con 1-2 puntos."""
    if len(semanas) < MINIMO_SEMANAS:
        return {
            "suficiente": False,
            "mensaje": "Datos insuficientes para calcular una proyección "
                       f"(se requieren al menos {MINIMO_SEMANAS} semanas distintas de datos)",
        }

    pendiente, intercepto = np.polyfit(semanas, valores, 1)
    ultima_semana = max(semanas)
    horizonte = [ultima_semana + i for i in range(1, HORIZONTE_SEMANAS + 1)]
    proyeccion = [round(float(pendiente * s + intercepto), 2) for s in horizonte]

    promedio_serie = sum(valores) / len(valores)
    caida_acumulada = -pendiente * HORIZONTE_SEMANAS
    alerta = bool(promedio_serie > 0 and pendiente < 0 and (caida_acumulada / promedio_serie) > UMBRAL_ALERTA_PCT)

    return {
        "suficiente": True,
        "tipo": "proyeccion_estadistica",
        "pendiente_semanal": round(float(pendiente), 4),
        "horizonte_semanas": horizonte,
        "valores_proyectados": proyeccion,
        "alerta": alerta,
    }


def clasificar_trayectoria(pendiente_artista: float, pendiente_genero: float) -> str:
    """Compara la pendiente proyectada del artista contra la de su género
    predominante — responde "¿el artista gana o pierde tracción relativa a su
    género?" (no en términos absolutos)."""
    diferencia = pendiente_artista - pendiente_genero
    if abs(diferencia) < 0.05:
        return "estable"
    return "ganando_terreno" if diferencia > 0 else "perdiendo_terreno"
