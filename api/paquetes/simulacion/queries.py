"""Queries de `simulacion` — ver design.md del change `modelo-financiero-simulacion`."""

# Universo de tracks para ponderar reproducciones sintéticas por popularidad,
# mismo criterio que `etl/engagement/generator.py::run_engagement_referencia`.
TRACKS_PARA_PONDERAR = "SELECT fact_id, popularity FROM FACT_TRACKS"
