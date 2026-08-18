"""Queries de `publicidad` — ver design.md del change 2026-07-11-regalias-publicidad."""

ANUNCIANTE_ID_MAX = "SELECT max(anunciante_id) AS n FROM DIM_ANUNCIANTE"
ANUNCIANTE_EXISTE = "SELECT count() AS n FROM DIM_ANUNCIANTE WHERE anunciante_id = {anunciante_id:UInt32}"

def anunciantes_list_sql() -> str:
    return """
    SELECT anunciante_id, nombre, sector, activo, fecha_registro
    FROM DIM_ANUNCIANTE ORDER BY nombre
    LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    """

ANUNCIANTES_COUNT = "SELECT count() AS n FROM DIM_ANUNCIANTE"

CAMPANA_ID_MAX = "SELECT max(campana_id) AS n FROM DIM_CAMPANA_PUBLICITARIA"
# Estado vigente de una campaña para las validaciones de ciclo de vida
# (change p1-ciclos-vida): `estado_manual` distingue pausa/cierre MANUAL de la
# elegibilidad por presupuesto (`activa`).
CAMPANA_ESTADO = "SELECT campana_id, nombre, estado_manual FROM DIM_CAMPANA_PUBLICITARIA WHERE campana_id = {campana_id:UInt32} LIMIT 1"

def campanas_list_sql() -> str:
    return """
    SELECT campana_id, anunciante_id, nombre, cpm, presupuesto_total, fecha_inicio, fecha_fin, activa,
           tipo_anuncio, formato, estado_manual, url_destino
    FROM DIM_CAMPANA_PUBLICITARIA ORDER BY fecha_inicio DESC
    LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    """

CAMPANAS_COUNT = "SELECT count() AS n FROM DIM_CAMPANA_PUBLICITARIA"

# Elegible = activa, del tipo de anuncio pedido, y hoy cae dentro de
# [fecha_inicio, fecha_fin] (fecha_fin nula = indefinida). `today()` en vez de
# un parámetro: siempre se evalúa contra el momento real del request (CU-O67,
# RF: "campaña fuera de vigencia no es elegible"). Parametrizada por
# `tipo_anuncio` (monetizacion-retencion-mejoras) — el mismo trigger de audio
# y el nuevo de display comparten esta query, solo cambia el tipo (bindeado,
# no interpolado, igual que el resto de queries de este paquete).
CAMPANAS_ELEGIBLES_POR_TIPO = """
SELECT campana_id, cpm, url_destino FROM DIM_CAMPANA_PUBLICITARIA
WHERE activa = 1 AND estado_manual = '' AND tipo_anuncio = {tipo:String}
  AND fecha_inicio <= today() AND (fecha_fin IS NULL OR fecha_fin >= today())
ORDER BY campana_id
"""

CAMPANA_POR_ID = "SELECT * FROM DIM_CAMPANA_PUBLICITARIA WHERE campana_id = {campana_id:UInt32} LIMIT 1"

IMPRESION_POR_ID = "SELECT * FROM FACT_IMPRESION_ANUNCIO WHERE impresion_id = {impresion_id:String} LIMIT 1"

INGRESO_YA_RECONOCIDO = "SELECT count() AS n FROM FACT_INGRESO_PUBLICITARIO WHERE impresion_id = {impresion_id:String}"


def ingresos_por_campana_sql(where: str) -> str:
    return f"""
    SELECT campana_id, count() AS impresiones, sum(monto) AS ingreso_total
    FROM FACT_INGRESO_PUBLICITARIO
    {where}
    GROUP BY campana_id
    ORDER BY ingreso_total DESC
    """
