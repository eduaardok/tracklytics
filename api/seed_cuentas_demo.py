"""
seed_cuentas_demo.py — S14-P4: siembra idempotente de las 7 cuentas de
demostración de `docs/CUENTAS_DEMO.md` contra la API real de `seguridad`,
para que un `docker compose up` en una máquina limpia deje el sistema listo
para correr `dag_backfill_negocio` (necesita `superadmin` para liquidar
regalías, ver `etl/gold/backfill_negocio.py`) y demostrar el gating por rol
sin ningún paso manual. Antes de S14-P4 estas cuentas solo existían si
alguien las creaba a mano por endpoint (S14-P3).

Idempotente: si una cuenta ya existe, no falla ni duplica (ni la cuenta, ni
la asignación de rol administrativo) — se puede correr en cada
`docker compose up` sin efecto acumulativo.

Bootstrap de `superadmin` — la única excepción real a "solo por los
endpoints de seguridad": `POST /auth/registro` bloquea a propósito
autoregistrarse con rol `admin` (`ROLES_AUTO_REGISTRABLES = ("user",
"analyst")`, CU-O01), y asignar un rol administrativo
(`POST /admin/usuarios/{id}/rol-admin`) requiere que quien llama YA sea
`superadmin` — un sistema recién levantado no tiene ninguno todavía, así que
ese círculo no se puede cerrar solo con esos dos endpoints. Se rompe una
única vez, para la cuenta `superadmin` exclusivamente, llamando a la misma
API pública de PocketBase que `api/paquetes/seguridad/pb_client.py::crear_usuario()`
ya usa internamente (`POST /api/collections/users/records`) con
`role=admin` — no es un INSERT a ClickHouse, es el mismo mecanismo de
creación de cuenta que usa el resto del sistema, con el mismo campo `role`
que `require_rol_admin` ya reconoce automáticamente como superadmin
("auto-backfill", ver `seguridad/deps.py`). Después de crearla así, se hace
login por el endpoint real (`/auth/login`), que auto-repara `DIM_USUARIO`
si hiciera falta. Las otras 6 cuentas pasan SIEMPRE por los dos endpoints
reales, usando el token de `superadmin`.
"""

import os
import sys
import time
from datetime import date, timedelta

import httpx
from dotenv import load_dotenv

load_dotenv()

API_ROOT      = os.getenv("REPORTES_API_ROOT", "http://api:8000")
API_URL       = f"{API_ROOT}/app/v1"
PB_URL        = os.getenv("POCKETBASE_URL", "http://pocketbase:8090")
PB_COLLECTION = "users"
DEMO_PASSWORD = os.getenv("SUPERADMIN_DEMO_PASSWORD", "Demo12345!")  # misma para las 7, ver docs/CUENTAS_DEMO.md
DEMO_PAIS     = "Ecuador"
DEMO_DOMAIN   = "demo.tracklytics.com"

# (slug_correo, rol de autoregistro, rol administrativo a asignar o None)
CUENTAS = [
    ("superadmin",      "user",    "superadmin"),
    ("admin_finanzas",  "user",    "admin_finanzas"),
    ("admin_contenido", "user",    "admin_contenido"),
    ("admin_comunidad", "user",    "admin_comunidad"),
    ("admin_datos",     "user",    "admin_datos"),
    ("admin_comercial", "user",    "admin_comercial"),
    ("analyst",         "analyst", None),
    # Cliente B2C simple, sin rol administrativo (igual que `analyst`, `rol_admin=None`
    # -> se omite la asignación) — para el acceso rápido de demo en LoginPage.tsx
    # (S16 prompt 09), que necesitaba una cuenta B2C estable además de las 6 admin/1 B2B.
    ("usuario",         "user",    None),
    # Artista y sello demo (S17, seguimiento de "que se vea el porcentaje"):
    # cuentas B2C simples también — lo que las distingue no es un rol
    # administrativo sino la vinculación de negocio que arman
    # `_sembrar_cuenta_artista_demo`/`_sembrar_cuenta_sello_demo` más abajo
    # (cuenta de artista aprobada + contrato de regalías / cuenta de sello
    # vinculada a un sello ya existente).
    ("artista_demo",    "user",    None),
    ("sello_demo",      "user",    None),
]

MAX_INTENTOS_API = 30
ESPERA_S = 5


def _esperar_api(client: httpx.Client) -> None:
    for intento in range(1, MAX_INTENTOS_API + 1):
        try:
            r = client.get(f"{API_ROOT}/docs")
            if r.status_code < 500:
                return
        except httpx.HTTPError:
            pass
        print(f"  api no responde todavía, intento {intento}/{MAX_INTENTOS_API}...")
        time.sleep(ESPERA_S)
    print("ERROR: la API nunca respondió, abortando siembra.")
    sys.exit(1)


def _crear_superadmin_bootstrap(client: httpx.Client, email: str) -> None:
    resp = client.post(
        f"{PB_URL}/api/collections/{PB_COLLECTION}/records",
        json={
            "email": email, "password": DEMO_PASSWORD, "passwordConfirm": DEMO_PASSWORD,
            "name": "Superadmin", "pais": DEMO_PAIS, "role": "admin",
        },
    )
    if resp.status_code == 400:
        print(f"  [bootstrap] {email} ya existía en PocketBase, se omite creación.")
        return
    resp.raise_for_status()
    print(f"  [bootstrap] {email} creado directo en PocketBase (role=admin).")


def _login(client: httpx.Client, email: str) -> dict:
    resp = client.post(f"{API_URL}/seguridad/auth/login", json={
        "email": email, "password": DEMO_PASSWORD, "dispositivo_id": "seed-cuentas-demo",
    })
    resp.raise_for_status()
    return resp.json()


def _registrar(client: httpx.Client, email: str, nombre: str, rol: str) -> str | None:
    resp = client.post(f"{API_URL}/seguridad/auth/registro", json={
        "email": email, "password": DEMO_PASSWORD, "nombre": nombre, "pais": DEMO_PAIS, "rol": rol,
    })
    if resp.status_code == 201:
        print(f"  [registro] {email} creado (rol={rol}).")
        return resp.json()["usuario_id"]
    if resp.status_code == 400:
        print(f"  [registro] {email} ya existía, se omite.")
        return None
    resp.raise_for_status()
    return None


def _tiene_rol_admin(client: httpx.Client, token: str, usuario_id: str, rol_admin: str) -> bool:
    resp = client.get(
        f"{API_URL}/seguridad/admin/usuarios/{usuario_id}", headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code != 200:
        return False
    roles = {r["rol_admin"] for r in resp.json().get("roles_admin", [])}
    return rol_admin in roles


def _asignar_rol_admin(client: httpx.Client, token: str, usuario_id: str, rol_admin: str) -> None:
    resp = client.post(
        f"{API_URL}/seguridad/admin/usuarios/{usuario_id}/rol-admin",
        json={"rol_admin": rol_admin}, headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code == 200:
        print(f"    [rol-admin] {rol_admin} asignado.")
    else:
        print(f"    [rol-admin] {rol_admin} -> HTTP {resp.status_code} {resp.text[:150]}")


def _activar_analyst_b2b(client: httpx.Client) -> None:
    """Deja `analyst@` en estado de cliente B2B demostrable (S17): sin esto la
    cuenta existía pero no podía entrar a `/analitica` — el gate exige email
    verificado (`require_email_verificado`) y una suscripción activa, así que
    cualquier demo con la cuenta analyst caía al onboarding de planes. Todo el
    flujo pasa por los endpoints reales del producto (verificación simulada por
    tokens, alta de método de pago y checkout), nada por atajos."""
    email = f"analyst@{DEMO_DOMAIN}"
    login = _login(client, email)
    token = login["token"]
    h = {"Authorization": f"Bearer {token}"}

    perfil = client.get(f"{API_URL}/seguridad/perfil", headers=h).json()
    if not perfil.get("email_verificado"):
        # La verificación es simulada (sin SMTP real): `reenviar-verificacion`
        # devuelve el token vigente en la propia respuesta, que luego consume
        # `verificar-email` — exactamente lo que hace el banner del frontend.
        tok = client.post(f"{API_URL}/seguridad/auth/reenviar-verificacion", json={"email": email}).json()
        resp = client.post(f"{API_URL}/seguridad/auth/verificar-email", json={"token": tok["token_verificacion"]})
        print(f"  [analyst] verificación de email -> HTTP {resp.status_code}")
    else:
        print("  [analyst] email ya verificado, se omite.")

    metodos = client.get(f"{API_URL}/facturacion/metodos-pago", headers=h).json().get("data", [])
    if not metodos:
        # Tarjeta de prueba (pasa Luhn como las que valida FormMetodoPago);
        # el backend solo persiste metadatos, nunca el número completo.
        resp = client.post(
            f"{API_URL}/facturacion/metodos-pago", headers=h,
            json={
                "tipo": "credito", "ultimos_4_digitos": "1111", "pais": DEMO_PAIS,
                "nombre_titular": "Analyst Demo", "direccion": "Av. Demo 123",
                "ciudad": "Quito", "codigo_postal": "170135",
            },
        )
        print(f"  [analyst] método de pago demo -> HTTP {resp.status_code}")
        metodos = [{"metodo_pago_id": resp.json()["metodo_pago_id"]}]
    else:
        print("  [analyst] método de pago ya existía, se omite.")

    activa = client.get(f"{API_URL}/suscripciones/activa", headers=h).json().get("data")
    if activa is None:
        resp = client.post(
            f"{API_URL}/suscripciones", headers=h,
            json={"plan_id": "basico", "metodo_pago_id": metodos[0]["metodo_pago_id"], "email_institucional": None},
        )
        print(f"  [analyst] suscripción al plan básico -> HTTP {resp.status_code}")
    else:
        print(f"  [analyst] ya tiene plan activo ({activa.get('tipo_plan')}), se omite.")


# Tracks reales del catálogo con portada y popularidad >=85 (elegidos una vez
# contra ClickHouse) — le dan contenido a la primera impresión B2C: sin esto,
# `usuario@demo` abre Mi Biblioteca en blanco (0 favoritos, 0 playlists) justo
# en la pantalla que la auditoría S16 marcó como la más visitada tras catálogo.
TRACKS_DEMO = [5384, 43465, 87810, 7448, 83057, 27249, 20895, 50587, 55453, 55779]


def _sembrar_biblioteca_usuario(client: httpx.Client) -> None:
    """Favoritos y playlists de muestra para `usuario@demo` — todo vía los
    endpoints reales de biblioteca (los mismos eventos que genera la UI:
    `favorito_add` entra a FACT_ENGAGEMENT_USUARIO, las playlists viven en
    PocketBase). Idempotente: si ya hay favoritos o playlists, no duplica."""
    login = _login(client, f"usuario@{DEMO_DOMAIN}")
    h = {"Authorization": f"Bearer {login['token']}"}

    favs = client.get(f"{API_URL}/biblioteca/favoritos", headers=h).json()
    existentes = favs.get("total", 0)
    if existentes == 0:
        for fact_id in TRACKS_DEMO[:8]:
            client.post(f"{API_URL}/biblioteca/favoritos/{fact_id}", headers=h)
        print(f"  [biblioteca] usuario@demo: 8 favoritos sembrados.")
    else:
        print(f"  [biblioteca] usuario@demo ya tenía {existentes} favoritos, se omite.")

    pls = client.get(f"{API_URL}/biblioteca/playlists", headers=h).json().get("data", [])
    if not pls:
        mix = client.post(
            f"{API_URL}/biblioteca/playlists", headers=h,
            json={"name": "Mix demo"},
        ).json()
        foco = client.post(
            f"{API_URL}/biblioteca/playlists", headers=h,
            json={"name": "Foco total"},
        ).json()
        # Una pública y una privada para que la demo muestre ambos estados
        # del toggle de visibilidad (el perfil público solo lista públicas).
        client.patch(f"{API_URL}/biblioteca/playlists/{foco['playlist_id']}/visibilidad",
                     headers=h, json={"es_publica": False})
        for fact_id in TRACKS_DEMO[:5]:
            client.post(f"{API_URL}/biblioteca/playlists/{mix['playlist_id']}/tracks", headers=h,
                        json={"fact_id": fact_id})
        for fact_id in TRACKS_DEMO[5:10]:
            client.post(f"{API_URL}/biblioteca/playlists/{foco['playlist_id']}/tracks", headers=h,
                        json={"fact_id": fact_id})
        print("  [biblioteca] usuario@demo: 2 playlists sembradas (Mix demo pública + Foco total privada).")
    else:
        print(f"  [biblioteca] usuario@demo ya tenía {len(pls)} playlists, se omite.")


def _sembrar_cuenta_artista_demo(client: httpx.Client, superadmin_token: str) -> None:
    """Cuenta de artista demo, YA aprobada y con un contrato de regalías real
    sobre un track del catálogo — para que "Mis ganancias" (con el % de
    contrato agregado en esta sesión) tenga algo que mostrar sin depender de
    que alguien la apruebe en vivo durante la demo. Todo vía endpoints reales
    (mismo criterio que el resto de este archivo): solicitud de cuenta,
    aprobación admin, contrato de regalías y unas reproducciones reales de
    hoy para que la liquidación del día tenga streams que repartir."""
    email = f"artista_demo@{DEMO_DOMAIN}"
    login = _login(client, email)
    h = {"Authorization": f"Bearer {login['token']}"}
    h_admin = {"Authorization": f"Bearer {superadmin_token}"}

    cuenta_resp = client.get(f"{API_URL}/creadores/cuenta", headers=h)
    if cuenta_resp.status_code == 200:
        print(f"  [artista_demo] cuenta ya existe (estado={cuenta_resp.json()['estado_cuenta']}), se omite.")
        return

    artistas = client.get(f"{API_URL}/artists/top?limit=10", headers=h).json()["data"]
    if not artistas:
        print("  [artista_demo] no hay artistas en el catálogo todavía, se omite (¿corriste el ETL?).")
        return
    # El 5to más popular, no el #1 — reduce (sin eliminar del todo) la chance
    # de reusar el mismo track que uno de los 11 contratos de artista que
    # `expandir_contratos_regalias.py` ya arma sobre "tracks reales con más
    # reproducciones".
    artista = artistas[4] if len(artistas) > 4 else artistas[0]

    resp = client.post(f"{API_URL}/creadores/cuenta", headers=h, json={"nombre_artistico": artista["name"]})
    resp.raise_for_status()
    cuenta_artista_id = resp.json()["cuenta_artista_id"]
    print(f"  [artista_demo] cuenta solicitada como '{artista['name']}'.")

    resp = client.post(
        f"{API_URL}/creadores/admin/cuentas/{cuenta_artista_id}/resolver",
        headers=h_admin, json={"decision": "aprobar"},
    )
    print(f"  [artista_demo] aprobación -> HTTP {resp.status_code}")

    tracks = client.get(f"{API_URL}/tracks/by-artist/{artista['artist_id']}?limit=1", headers=h).json()["data"]
    if not tracks:
        print(f"  [artista_demo] '{artista['name']}' no tiene tracks propios, se omite el contrato.")
        return
    fact_id_track = tracks[0]["fact_id"]
    hoy = date.today()

    resp = client.post(
        f"{API_URL}/regalias/admin/contratos", headers=h_admin,
        json={
            "fact_id_track": fact_id_track, "cuenta_artista_id": cuenta_artista_id,
            "pct_master_artista": 100, "pct_publishing_artista": 100,
            "vigente_desde": hoy.isoformat(),
        },
    )
    print(f"  [artista_demo] contrato de regalías sobre fact_id={fact_id_track} -> HTTP {resp.status_code}")

    # 5 reproducciones reales de hoy (mismo endpoint que usa el reproductor,
    # POST /biblioteca/historial) — sin esto streams_periodo sería 0 y la
    # liquidación de abajo no generaría ninguna fila que mostrar.
    for _ in range(5):
        client.post(f"{API_URL}/biblioteca/historial/{fact_id_track}", headers=h)

    resp = client.post(
        f"{API_URL}/regalias/admin/liquidar", headers=h_admin,
        json={"periodo_inicio": hoy.isoformat(), "periodo_fin": (hoy + timedelta(days=1)).isoformat()},
    )
    print(f"  [artista_demo] liquidación del día -> HTTP {resp.status_code} {resp.text[:200]}")


def _sembrar_cuenta_sello_demo(client: httpx.Client, superadmin_token: str) -> None:
    """Cuenta de sello demo — a diferencia del artista, acá no hace falta
    crear ningún contrato nuevo: `expandir_contratos_regalias.py` (S14-P4) ya
    generó un contrato de sello por cada fila de `DIM_SELLO_DISCOGRAFICO`
    sobre tracks reales, con liquidaciones históricas de los últimos 24 meses
    (`backfill_negocio.py`). Vincular la cuenta a un sello ya existente basta
    para que "Mis ganancias" (vista sello) tenga datos reales de entrada."""
    email = f"sello_demo@{DEMO_DOMAIN}"
    login = _login(client, email)
    h = {"Authorization": f"Bearer {login['token']}"}
    h_admin = {"Authorization": f"Bearer {superadmin_token}"}

    ya = client.get(f"{API_URL}/regalias/sello/mi-cuenta", headers=h)
    if ya.status_code == 200:
        print("  [sello_demo] cuenta ya vinculada, se omite.")
        return

    sellos = client.get(f"{API_URL}/distribucion/sellos", headers=h_admin).json().get("data", [])
    if not sellos:
        print("  [sello_demo] no hay sellos en el catálogo todavía, se omite.")
        return

    # `sellos[0]` (bug real, encontrado en verificación visual S17): el
    # listado de `/distribucion/sellos` viene ordenado por nombre, no por
    # quién tiene datos reales — el primero alfabéticamente resultó ser un
    # sello vacío creado por un script de QA/auditoría (0 contratos, 0
    # liquidaciones), dejando "Mis ganancias" (vista sello) en blanco pese a
    # que el docstring de esta función asume que TODO sello tiene historial.
    # Se cuenta cuántos contratos tiene cada sello (`/regalias/admin/
    # contratos`, ya trae `sello_id` por fila) y se elige el que más tiene —
    # proxy directo de "tiene liquidaciones reales", sin adivinar por nombre.
    contratos = client.get(f"{API_URL}/regalias/admin/contratos", headers=h_admin).json().get("data", [])
    conteo_por_sello: dict[int, int] = {}
    for c in contratos:
        sid = c.get("sello_id")
        if sid is not None:
            conteo_por_sello[sid] = conteo_por_sello.get(sid, 0) + 1

    sello_id_elegido = max(conteo_por_sello, key=conteo_por_sello.get) if conteo_por_sello else sellos[0]["sello_id"]
    sello = next((s for s in sellos if s["sello_id"] == sello_id_elegido), sellos[0])

    resp = client.post(
        f"{API_URL}/regalias/admin/cuentas-sello", headers=h_admin,
        json={"usuario_id": login["record"]["id"], "sello_id": sello["sello_id"]},
    )
    print(f"  [sello_demo] vinculado a sello '{sello.get('nombre', sello['sello_id'])}' -> HTTP {resp.status_code}")


def main() -> None:
    with httpx.Client(timeout=15) as client:
        print("Esperando a que la API esté saludable...")
        _esperar_api(client)

        superadmin_email = f"superadmin@{DEMO_DOMAIN}"
        _crear_superadmin_bootstrap(client, superadmin_email)
        superadmin_login = _login(client, superadmin_email)
        superadmin_id = superadmin_login["record"]["id"]
        superadmin_token = superadmin_login["token"]
        print(f"  [bootstrap] {superadmin_email} operativo (superadmin vía PocketBase role=admin, auto-backfill).")

        for rol_slug, rol_registro, rol_admin in CUENTAS[1:]:
            email = f"{rol_slug}@{DEMO_DOMAIN}"
            usuario_id = _registrar(client, email, rol_slug.replace("_", " ").title(), rol_registro)
            if usuario_id is None:
                usuario_id = _login(client, email)["record"]["id"]
            if not rol_admin:
                continue
            if _tiene_rol_admin(client, superadmin_token, usuario_id, rol_admin):
                print(f"  [rol-admin] {email} ya tenía {rol_admin}, se omite.")
            else:
                _asignar_rol_admin(client, superadmin_token, usuario_id, rol_admin)

        _activar_analyst_b2b(client)
        _sembrar_biblioteca_usuario(client)
        # Van después de `_activar_analyst_b2b`: esa función deja al menos una
        # transacción de suscripción fechada "hoy" (FACT_TRANSACCION_PAGO), que
        # es lo que le da pool > 0 a la liquidación del día que arma
        # `_sembrar_cuenta_artista_demo` más abajo.
        _sembrar_cuenta_artista_demo(client, superadmin_token)
        _sembrar_cuenta_sello_demo(client, superadmin_token)

    print("Siembra de cuentas demo completa.")


if __name__ == "__main__":
    main()
