"""Formato de respuesta estándar de los 30 informes compuestos (S13-P3a)."""


def armar_respuesta(informe: str, objetivo: str, titulo: str, departamento: str,
                     periodo_inicio_solicitado: str | None, periodo_fin_solicitado: str | None,
                     datos: list[dict], resumen: dict) -> dict:
    periodos = [d["periodo"] for d in datos if d.get("periodo")]
    return {
        "informe":        informe,
        "objetivo":       objetivo,
        "titulo":         titulo,
        "departamento":   departamento,
        "periodo_inicio": periodo_inicio_solicitado or (min(periodos) if periodos else None),
        "periodo_fin":    periodo_fin_solicitado or (max(periodos) if periodos else None),
        "datos":          datos,
        "resumen":        resumen,
    }
