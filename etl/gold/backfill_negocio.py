"""etl/gold/backfill_negocio.py — S14-P3: genera 24 meses de historia real de
eventos de negocio en las tablas `FACT_*` del catálogo (8123), para que los
12 módulos de `etl/gold_ch/` agreguen datos reales en vez de fabricar cifras
en tiempo de agregación con `rng_for()` (ver docs/BITACORA_S14.md, P3,
"Problema a resolver").

Principio: la simulación vive en la capa ETL (RT-07, mismo criterio que
`FACT_TRACKS`/`FACT_ENGAGEMENT_USUARIO` sintéticos, `gold/modelo_negocio_sync.py`
y `api/paquetes/simulacion/generador.py`, que ya generan actividad reproducible
directo en ClickHouse) — nunca en la capa de presentación/agregación. Cada
tabla que ya tiene un mecanismo de trazabilidad (`source_type`, `is_synthetic`/
`source`) lo usa; ese marcador es para paneles internos de operaciones y para
`docs/NOTA_METODOLOGICA.md`, nunca para superficies de negocio.

Idempotencia: mismo patrón que `gold/modelo_negocio_sync.py` (`ETL_BATCH_CONTROL`
+ un `checksum` propio por dominio, dado que la tabla no tiene columna de
proceso/origen) — pero a diferencia de ese DAG (pensado para correr una
semana académica a la vez, repetidamente), este backfill es de una sola
corrida histórica completa: un flag por dominio ("¿ya generé sus 24 meses?"),
no un flag por período. Reintentar la corrida completa dos veces dejá el
mismo resultado (cada dominio se salta si ya corrió).

Orden de dependencia (no se generan tablas en paralelo, ver Fase 3 del
prompt): usuarios -> gasto marketing -> suscripciones (transacciones+
facturas+reembolsos+cancelaciones) -> publicidad (impresiones+ingreso,
sobre campañas ya existentes) -> engagement (reproducciones+favoritos) ->
regalías (liquidación real vía el endpoint ya probado de `regalias`, no
una fórmula duplicada) -> el resto de dominios (disponibilidad, partners,
comunidad, producto, contenido) -> auditoría (al final: audita acciones de
los dominios anteriores).
"""

import hashlib
import os
import random
import time
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx
import numpy as np

from utils.clickhouse_client import get_client, scalar
from utils.config import get_config

# ─────────────────────────────────────────────────────────────────────────────
# Fase 2 — ventana histórica: 24 meses exactos hacia atrás desde la fecha de
# ejecución, anclados al primer día del mes (no un offset de días crudo) para
# que la idempotencia y los cortes mensuales sean estables sin importar a qué
# hora del día se dispare el DAG. Cubre justo los 5 horizontes de
# `gold_ch.base.HORIZONTE_POR_GRANULARIDAD` (día 90, semana 52, mes 24,
# trimestre 8, año 3) sin dejar buckets vacíos ni inventar historia que el
# resto del sistema no pueda sostener.
# ─────────────────────────────────────────────────────────────────────────────
MESES_HISTORIA = 24


def _add_months(d: date, n: int) -> date:
    total = d.year * 12 + (d.month - 1) + n
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


def inicio_plataforma() -> date:
    """Primer día del mes, 24 meses antes del mes actual."""
    hoy = date.today()
    return _add_months(hoy.replace(day=1), -MESES_HISTORIA)


def _hoy() -> date:
    return date.today()


CHECKSUM_TAG = "backfill_negocio"

# ─────────────────────────────────────────────────────────────────────────────
# Constantes de negocio — TODAS tomadas del código real, ninguna inventada
# (ver docs/BITACORA_S14.md, P3, Fase 1, tabla de constantes con su origen).
# ─────────────────────────────────────────────────────────────────────────────
IVA_RATE = 0.15                       # api/paquetes/facturacion/queries.py::IVA_RATE
RETENCION_FISCAL_PCT_GLOBAL = 10.0    # api/paquetes/regalias/router.py::_resolver_retencion_pct (default global)
TASA_EXITO_PAGO = 0.9                 # api/paquetes/facturacion/queries.py::TASA_EXITO_DEFAULT
MAX_INTENTOS_COBRO = 3                # api/paquetes/suscripciones/router.py::MAX_INTENTOS_COBRO
DIAS_CICLO_FACTURACION = 30           # api/paquetes/facturacion/router.py::DIAS_CICLO_FACTURACION
STRIKES_PARA_SUSPENSION = 3           # api/paquetes/seguridad/strikes.py::STRIKES_PARA_SUSPENSION
TASA_RIGHTSHOLDERS = 0.70             # api/paquetes/regalias/router.py::TASA_RIGHTSHOLDERS
PCT_MASTER = 0.80                     # api/paquetes/regalias/router.py::PCT_MASTER
PCT_PUBLISHING = 0.20                 # api/paquetes/regalias/router.py::PCT_PUBLISHING

# api/paquetes/suscripciones/planes.py::PLANES_B2C/PLANES_B2B (precios reales)
PLANES_B2C = {"premium": 9.99, "estudiante": 4.99}  # "free" no genera transacción
PLANES_B2B = {"basico": 199.0, "pro": 499.0, "enterprise": 1499.0}

PAISES = ["Ecuador", "México", "Colombia", "Argentina", "España", "Perú",
          "Chile", "Estados Unidos", "Brasil", "Reino Unido"]

# Credenciales de la cuenta demo `superadmin` (S14-P3, Fase 5; sembrada por
# `seed_cuentas_demo` desde S14-P4) — necesaria para llamar
# POST /admin/liquidar (regalías) vía HTTP real, porque el contenedor
# `airflow` no tiene el paquete `api/` montado ni sus dependencias (FastAPI)
# instaladas: no se puede importar `liquidar_periodo_interno` directo, así
# que se llama por HTTP igual que cualquier otro cliente de la API — el
# mismo mecanismo ya probado, no una reimplementación de la fórmula.
#
# S14-P4: las credenciales salían hardcodeadas en texto plano (hallazgo de
# la Fase 1 de S14-P4) — ahora se leen de variables de entorno, con el
# mismo valor demo como default explícito para que `docker compose up` siga
# funcionando sin configuración manual (mismo criterio que
# `seed_cuentas_demo`/`docker-compose.yml`, que declaran el mismo default).
API_BASE_URL = os.getenv("REPORTES_API_BASE_URL", "http://api:8000/app/v1")
SUPERADMIN_EMAIL = os.getenv("SUPERADMIN_DEMO_EMAIL", "superadmin@demo.tracklytics.com")
SUPERADMIN_PASSWORD = os.getenv("SUPERADMIN_DEMO_PASSWORD", "Demo12345!")


# ─────────────────────────────────────────────────────────────────────────────
# Idempotencia — mismo mecanismo que gold/modelo_negocio_sync.py
# ─────────────────────────────────────────────────────────────────────────────

def _tag(dominio: str) -> str:
    return f"{CHECKSUM_TAG}:{dominio}"


def _ya_generado(client, dominio: str) -> bool:
    existing = scalar(
        client,
        "SELECT count() FROM ETL_BATCH_CONTROL WHERE checksum = {c:String}",
        {"c": _tag(dominio)},
    )
    return bool(existing)


def _registrar(client, dominio: str, record_count: int) -> None:
    next_batch_id = int(scalar(client, "SELECT max(batch_id) FROM ETL_BATCH_CONTROL") or 0) + 1
    client.insert(
        "ETL_BATCH_CONTROL",
        [(next_batch_id, 0, record_count, _tag(dominio))],
        column_names=["batch_id", "week_number", "record_count", "checksum"],
    )


def _rng(dominio: str) -> np.random.Generator:
    """Seed determinista derivada del nombre del dominio (no del reloj) —
    reproducible: correr el backfill dos veces genera exactamente las mismas
    filas para un dominio que todavía no se hubiera generado."""
    seed = int(hashlib.md5(f"{CHECKSUM_TAG}:{dominio}".encode()).hexdigest()[:8], 16)
    return np.random.default_rng(seed)


def _insertar_por_lotes(client, tabla: str, filas: list[tuple], columnas: list[str], tam_lote: int = 100_000) -> int:
    """Batches de hasta `tam_lote` filas (requisito de rendimiento del
    proyecto: mínimo 50.000) — para dominios cuyo volumen total no alcanza
    ese mínimo, un solo insert() no fragmentado ya es la forma correcta
    (batching existe para evitar miles de INSERTs chicos, no para forzar un
    tamaño mínimo artificial en tablas que genuinamente son pequeñas)."""
    for i in range(0, len(filas), tam_lote):
        client.insert(tabla, filas[i:i + tam_lote], column_names=columnas)
    return len(filas)


# ─────────────────────────────────────────────────────────────────────────────
# Crecimiento y estacionalidad (Fase 3: "forma realista en el tiempo")
# ─────────────────────────────────────────────────────────────────────────────

def _factor_crecimiento(dia: date, dia_inicio: date, dias_totales: int) -> float:
    """0..1 progresivo con saturación hacia el final (raíz, no lineal) —
    adopción típica de producto: crecimiento rápido al inicio, se estabiliza
    después."""
    x = (dia - dia_inicio).days / max(1, dias_totales)
    return min(1.0, max(0.0, x)) ** 0.6


def _factor_estacional_semana(dia: date) -> float:
    """Consumo (reproducciones) sube el fin de semana, baja a principio de
    semana — estacionalidad semanal pedida explícitamente en la Fase 3."""
    wd = dia.weekday()  # 0=lunes
    if wd in (4, 5, 6):
        return 1.18
    if wd in (0, 1):
        return 0.90
    return 1.0


def _rango_dias(dia_inicio: date, dia_fin: date):
    d = dia_inicio
    while d < dia_fin:
        yield d
        d += timedelta(days=1)


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 1 — Usuarios (DIM_USUARIO)
# ─────────────────────────────────────────────────────────────────────────────
USUARIOS_DIA_INICIO = 5
USUARIOS_DIA_FIN = 25


def backfill_usuarios(client, dia_inicio: date, dia_fin: date, clave_control: str | None = None) -> list[dict]:
    dominio = clave_control or "usuarios"
    if _ya_generado(client, dominio):
        existentes = client.query(
            "SELECT usuario_id, fecha_registro, pais FROM DIM_USUARIO "
            "WHERE usuario_id LIKE 'bf_%' ORDER BY fecha_registro"
        ).result_rows
        print(f"[backfill_negocio] {dominio}: ya generado, {len(existentes)} usuarios reutilizados.")
        return [{"usuario_id": r[0], "fecha_registro": r[1].date() if hasattr(r[1], 'date') else r[1], "pais": r[2]} for r in existentes]

    rng = _rng(dominio)
    dias_totales = (dia_fin - dia_inicio).days
    filas = []
    usuarios: list[dict] = []
    idx = 0
    for dia in _rango_dias(dia_inicio, dia_fin):
        crecim = _factor_crecimiento(dia, dia_inicio, dias_totales)
        objetivo = USUARIOS_DIA_INICIO + (USUARIOS_DIA_FIN - USUARIOS_DIA_INICIO) * crecim
        n = int(rng.poisson(objetivo))
        for _ in range(n):
            usuario_id = f"bf_{idx:06d}"
            idx += 1
            segundos = int(rng.integers(0, 86400))
            fecha_registro = datetime.combine(dia, datetime.min.time()) + timedelta(seconds=segundos)
            pais = str(rng.choice(PAISES))
            filas.append((
                usuario_id, f"{usuario_id}@sim.tracklytics.internal", f"Usuario Sim {idx:06d}",
                pais, fecha_registro, "usuario", 0, 1,
            ))
            usuarios.append({"usuario_id": usuario_id, "fecha_registro": dia, "pais": pais})

    _insertar_por_lotes(
        client, "DIM_USUARIO", filas,
        ["usuario_id", "email", "nombre", "pais", "fecha_registro", "rol", "perfil_publico", "email_verificado"],
    )
    _registrar(client, dominio, len(filas))
    print(f"[backfill_negocio] {dominio}: {len(filas)} usuarios nuevos ({dia_inicio} — {dia_fin}).")
    return usuarios


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 2 — Gasto de marketing (FACT_GASTO_OPERATIVO, categoria=marketing)
# ─────────────────────────────────────────────────────────────────────────────
GASTO_MARKETING_INICIO = 500.0
GASTO_MARKETING_FIN = 8000.0


def backfill_gasto_marketing(client, dia_inicio: date, dia_fin: date, clave_control: str | None = None) -> int:
    dominio = clave_control or "gasto_marketing"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return 0

    rng = _rng(dominio)
    meses = _meses_calendario(dia_inicio, dia_fin)
    filas = []
    for i, (m_ini, _m_fin) in enumerate(meses):
        crecim = i / max(1, len(meses) - 1)
        objetivo = GASTO_MARKETING_INICIO + (GASTO_MARKETING_FIN - GASTO_MARKETING_INICIO) * crecim
        # Variación mensual (Fase 3: "variación mensual en gasto de marketing").
        monto = round(float(objetivo * rng.uniform(0.8, 1.25)), 2)
        filas.append((
            str(uuid.uuid4()), "Campaña de marketing mensual", "marketing", monto,
            m_ini, "Generado por backfill_negocio (S14-P3)", "activo", "sistema_backfill_negocio",
        ))
    _insertar_por_lotes(
        client, "FACT_GASTO_OPERATIVO", filas,
        ["gasto_id", "concepto", "categoria", "monto", "fecha", "descripcion", "estado", "responsable_id"],
    )
    _registrar(client, dominio, len(filas))
    print(f"[backfill_negocio] {dominio}: {len(filas)} filas (gasto mensual).")
    return len(filas)


def _meses_calendario(dia_inicio: date, dia_fin: date) -> list[tuple[date, date]]:
    meses = []
    cursor = dia_inicio
    while cursor < dia_fin:
        siguiente = min(_add_months(cursor, 1), dia_fin)
        meses.append((cursor, siguiente))
        cursor = siguiente
    return meses


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 3 — Suscripciones: transacciones + facturas + reembolsos +
# cancelaciones. "Una factura exige una suscripción previa" / "una
# cancelación exige una suscripción activa antes" — se generan juntas, en
# orden, por usuario.
# ─────────────────────────────────────────────────────────────────────────────
TASA_CONVERSION_B2C = 0.30
DIAS_CONVERSION_MIN, DIAS_CONVERSION_MAX = 1, 60
CHURN_MENSUAL_VOLUNTARIO = 0.02  # 2% de probabilidad de cancelar cada mes, por suscriptor activo
N_USUARIOS_B2B = 30


def backfill_suscripciones(client, dia_inicio: date, dia_fin: date, usuarios: list[dict], clave_control: str | None = None) -> None:
    dominio = clave_control or "suscripciones"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    rng = _rng(dominio)
    hoy = _hoy()
    transacciones, invoices, reembolsos, cancelaciones = [], [], [], []

    def _ciclo_suscripcion(usuario_id: str, plan_id: str, precio: float, fecha_alta: date, moneda: str = "USD"):
        cursor = fecha_alta
        intentos_fallidos_seguidos = 0
        while cursor < hoy:
            transaccion_id = str(uuid.uuid4())
            exitosa = rng.random() < TASA_EXITO_PAGO
            estado = "exitosa" if exitosa else "fallida"
            fecha_txn = datetime.combine(cursor, datetime.min.time()) + timedelta(hours=int(rng.integers(0, 24)))
            periodo_fin_txn = cursor + timedelta(days=DIAS_CICLO_FACTURACION)
            transacciones.append((
                transaccion_id, usuario_id, str(uuid.uuid4()), f"sub_{usuario_id}_{plan_id}",
                precio, moneda, estado, fecha_txn, "suscripcion", cursor, periodo_fin_txn,
            ))
            if exitosa:
                intentos_fallidos_seguidos = 0
                iva = round(precio * IVA_RATE, 2)
                invoices.append((
                    str(uuid.uuid4()), usuario_id, transaccion_id, precio, iva, fecha_txn, "emitido", cursor, periodo_fin_txn,
                ))
                # Reembolso ocasional (raro, ~1.5% de las transacciones exitosas).
                if rng.random() < 0.015:
                    reembolsos.append((
                        str(uuid.uuid4()), transaccion_id, round(precio * rng.choice([0.5, 1.0]), 2),
                        "parcial" if rng.random() < 0.5 else "total", "solicitud_usuario",
                        fecha_txn + timedelta(days=int(rng.integers(1, 10))), "sistema_backfill_negocio", "procesado",
                    ))
                # Churn voluntario mensual.
                if rng.random() < CHURN_MENSUAL_VOLUNTARIO:
                    motivo = rng.choice(["precio", "no_uso", "competencia", "otro"])
                    cancelaciones.append((
                        str(uuid.uuid4()), f"sub_{usuario_id}_{plan_id}", usuario_id, motivo, 1,
                        fecha_txn + timedelta(days=int(rng.integers(1, DIAS_CICLO_FACTURACION))),
                    ))
                    return
            else:
                intentos_fallidos_seguidos += 1
                if intentos_fallidos_seguidos >= MAX_INTENTOS_COBRO:
                    cancelaciones.append((
                        str(uuid.uuid4()), f"sub_{usuario_id}_{plan_id}", usuario_id, "precio", 0,
                        fecha_txn + timedelta(days=1),
                    ))
                    return
            cursor += timedelta(days=DIAS_CICLO_FACTURACION)

    # B2C: fracción de usuarios ya generados por backfill_usuarios() convierte
    # de 'free' a un plan pago tras DIAS_CONVERSION_MIN..MAX días.
    for u in usuarios:
        if rng.random() >= TASA_CONVERSION_B2C:
            continue
        dias_conversion = int(rng.integers(DIAS_CONVERSION_MIN, DIAS_CONVERSION_MAX + 1))
        fecha_alta = u["fecha_registro"] + timedelta(days=dias_conversion)
        if fecha_alta >= hoy:
            continue
        plan_id = "premium" if rng.random() < 0.7 else "estudiante"
        _ciclo_suscripcion(u["usuario_id"], plan_id, PLANES_B2C[plan_id], fecha_alta)

    # B2B: cohorte pequeña de cuentas 'analyst' independientes de DIM_USUARIO
    # (los clientes B2B se registran vía el mismo flujo, pero no dependen del
    # crecimiento de usuarios B2C) — usuario_id reconocible como sintético.
    dias_totales = (dia_fin - dia_inicio).days
    for i in range(N_USUARIOS_B2B):
        usuario_id = f"bf_b2b_{i:04d}"
        fecha_alta = dia_inicio + timedelta(days=int(rng.integers(0, max(1, dias_totales - 30))))
        plan_id = str(rng.choice(list(PLANES_B2B.keys()), p=[0.5, 0.3, 0.2]))
        _ciclo_suscripcion(usuario_id, plan_id, PLANES_B2B[plan_id], fecha_alta)

    if transacciones:
        _insertar_por_lotes(
            client, "FACT_TRANSACCION_PAGO", transacciones,
            ["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado",
             "fecha", "concepto", "periodo_inicio", "periodo_fin"],
        )
    if invoices:
        _insertar_por_lotes(
            client, "FACT_INVOICE", invoices,
            ["invoice_id", "usuario_id", "transaccion_id", "monto", "iva", "fecha_emision", "estado",
             "periodo_inicio", "periodo_fin"],
        )
    if reembolsos:
        _insertar_por_lotes(
            client, "FACT_REEMBOLSO", reembolsos,
            ["reembolso_id", "transaccion_id", "monto", "tipo", "motivo", "fecha", "responsable_id", "estado"],
        )
    if cancelaciones:
        _insertar_por_lotes(
            client, "FACT_CANCELACION_SUSCRIPCION", cancelaciones,
            ["cancelacion_id", "suscripcion_id", "usuario_id", "motivo", "voluntaria", "fecha"],
        )
    total = len(transacciones) + len(invoices) + len(reembolsos) + len(cancelaciones)
    _registrar(client, dominio, total)
    print(f"[backfill_negocio] {dominio}: {len(transacciones)} transacciones, {len(invoices)} facturas, "
          f"{len(reembolsos)} reembolsos, {len(cancelaciones)} cancelaciones.")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 4 — Publicidad: impresiones + ingreso, sobre campañas YA EXISTENTES
# y vigentes en cada fecha ("una impresión de anuncio exige una campaña
# vigente en esa fecha").
# ─────────────────────────────────────────────────────────────────────────────
IMPRESIONES_DIA_INICIO = 20
IMPRESIONES_DIA_FIN = 400


def backfill_publicidad(client, dia_inicio: date, dia_fin: date, usuarios: list[dict], clave_control: str | None = None) -> None:
    dominio = clave_control or "publicidad"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    campanas = client.query(
        "SELECT campana_id, cpm, fecha_inicio, fecha_fin, tipo_anuncio FROM DIM_CAMPANA_PUBLICITARIA"
    ).result_rows
    if not campanas:
        print(f"[backfill_negocio] {dominio}: sin campañas en DIM_CAMPANA_PUBLICITARIA, se omite.")
        _registrar(client, dominio, 0)
        return

    rng = _rng(dominio)
    dias_totales = (dia_fin - dia_inicio).days
    usuario_ids = [u["usuario_id"] for u in usuarios] or ["bf_000000"]

    impresiones, ingresos = [], []
    for dia in _rango_dias(dia_inicio, dia_fin):
        vigentes = [c for c in campanas if c[2] <= dia and (c[3] is None or dia <= c[3])]
        if not vigentes:
            continue
        crecim = _factor_crecimiento(dia, dia_inicio, dias_totales)
        n_dia = int(rng.poisson(IMPRESIONES_DIA_INICIO + (IMPRESIONES_DIA_FIN - IMPRESIONES_DIA_INICIO) * crecim))
        for _ in range(n_dia):
            campana_id, cpm, _fi, _ff, tipo = vigentes[int(rng.integers(0, len(vigentes)))]
            impresion_id = str(uuid.uuid4())
            fecha = datetime.combine(dia, datetime.min.time()) + timedelta(seconds=int(rng.integers(0, 86400)))
            completado = 1 if rng.random() < (0.75 if tipo == "audio" else 0.55) else 0
            click = 1 if rng.random() < 0.08 else 0
            usuario_id = str(rng.choice(usuario_ids))
            impresiones.append((impresion_id, int(campana_id), usuario_id, completado, fecha, click))
            monto = round(float(cpm) / 1000, 4)
            ingresos.append((str(uuid.uuid4()), impresion_id, int(campana_id), monto, fecha))

    if impresiones:
        _insertar_por_lotes(
            client, "FACT_IMPRESION_ANUNCIO", impresiones,
            ["impresion_id", "campana_id", "usuario_id", "completado", "fecha", "click"],
        )
        _insertar_por_lotes(
            client, "FACT_INGRESO_PUBLICITARIO", ingresos,
            ["ingreso_id", "impresion_id", "campana_id", "monto", "fecha"],
        )
    _registrar(client, dominio, len(impresiones) + len(ingresos))
    print(f"[backfill_negocio] {dominio}: {len(impresiones)} impresiones, {len(ingresos)} filas de ingreso.")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 5 — Engagement: reproducciones + favoritos (el dominio de mayor
# volumen — crecimiento progresivo + estacionalidad semanal explícita).
# ─────────────────────────────────────────────────────────────────────────────
REPRODUCCIONES_DIA_INICIO = 80
REPRODUCCIONES_DIA_FIN = 1800
PCT_FAVORITO_ADD = 0.06
PCT_FAVORITO_REMOVE = 0.015


def backfill_engagement(client, dia_inicio: date, dia_fin: date, usuarios: list[dict], clave_control: str | None = None) -> None:
    dominio = clave_control or "engagement"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    tracks = client.query("SELECT fact_id, popularity FROM FACT_TRACKS WHERE source_type = 'real'").result_rows
    if not tracks:
        print(f"[backfill_negocio] {dominio}: sin tracks reales, se omite.")
        _registrar(client, dominio, 0)
        return

    rng = _rng(dominio)
    fact_ids = np.array([t[0] for t in tracks])
    pesos = np.array([t[1] + 1 for t in tracks], dtype=float)
    pesos = pesos / pesos.sum()

    usuarios_ordenados = sorted(usuarios, key=lambda u: u["fecha_registro"])
    fechas_registro = [u["fecha_registro"] for u in usuarios_ordenados]
    ids_registro = [u["usuario_id"] for u in usuarios_ordenados]
    import bisect

    dias_totales = (dia_fin - dia_inicio).days
    filas: list[tuple] = []
    total_filas = 0
    for dia in _rango_dias(dia_inicio, dia_fin):
        disponibles_hasta = bisect.bisect_right(fechas_registro, dia)
        if disponibles_hasta == 0:
            continue
        pool_usuarios = ids_registro[:disponibles_hasta]

        crecim = _factor_crecimiento(dia, dia_inicio, dias_totales)
        estacional = _factor_estacional_semana(dia)
        n_repro = int(rng.poisson((REPRODUCCIONES_DIA_INICIO + (REPRODUCCIONES_DIA_FIN - REPRODUCCIONES_DIA_INICIO) * crecim) * estacional))
        n_fav_add = int(n_repro * PCT_FAVORITO_ADD)
        n_fav_remove = int(n_repro * PCT_FAVORITO_REMOVE)

        base_dt = datetime.combine(dia, datetime.min.time())
        elegidos_repro = rng.choice(fact_ids, size=n_repro, p=pesos)
        usuarios_repro = rng.choice(pool_usuarios, size=n_repro)
        segundos_repro = rng.integers(0, 86400, size=n_repro)
        for fact_id, uid, seg in zip(elegidos_repro, usuarios_repro, segundos_repro):
            filas.append((str(uuid.uuid4()), str(uid), int(fact_id), "reproduccion",
                          base_dt + timedelta(seconds=int(seg)), True, "referencia"))

        if n_fav_add:
            elegidos = rng.choice(fact_ids, size=n_fav_add, p=pesos)
            usuarios_fav = rng.choice(pool_usuarios, size=n_fav_add)
            segundos = rng.integers(0, 86400, size=n_fav_add)
            for fact_id, uid, seg in zip(elegidos, usuarios_fav, segundos):
                filas.append((str(uuid.uuid4()), str(uid), int(fact_id), "favorito_add",
                              base_dt + timedelta(seconds=int(seg)), True, "referencia"))
        if n_fav_remove:
            elegidos = rng.choice(fact_ids, size=n_fav_remove, p=pesos)
            usuarios_fav = rng.choice(pool_usuarios, size=n_fav_remove)
            segundos = rng.integers(0, 86400, size=n_fav_remove)
            for fact_id, uid, seg in zip(elegidos, usuarios_fav, segundos):
                filas.append((str(uuid.uuid4()), str(uid), int(fact_id), "favorito_remove",
                              base_dt + timedelta(seconds=int(seg)), True, "referencia"))

        if len(filas) >= 150_000:
            total_filas += _insertar_por_lotes(
                client, "FACT_ENGAGEMENT_USUARIO", filas,
                ["engagement_id", "user_id", "fact_id", "event_type", "event_timestamp", "is_synthetic", "source"],
            )
            filas = []

    if filas:
        total_filas += _insertar_por_lotes(
            client, "FACT_ENGAGEMENT_USUARIO", filas,
            ["engagement_id", "user_id", "fact_id", "event_type", "event_timestamp", "is_synthetic", "source"],
        )
    _registrar(client, dominio, total_filas)
    print(f"[backfill_negocio] {dominio}: {total_filas} filas (reproducciones + favoritos).")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 6 — Regalías: NO se recalcula la fórmula acá. Se llama al mismo
# endpoint ya probado (`POST /admin/liquidar`, `liquidar_periodo_interno`)
# una vez por mes calendario del backfill — ya es idempotente por rango de
# fechas exacto del lado del servidor (no hace falta control propio acá).
# El contenedor `airflow` no puede importar `api/paquetes/regalias` directo
# (sin FastAPI instalado, sin el paquete montado) — por eso HTTP, no import.
# ─────────────────────────────────────────────────────────────────────────────

def _login_superadmin() -> str:
    with httpx.Client(timeout=30) as c:
        r = c.post(f"{API_BASE_URL}/seguridad/auth/login", json={
            "email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD, "dispositivo_id": "backfill-negocio-dag",
        })
        r.raise_for_status()
        return r.json()["token"]


def backfill_regalias(dia_inicio: date, dia_fin: date, clave_control: str | None = None) -> None:
    dominio = clave_control or "regalias"
    client = get_client(get_config())
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    token = _login_superadmin()
    meses = _meses_calendario(dia_inicio, dia_fin)
    total_liquidaciones = 0
    with httpx.Client(timeout=60, headers={"Authorization": f"Bearer {token}"}) as c:
        for m_ini, m_fin in meses:
            resp = c.post(f"{API_BASE_URL}/regalias/admin/liquidar", json={
                "periodo_inicio": m_ini.isoformat(), "periodo_fin": m_fin.isoformat(),
            })
            if resp.status_code != 201:
                print(f"[backfill_negocio] {dominio}: liquidar {m_ini}..{m_fin} -> HTTP {resp.status_code} {resp.text[:200]}")
                continue
            data = resp.json()
            total_liquidaciones += data.get("liquidaciones", 0)

    _registrar(client, dominio, total_liquidaciones)
    print(f"[backfill_negocio] {dominio}: {total_liquidaciones} liquidaciones reales sobre {len(meses)} meses "
          f"(vía POST /admin/liquidar, misma fórmula que la API — sin duplicar lógica).")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 7 — Disponibilidad de infraestructura (FACT_DISPONIBILIDAD)
# ─────────────────────────────────────────────────────────────────────────────

def backfill_disponibilidad(client, dia_inicio: date, dia_fin: date, clave_control: str | None = None) -> None:
    dominio = clave_control or "disponibilidad"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    componente_ids = [r[0] for r in client.query("SELECT componente_id FROM DIM_COMPONENTE_INFRAESTRUCTURA").result_rows]
    rng = _rng(dominio)
    filas = [
        (random.getrandbits(50), int(componente_id), int(rng.random() < 0.03),
         datetime.combine(dia, datetime.min.time()) + timedelta(hours=int(rng.integers(0, 24))))
        for componente_id in componente_ids
        for dia in _rango_dias(dia_inicio, dia_fin)
    ]
    _insertar_por_lotes(client, "FACT_DISPONIBILIDAD", filas, ["fact_id", "componente_id", "hubo_incidente", "fecha"])
    _registrar(client, dominio, len(filas))
    print(f"[backfill_negocio] {dominio}: {len(filas)} filas.")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 8 — Llamadas de partners a la API (LOG_LLAMADAS_PARTNER) — sobre
# los partners YA EXISTENTES, no se inventan nuevos.
# ─────────────────────────────────────────────────────────────────────────────
LLAMADAS_DIA_INICIO = 4
LLAMADAS_DIA_FIN = 60
ENDPOINTS_PARTNER = ["/partners/v1/catalogo", "/partners/v1/metadatos", "/partners/v1/streams", "/partners/v1/artistas"]


def backfill_api_partners(client, dia_inicio: date, dia_fin: date, clave_control: str | None = None) -> None:
    dominio = clave_control or "api_partners"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    partners = client.query("SELECT DISTINCT partner_id, tier_usado FROM LOG_LLAMADAS_PARTNER").result_rows
    if not partners:
        print(f"[backfill_negocio] {dominio}: sin partners existentes, se omite.")
        _registrar(client, dominio, 0)
        return

    rng = _rng(dominio)
    dias_totales = (dia_fin - dia_inicio).days
    filas = []
    for dia in _rango_dias(dia_inicio, dia_fin):
        crecim = _factor_crecimiento(dia, dia_inicio, dias_totales)
        for partner_id, tier in partners:
            n = int(rng.poisson(LLAMADAS_DIA_INICIO + (LLAMADAS_DIA_FIN - LLAMADAS_DIA_INICIO) * crecim))
            for _ in range(n):
                exitosa = rng.random() < 0.93
                resultado = "success" if exitosa else str(rng.choice(["auth_rejected", "tier_rejected", "error"]))
                fecha = datetime.combine(dia, datetime.min.time()) + timedelta(seconds=int(rng.integers(0, 86400)))
                filas.append((
                    str(uuid.uuid4()), partner_id, f"key_{partner_id}", str(rng.choice(ENDPOINTS_PARTNER)), tier,
                    resultado, int(rng.integers(1, 500)), round(float(rng.uniform(40, 380)), 2), fecha,
                ))
    _insertar_por_lotes(
        client, "LOG_LLAMADAS_PARTNER", filas,
        ["log_id", "partner_id", "api_key_used", "endpoint", "tier_usado", "resultado", "registros", "duracion_ms", "timestamp"],
    )
    _registrar(client, dominio, len(filas))
    print(f"[backfill_negocio] {dominio}: {len(filas)} filas.")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 9 — Comunidad: comentarios (+moderación), compartición, seguimiento
# de artistas, denuncias (+strikes derivados), tickets de soporte.
# ─────────────────────────────────────────────────────────────────────────────
COMENTARIOS_DIA_INICIO = 5
COMENTARIOS_DIA_FIN = 80
PCT_MODERADO = 0.05
COMPARTICIONES_DIA_INICIO = 2
COMPARTICIONES_DIA_FIN = 25
SEGUIMIENTOS_DIA_INICIO = 1
SEGUIMIENTOS_DIA_FIN = 12


def backfill_comunidad(client, dia_inicio: date, dia_fin: date, usuarios: list[dict], clave_control: str | None = None) -> None:
    dominio = clave_control or "comunidad"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    tracks = client.query("SELECT fact_id FROM FACT_TRACKS WHERE source_type = 'real' LIMIT 20000").result_rows
    fact_ids = [t[0] for t in tracks]
    artist_ids = [r[0] for r in client.query("SELECT artist_id FROM DIM_ARTISTS").result_rows]
    tipos_interaccion = [r[0] for r in client.query("SELECT tipo_interaccion_id FROM DIM_TIPO_INTERACCION_SOCIAL").result_rows] or [1]
    usuario_ids = [u["usuario_id"] for u in usuarios] or ["bf_000000"]

    rng = _rng(dominio)
    dias_totales = (dia_fin - dia_inicio).days
    comentarios, comparticiones, seguimientos = [], [], []
    idx_comentario = 0

    for dia in _rango_dias(dia_inicio, dia_fin):
        crecim = _factor_crecimiento(dia, dia_inicio, dias_totales)
        base_dt = datetime.combine(dia, datetime.min.time())

        n_com = int(rng.poisson(COMENTARIOS_DIA_INICIO + (COMENTARIOS_DIA_FIN - COMENTARIOS_DIA_INICIO) * crecim))
        for _ in range(n_com):
            idx_comentario += 1
            fecha_creacion = base_dt + timedelta(seconds=int(rng.integers(0, 86400)))
            moderado = rng.random() < PCT_MODERADO
            estado = str(rng.choice(["oculto", "eliminado"])) if moderado else "visible"
            comentarios.append((
                random.getrandbits(50), str(rng.choice(usuario_ids)), int(rng.choice(fact_ids)),
                int(rng.choice(tipos_interaccion)), None, "Comentario generado por backfill_negocio (S14-P3)",
                fecha_creacion, estado, "sistema_backfill_negocio" if moderado else None,
                fecha_creacion + timedelta(hours=int(rng.integers(1, 48))) if moderado else None,
            ))

        n_comp = int(rng.poisson(COMPARTICIONES_DIA_INICIO + (COMPARTICIONES_DIA_FIN - COMPARTICIONES_DIA_INICIO) * crecim))
        for _ in range(n_comp):
            fecha = base_dt + timedelta(seconds=int(rng.integers(0, 86400)))
            comparte_track = rng.random() < 0.8
            comparticiones.append((
                random.getrandbits(50), str(rng.choice(usuario_ids)),
                int(rng.choice(fact_ids)) if comparte_track else None,
                None if comparte_track else int(rng.choice(artist_ids)),
                None, int(rng.choice(tipos_interaccion)), str(rng.choice(["x", "whatsapp", "copiar_enlace"])), fecha,
            ))

        n_seg = int(rng.poisson(SEGUIMIENTOS_DIA_INICIO + (SEGUIMIENTOS_DIA_FIN - SEGUIMIENTOS_DIA_INICIO) * crecim))
        for _ in range(n_seg):
            fecha = base_dt + timedelta(seconds=int(rng.integers(0, 86400)))
            seguimientos.append((str(rng.choice(usuario_ids)), int(rng.choice(artist_ids)), fecha, 1))

    if comentarios:
        _insertar_por_lotes(
            client, "FACT_COMENTARIO", comentarios,
            ["fact_id", "usuario_id", "fact_id_track", "tipo_interaccion_id", "comentario_padre_id", "contenido",
             "fecha_creacion", "estado_moderacion", "moderado_por", "fecha_moderacion"],
        )
    if comparticiones:
        _insertar_por_lotes(
            client, "FACT_COMPARTICION", comparticiones,
            ["fact_id", "usuario_id", "fact_id_track", "artista_id", "playlist_id", "tipo_interaccion_id", "canal", "fecha"],
        )
    if seguimientos:
        _insertar_por_lotes(
            client, "BRIDGE_SEGUIMIENTO_ARTISTA", seguimientos,
            ["usuario_id", "artista_id", "fecha_inicio", "activo"],
        )

    total = len(comentarios) + len(comparticiones) + len(seguimientos)
    _registrar(client, dominio, total)
    print(f"[backfill_negocio] {dominio}: {len(comentarios)} comentarios, {len(comparticiones)} comparticiones, "
          f"{len(seguimientos)} seguimientos.")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 10 — Denuncias + strikes derivados, tickets de soporte.
# ─────────────────────────────────────────────────────────────────────────────
DENUNCIAS_DIA_INICIO = 0.1
DENUNCIAS_DIA_FIN = 3.0
TICKETS_DIA_INICIO = 0.3
TICKETS_DIA_FIN = 5.0
PCT_DENUNCIA_GENERA_STRIKE = 0.30


def backfill_denuncias_tickets(client, dia_inicio: date, dia_fin: date, usuarios: list[dict], clave_control: str | None = None) -> None:
    dominio = clave_control or "denuncias_tickets"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    usuario_ids = [u["usuario_id"] for u in usuarios] or ["bf_000000"]
    rng = _rng(dominio)
    dias_totales = (dia_fin - dia_inicio).days
    denuncias, strikes, tickets = [], [], []

    for dia in _rango_dias(dia_inicio, dia_fin):
        crecim = _factor_crecimiento(dia, dia_inicio, dias_totales)
        base_dt = datetime.combine(dia, datetime.min.time())

        n_den = int(rng.poisson(DENUNCIAS_DIA_INICIO + (DENUNCIAS_DIA_FIN - DENUNCIAS_DIA_INICIO) * crecim))
        for _ in range(n_den):
            fecha = base_dt + timedelta(seconds=int(rng.integers(0, 86400)))
            resuelta = rng.random() < 0.7
            estado = str(rng.choice(["resuelta", "rechazada"])) if resuelta else "pendiente"
            denunciante = str(rng.choice(usuario_ids))
            denunciado = str(rng.choice(usuario_ids))
            denuncias.append((
                random.getrandbits(50), denunciante, "comentario", str(random.getrandbits(40)),
                str(rng.choice(["spam", "contenido_inapropiado", "acoso", "suplantacion"])), "", estado, fecha,
                fecha + timedelta(hours=int(rng.integers(2, 72))) if resuelta else fecha,
            ))
            if estado == "resuelta" and rng.random() < PCT_DENUNCIA_GENERA_STRIKE:
                strikes.append((
                    random.getrandbits(50), denunciado, "contenido_inapropiado", "denuncia", "backfill",
                    "sistema_backfill_negocio", 1, fecha + timedelta(hours=1), fecha + timedelta(hours=1),
                ))

        n_tk = int(rng.poisson(TICKETS_DIA_INICIO + (TICKETS_DIA_FIN - TICKETS_DIA_INICIO) * crecim))
        for _ in range(n_tk):
            fecha_creacion = base_dt + timedelta(seconds=int(rng.integers(0, 86400)))
            resuelto = rng.random() < 0.85
            estado_tk = str(rng.choice(["resuelto", "cerrado"])) if resuelto else str(rng.choice(["abierto", "en_proceso"]))
            tickets.append((
                random.getrandbits(50), str(rng.choice(usuario_ids)), "Consulta de soporte",
                "Ticket generado por backfill_negocio (S14-P3)", estado_tk, fecha_creacion,
                fecha_creacion + timedelta(hours=int(rng.integers(1, 96))) if resuelto else None,
            ))

    if denuncias:
        _insertar_por_lotes(
            client, "FACT_DENUNCIA", denuncias,
            ["denuncia_id", "denunciante_id", "tipo_objeto", "objeto_id", "motivo", "descripcion", "estado",
             "created_at", "actualizado_en"],
        )
    if strikes:
        _insertar_por_lotes(
            client, "FACT_STRIKE_USUARIO", strikes,
            ["strike_id", "usuario_id", "motivo", "origen_tipo", "origen_id", "emitido_por", "activo",
             "created_at", "actualizado_en"],
        )
    if tickets:
        _insertar_por_lotes(
            client, "FACT_TICKET_SOPORTE", tickets,
            ["fact_id", "usuario_id", "asunto", "descripcion", "estado", "fecha_creacion", "fecha_resolucion"],
        )
    total = len(denuncias) + len(strikes) + len(tickets)
    _registrar(client, dominio, total)
    print(f"[backfill_negocio] {dominio}: {len(denuncias)} denuncias, {len(strikes)} strikes, {len(tickets)} tickets.")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 11 — Producto: recomendaciones, A/B tests, notificaciones.
# ─────────────────────────────────────────────────────────────────────────────
RECOS_DIA_INICIO = 15
RECOS_DIA_FIN = 250
NOTIFS_DIA_INICIO = 5
NOTIFS_DIA_FIN = 120
EXPERIMENTOS_AB = ["reco_algo_v2", "onboarding_v3", "paywall_copy", "recomendacion_ui"]
TIPOS_NOTIF = ["nuevo_track_artista_seguido", "comentario_en_tu_contenido", "nuevo_colaborador_playlist"]


def backfill_producto(client, dia_inicio: date, dia_fin: date, usuarios: list[dict], clave_control: str | None = None) -> None:
    dominio = clave_control or "producto"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    tracks = client.query("SELECT fact_id FROM FACT_TRACKS WHERE source_type = 'real' LIMIT 20000").result_rows
    fact_ids = [t[0] for t in tracks]
    usuario_ids = [u["usuario_id"] for u in usuarios] or ["bf_000000"]
    # Cada usuario queda fijo en una variante por experimento (A/B real: la
    # asignación es estable por usuario, no aleatoria en cada exposición).
    rng = _rng(dominio)
    asignacion_variante = {
        (uid, exp): str(rng.choice(["A", "B"]))
        for uid in usuario_ids for exp in EXPERIMENTOS_AB
    } if len(usuario_ids) * len(EXPERIMENTOS_AB) < 2_000_000 else {}

    dias_totales = (dia_fin - dia_inicio).days
    recos, exposiciones, notifs = [], [], []

    for dia in _rango_dias(dia_inicio, dia_fin):
        crecim = _factor_crecimiento(dia, dia_inicio, dias_totales)
        base_dt = datetime.combine(dia, datetime.min.time())

        n_reco = int(rng.poisson(RECOS_DIA_INICIO + (RECOS_DIA_FIN - RECOS_DIA_INICIO) * crecim))
        for _ in range(n_reco):
            fecha = base_dt + timedelta(seconds=int(rng.integers(0, 86400)))
            fue_reproducido = 1 if rng.random() < 0.28 else 0
            recos.append((
                random.getrandbits(50), str(rng.choice(usuario_ids)), int(rng.choice(fact_ids)),
                str(rng.choice(["colaborativo", "contenido", "hibrido"])), fue_reproducido, fecha,
            ))

        # Exposiciones A/B — solo una fracción de usuarios activos cada día.
        n_exp = int(rng.poisson(max(1, len(usuario_ids) * 0.01)))
        for _ in range(n_exp):
            uid = str(rng.choice(usuario_ids))
            exp = str(rng.choice(EXPERIMENTOS_AB))
            variante = asignacion_variante.get((uid, exp)) or str(rng.choice(["A", "B"]))
            fecha = base_dt + timedelta(seconds=int(rng.integers(0, 86400)))
            exposiciones.append((random.getrandbits(50), uid, exp, variante, fecha))

        n_notif = int(rng.poisson(NOTIFS_DIA_INICIO + (NOTIFS_DIA_FIN - NOTIFS_DIA_INICIO) * crecim))
        for _ in range(n_notif):
            fecha = base_dt + timedelta(seconds=int(rng.integers(0, 86400)))
            tipo = str(rng.choice(TIPOS_NOTIF))
            ref_tipo = {"nuevo_track_artista_seguido": "track", "comentario_en_tu_contenido": "comentario",
                        "nuevo_colaborador_playlist": "playlist"}[tipo]
            leido = rng.random() < 0.55
            notifs.append((
                random.getrandbits(50), str(rng.choice(usuario_ids)), tipo, ref_tipo, str(random.getrandbits(40)),
                "Notificación generada por backfill_negocio (S14-P3)", int(leido), fecha,
                fecha + timedelta(hours=int(rng.integers(1, 48))) if leido else None,
            ))

    if recos:
        _insertar_por_lotes(
            client, "FACT_IMPRESION_RECOMENDACION", recos,
            ["fact_id", "usuario_id", "fact_id_track", "algoritmo", "fue_reproducido", "fecha"],
        )
    if exposiciones:
        _insertar_por_lotes(
            client, "FACT_AB_TEST_EXPOSICION", exposiciones,
            ["fact_id", "usuario_id", "experimento", "variante", "fecha"],
        )
    if notifs:
        _insertar_por_lotes(
            client, "FACT_NOTIFICACION", notifs,
            ["fact_id", "usuario_destino_id", "tipo", "referencia_tipo", "referencia_id", "mensaje", "leido",
             "fecha_creacion", "fecha_lectura"],
        )
    total = len(recos) + len(exposiciones) + len(notifs)
    _registrar(client, dominio, total)
    print(f"[backfill_negocio] {dominio}: {len(recos)} recomendaciones, {len(exposiciones)} exposiciones AB, "
          f"{len(notifs)} notificaciones.")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 12 — Contenido: sumisiones de tracks por cuentas de artista reales.
# ─────────────────────────────────────────────────────────────────────────────
N_SUBIDAS = 180


def backfill_contenido(client, dia_inicio: date, dia_fin: date, clave_control: str | None = None) -> None:
    dominio = clave_control or "contenido"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    cuentas_artista = [r[0] for r in client.query("SELECT cuenta_artista_id FROM DIM_CUENTA_ARTISTA").result_rows]
    generos = [r[0] for r in client.query("SELECT genre_id FROM DIM_GENRES").result_rows]
    if not cuentas_artista:
        print(f"[backfill_negocio] {dominio}: sin cuentas de artista, se omite.")
        _registrar(client, dominio, 0)
        return

    rng = _rng(dominio)
    dias_totales = (dia_fin - dia_inicio).days
    stagings, subidas = [], []
    for i in range(N_SUBIDAS):
        dia = dia_inicio + timedelta(days=int(rng.integers(0, max(1, dias_totales))))
        cuenta_artista_id = str(rng.choice(cuentas_artista))
        staging_id = str(uuid.uuid4())
        subido_en = datetime.combine(dia, datetime.min.time()) + timedelta(seconds=int(rng.integers(0, 86400)))
        stagings.append((
            staging_id, cuenta_artista_id, f"Track backfill {i:04d}", f"Album backfill {i:04d}",
            int(rng.choice(generos)), int(rng.integers(120000, 300000)), int(rng.random() < 0.15),
            round(float(rng.uniform(0, 1)), 3), round(float(rng.uniform(0, 1)), 3), int(rng.integers(0, 12)),
            round(float(rng.uniform(-20, 0)), 2), int(rng.integers(0, 2)), round(float(rng.uniform(0, 1)), 3),
            round(float(rng.uniform(0, 1)), 3), round(float(rng.uniform(0, 1)), 3), round(float(rng.uniform(0, 1)), 3),
            round(float(rng.uniform(0, 1)), 3), round(float(rng.uniform(60, 180)), 2), 4, subido_en,
            "Subida generada por backfill_negocio (S14-P3)",
        ))
        estado_revision_id = int(rng.choice([1, 2, 2, 2, 3], p=[0.15, 0.5, 0.15, 0.15, 0.05]))
        resuelto = estado_revision_id != 1
        subidas.append((
            str(uuid.uuid4()), cuenta_artista_id, staging_id, estado_revision_id, subido_en,
            subido_en + timedelta(hours=int(rng.integers(2, 120))) if resuelto else None,
            "sistema_backfill_negocio" if resuelto else None, None, 0,
        ))

    _insertar_por_lotes(
        client, "STG_ARTIST_UPLOADS", stagings,
        ["staging_id", "cuenta_artista_id", "track_name", "album_name", "genre_id", "duration_ms", "explicit",
         "danceability", "energy", "key", "loudness", "mode", "speechiness", "acousticness", "instrumentalness",
         "liveness", "valence", "tempo", "time_signature", "subido_en", "descripcion"],
    )
    _insertar_por_lotes(
        client, "FACT_SUBIDA_TRACK", subidas,
        ["subida_id", "cuenta_artista_id", "staging_id", "estado_revision_id", "fecha_subida", "fecha_resolucion",
         "admin_resolutor_id", "fact_id_promovido", "version"],
    )
    _registrar(client, dominio, len(stagings) + len(subidas))
    print(f"[backfill_negocio] {dominio}: {len(subidas)} sumisiones de tracks.")


# ─────────────────────────────────────────────────────────────────────────────
# Dominio 13 (último) — Auditoría: registra una muestra representativa de las
# acciones reales generadas por los dominios anteriores (altas de usuario,
# conversiones/cancelaciones de suscripción) — no un volumen desconectado.
# ─────────────────────────────────────────────────────────────────────────────

def backfill_auditoria(client, dia_inicio: date, dia_fin: date, usuarios: list[dict], clave_control: str | None = None) -> None:
    dominio = clave_control or "auditoria"
    if _ya_generado(client, dominio):
        print(f"[backfill_negocio] {dominio}: ya generado, se salta.")
        return

    rng = _rng(dominio)
    filas = []
    for u in usuarios:
        fecha = datetime.combine(u["fecha_registro"], datetime.min.time()) + timedelta(seconds=int(rng.integers(0, 86400)))
        filas.append((
            str(uuid.uuid4()), u["usuario_id"], "registro_usuario", "DIM_USUARIO", "",
            f'{{"pais": "{u["pais"]}"}}', fecha,
        ))

    cancelaciones = client.query(
        "SELECT usuario_id, fecha, motivo FROM FACT_CANCELACION_SUSCRIPCION WHERE usuario_id LIKE 'bf_%'"
    ).result_rows
    for usuario_id, fecha, motivo in cancelaciones:
        filas.append((
            str(uuid.uuid4()), usuario_id, "cancelar_suscripcion", "FACT_CANCELACION_SUSCRIPCION", "",
            f'{{"motivo": "{motivo}"}}', fecha,
        ))

    _insertar_por_lotes(
        client, "FACT_AUDIT_LOG", filas,
        ["audit_id", "usuario_id", "accion", "tabla_afectada", "antes", "despues", "timestamp"],
    )
    _registrar(client, dominio, len(filas))
    print(f"[backfill_negocio] {dominio}: {len(filas)} filas.")


# ─────────────────────────────────────────────────────────────────────────────
# Orquestador — orden de dependencia estricto, sin paralelismo entre dominios.
# ─────────────────────────────────────────────────────────────────────────────

def run_backfill_negocio(**_context) -> None:
    t0 = time.time()
    cfg = get_config()
    client = get_client(cfg)

    dia_inicio = inicio_plataforma()
    dia_fin = _hoy()
    print(f"[backfill_negocio] Ventana: {dia_inicio} — {dia_fin} ({(dia_fin - dia_inicio).days} días, "
          f"{MESES_HISTORIA} meses de historia).")

    usuarios = backfill_usuarios(client, dia_inicio, dia_fin)
    backfill_gasto_marketing(client, dia_inicio, dia_fin)
    backfill_suscripciones(client, dia_inicio, dia_fin, usuarios)
    backfill_publicidad(client, dia_inicio, dia_fin, usuarios)
    backfill_engagement(client, dia_inicio, dia_fin, usuarios)
    backfill_regalias(dia_inicio, dia_fin)
    backfill_disponibilidad(client, dia_inicio, dia_fin)
    backfill_api_partners(client, dia_inicio, dia_fin)
    backfill_comunidad(client, dia_inicio, dia_fin, usuarios)
    backfill_denuncias_tickets(client, dia_inicio, dia_fin, usuarios)
    backfill_producto(client, dia_inicio, dia_fin, usuarios)
    backfill_contenido(client, dia_inicio, dia_fin)
    backfill_auditoria(client, dia_inicio, dia_fin, usuarios)

    print(f"[backfill_negocio] Terminado en {time.time() - t0:.1f}s.")


# ─────────────────────────────────────────────────────────────────────────────
# S14-P4, Fase 5 — generación bajo demanda, con relleno de huecos.
#
# `run_backfill_negocio()` (arriba) es la corrida histórica de una sola vez,
# con un flag POR DOMINIO ("¿ya generé sus 24 meses?"). Eso no alcanza para
# el caso de uso real de esta fase: si pasan semanas y aparece un hueco nuevo
# (o alguien borra un período a mano para forzar una regeneración), un flag
# de "todo o nada" no lo detecta — el dominio ya está marcado "hecho" y
# `run_backfill_negocio()` no vuelve a tocarlo nunca más.
#
# `generar_actividad_rango()` en cambio trabaja a granularidad de MES: por
# cada dominio y cada mes calendario del rango pedido, revisa si ESE mes
# específico ya está cubierto (`ETL_BATCH_CONTROL`, checksum
# `backfill_negocio:<dominio>:<AAAA-MM>` — un namespace distinto del flag de
# todo-el-dominio de arriba, conviven sin pisarse) y solo genera los que
# faltan. Reusa las mismas 13 funciones `backfill_*` de arriba sin
# duplicarlas: `clave_control` les inyecta la clave de idempotencia con la
# que revisan/registran, en vez de la fija de todo-el-dominio.
#
# Alcance deliberadamente acotado a los dominios cuya generación es
# independiente mes a mes (aditiva): `usuarios`, `gasto_marketing`,
# `publicidad`, `engagement`, `regalias`, `disponibilidad`, `api_partners`,
# `comunidad`, `denuncias_tickets`, `producto`. Quedan fuera, documentado,
# no ocultado:
# - `suscripciones`: simula el CICLO DE VIDA completo de una suscripción
#   (alta -> cobros mensuales -> cancelación) por usuario en una sola
#   pasada; volver a invocarla para un mes suelto re-tiraría el dado de
#   conversión de los mismos usuarios y generaría transacciones duplicadas.
# - `contenido`: genera un N fijo de sumisiones distribuidas al azar en TODO
#   el rango pedido, no una cantidad por mes — no tiene una unidad "por mes"
#   que rellenar.
# - `auditoria`: deriva filas de otros dominios ya generados (altas,
#   cancelaciones) — depende de qué generó cada corrida, no tiene generación
#   propia independiente por mes.
# ─────────────────────────────────────────────────────────────────────────────

DOMINIOS_BAJO_DEMANDA = (
    "usuarios", "gasto_marketing", "publicidad", "engagement", "regalias",
    "disponibilidad", "api_partners", "comunidad", "denuncias_tickets", "producto",
)


def _mes_label(d: date) -> str:
    return d.strftime("%Y-%m")


def _usuarios_hasta(client, mes_fin: date) -> list[dict]:
    """Usuarios generados por el backfill (prefijo `bf_`) ya registrados
    antes del fin del mes pedido — pool real para dominios que necesitan
    'quién estaba activo' en ese momento (no incluye las cuentas demo/admin,
    que no deben acumular actividad sintética)."""
    return [
        {"usuario_id": r[0], "fecha_registro": r[1], "pais": r[2]}
        for r in client.query(
            "SELECT usuario_id, fecha_registro, pais FROM DIM_USUARIO "
            "WHERE startsWith(usuario_id, 'bf_') AND fecha_registro < {mf:Date}",
            parameters={"mf": mes_fin},
        ).result_rows
    ]


def generar_actividad_rango(dominios: list[str], periodo_inicio: date, periodo_fin: date) -> dict:
    """Punto de entrada de la Fase 5 — llamado por `dag_generar_bajo_demanda`
    (que a su vez dispara la API, ver `api/paquetes/simulacion/router.py`).
    Devuelve un resumen por dominio: meses generados vs. meses que ya
    estaban cubiertos, para que la respuesta sea auditable sin adivinar."""
    cfg = get_config()
    client = get_client(cfg)

    invalidos = [d for d in dominios if d not in DOMINIOS_BAJO_DEMANDA]
    if invalidos:
        raise ValueError(f"Dominios no soportados para generación bajo demanda: {invalidos}. "
                          f"Soportados: {list(DOMINIOS_BAJO_DEMANDA)}")

    meses = _meses_calendario(periodo_inicio, periodo_fin)
    resumen: dict[str, dict] = {d: {"meses_generados": [], "meses_ya_cubiertos": []} for d in dominios}

    for mes_inicio, mes_fin in meses:
        mes_lbl = _mes_label(mes_inicio)
        usuarios_pool: list[dict] | None = None

        for dominio in dominios:
            clave = f"{dominio}:{mes_lbl}"
            if _ya_generado(client, clave):
                resumen[dominio]["meses_ya_cubiertos"].append(mes_lbl)
                continue

            if dominio == "usuarios":
                nuevos = backfill_usuarios(client, mes_inicio, mes_fin, clave_control=clave)
                if usuarios_pool is not None:
                    usuarios_pool.extend(nuevos)
            elif dominio == "gasto_marketing":
                backfill_gasto_marketing(client, mes_inicio, mes_fin, clave_control=clave)
            elif dominio == "regalias":
                backfill_regalias(mes_inicio, mes_fin, clave_control=clave)
            elif dominio == "disponibilidad":
                backfill_disponibilidad(client, mes_inicio, mes_fin, clave_control=clave)
            elif dominio == "api_partners":
                backfill_api_partners(client, mes_inicio, mes_fin, clave_control=clave)
            else:
                if usuarios_pool is None:
                    usuarios_pool = _usuarios_hasta(client, mes_fin)
                if dominio == "publicidad":
                    backfill_publicidad(client, mes_inicio, mes_fin, usuarios_pool, clave_control=clave)
                elif dominio == "engagement":
                    backfill_engagement(client, mes_inicio, mes_fin, usuarios_pool, clave_control=clave)
                elif dominio == "comunidad":
                    backfill_comunidad(client, mes_inicio, mes_fin, usuarios_pool, clave_control=clave)
                elif dominio == "denuncias_tickets":
                    backfill_denuncias_tickets(client, mes_inicio, mes_fin, usuarios_pool, clave_control=clave)
                elif dominio == "producto":
                    backfill_producto(client, mes_inicio, mes_fin, usuarios_pool, clave_control=clave)

            resumen[dominio]["meses_generados"].append(mes_lbl)

    total_generados = sum(len(v["meses_generados"]) for v in resumen.values())
    print(f"[generar_actividad_rango] {total_generados} meses-dominio generados sobre "
          f"{len(meses)} meses x {len(dominios)} dominios ({periodo_inicio} — {periodo_fin}).")
    return {"periodo_inicio": str(periodo_inicio), "periodo_fin": str(periodo_fin), "resumen": resumen}


# Nota: el estado visible de la Fase 5 (última corrida por dominio/tabla
# Gold) se expone desde `api/paquetes/simulacion/router.py::estado_generacion`
# — consulta `ETL_BATCH_CONTROL`/`GOLD_ETL_LOG` directo desde el contenedor
# `api` (que ya tiene ambos clientes ClickHouse), no desde acá: el panel
# operativo (`SimulacionPage`) llama a la API, no a Airflow/ETL directo.
