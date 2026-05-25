    """
    TRACKLYTICS v2 — Cargador inicial de datos en PocketBase
    =========================================================
    Carga el spotify.csv en la colección spotify_tracks de PocketBase.
    Este script se ejecuta UNA SOLA VEZ para poblar la fuente de datos.

    Uso:
        python load_pocketbase.py

    Requiere:
        pip install pandas httpx python-dotenv
    """

    import os
    import sys
    import time
    import pandas as pd
    import httpx
    from dotenv import load_dotenv

    load_dotenv()

    # ── Configuración ──────────────────────────────────────────────
    PB_URL        = os.getenv("POCKETBASE_URL", "http://localhost:8090")
    PB_EMAIL      = os.getenv("POCKETBASE_EMAIL", "admin@tracklytics.com")
    PB_PASSWORD   = os.getenv("POCKETBASE_PASSWORD", "cambia_esto_en_produccion")
    COLLECTION    = os.getenv("POCKETBASE_COLLECTION", "spotify_tracks")
    CSV_PATH      = os.getenv("CSV_PATH", "dataset/spotify.csv")
    BATCH_SIZE    = 100   # PocketBase recomienda lotes pequeños via API REST


    def authenticate(client: httpx.Client) -> str:
        """Obtiene el token de admin de PocketBase."""
        print("🔐 Autenticando en PocketBase...")
        resp = client.post(
            f"{PB_URL}/api/collections/_superusers/auth-with-password",
            json={"identity": PB_EMAIL, "password": PB_PASSWORD},
            timeout=15,
        )
        if resp.status_code != 200:
            print(f"❌ Error de autenticación: {resp.status_code} — {resp.text}")
            sys.exit(1)
        token = resp.json()["token"]
        print("✅ Autenticación exitosa.")
        return token


    def count_existing(client: httpx.Client, token: str) -> int:
        """Verifica cuántos registros ya existen en la colección."""
        resp = client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"page": 1, "perPage": 1},
            headers={"Authorization": token},
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json().get("totalItems", 0)
        return 0


    def clean_row(row: dict) -> dict:
        """Limpia y valida una fila antes de enviarla a PocketBase."""
        return {
            "track_id":        str(row.get("track_id", ""))[:255],
            "artists":         str(row.get("artists", ""))[:500],
            "album_name":      str(row.get("album_name", ""))[:255],
            "track_name":      str(row.get("track_name", ""))[:255],
            "popularity":      int(row.get("popularity", 0)),
            "duration_ms":     int(row.get("duration_ms", 0)),
            "explicit":        bool(row.get("explicit", False)),
            "danceability":    float(row.get("danceability", 0.0)),
            "energy":          float(row.get("energy", 0.0)),
            "key":             int(row.get("key", 0)),
            "loudness":        float(row.get("loudness", 0.0)),
            "mode":            int(row.get("mode", 0)),
            "speechiness":     float(row.get("speechiness", 0.0)),
            "acousticness":    float(row.get("acousticness", 0.0)),
            "instrumentalness":float(row.get("instrumentalness", 0.0)),
            "liveness":        float(row.get("liveness", 0.0)),
            "valence":         float(row.get("valence", 0.0)),
            "tempo":           float(row.get("tempo", 0.0)),
            "time_signature":  int(row.get("time_signature", 4)),
            "track_genre":     str(row.get("track_genre", ""))[:100],
        }


    def load_batch(client: httpx.Client, token: str, batch: list[dict]) -> tuple[int, int]:
        """Envía un lote de registros a PocketBase. Retorna (ok, errores)."""
        ok = 0
        errors = 0
        headers = {"Authorization": token, "Content-Type": "application/json"}

        for record in batch:
            try:
                resp = client.post(
                    f"{PB_URL}/api/collections/{COLLECTION}/records",
                    json=record,
                    headers=headers,
                    timeout=10,
                )
                if resp.status_code in (200, 201):
                    ok += 1
                else:
                    errors += 1
                    if errors <= 3:  # Solo muestra los primeros errores
                        print(f"  ⚠️  Error {resp.status_code}: {resp.text[:120]}")
            except httpx.TimeoutException:
                errors += 1
                print("  ⚠️  Timeout en un registro, continuando...")

        return ok, errors


    def main():
        # ── Cargar CSV ─────────────────────────────────────────────
        if not os.path.exists(CSV_PATH):
            print(f"❌ No se encontró el CSV en: {CSV_PATH}")
            print("   Ajusta CSV_PATH en el .env o pasa la ruta como argumento.")
            sys.exit(1)

        print(f"📂 Cargando CSV desde: {CSV_PATH}")
        df = pd.read_csv(CSV_PATH)

        # Eliminar la columna sin nombre que a veces viene en este dataset
        if "Unnamed: 0" in df.columns:
            df = df.drop(columns=["Unnamed: 0"])

        # Eliminar duplicados exactos
        df = df.drop_duplicates()
        total = len(df)
        print(f"📊 Registros en CSV: {total:,}")

        # ── Conectar a PocketBase ──────────────────────────────────
        with httpx.Client() as client:

            # Verificar que PocketBase está activo
            try:
                health = client.get(f"{PB_URL}/api/health", timeout=5)
                if health.status_code != 200:
                    raise Exception("PocketBase no responde")
            except Exception as e:
                print(f"❌ PocketBase no está disponible en {PB_URL}")
                print(f"   Asegúrate de ejecutar: docker compose up pocketbase")
                print(f"   Error: {e}")
                sys.exit(1)

            token = authenticate(client)

            # Verificar si ya hay datos
            existing = count_existing(client, token)
            if existing > 0:
                print(f"\n⚠️  La colección ya tiene {existing:,} registros.")
                confirm = input("¿Deseas continuar y agregar más? (s/N): ").strip().lower()
                if confirm != "s":
                    print("Operación cancelada.")
                    sys.exit(0)

            # ── Carga por lotes ────────────────────────────────────
            print(f"\n🚀 Iniciando carga de {total:,} registros en lotes de {BATCH_SIZE}...")
            start_time = time.time()

            total_ok     = 0
            total_errors = 0
            batch        = []

            for i, (_, row) in enumerate(df.iterrows()):
                batch.append(clean_row(row.to_dict()))

                if len(batch) == BATCH_SIZE:
                    ok, err = load_batch(client, token, batch)
                    total_ok     += ok
                    total_errors += err
                    batch         = []

                    # Progreso cada 1000 registros
                    if (i + 1) % 1000 == 0:
                        elapsed = time.time() - start_time
                        rate    = total_ok / elapsed if elapsed > 0 else 0
                        pct     = (i + 1) / total * 100
                        eta     = (total - i - 1) / rate if rate > 0 else 0
                        print(
                            f"  [{pct:5.1f}%] {total_ok:,} insertados | "
                            f"{total_errors} errores | "
                            f"{rate:.0f} reg/s | "
                            f"ETA {eta/60:.1f} min"
                        )

            # Último lote
            if batch:
                ok, err = load_batch(client, token, batch)
                total_ok     += ok
                total_errors += err

            # ── Resumen ────────────────────────────────────────────
            elapsed = time.time() - start_time
            print("\n" + "═" * 50)
            print("✅ CARGA COMPLETADA")
            print(f"   Registros insertados : {total_ok:,}")
            print(f"   Registros con error  : {total_errors:,}")
            print(f"   Tiempo total         : {elapsed/60:.1f} min")
            print(f"   Velocidad promedio   : {total_ok/elapsed:.0f} reg/s")
            print("═" * 50)

            if total_errors > total * 0.05:
                print("\n⚠️  Más del 5% de errores. Revisa la estructura de la colección.")
                print("   Asegúrate de que los campos coincidan con el esquema del CSV.")


    if __name__ == "__main__":
        main()