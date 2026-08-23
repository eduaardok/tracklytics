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

    print("Siembra de cuentas demo completa.")


if __name__ == "__main__":
    main()
