import styles from './AirflowLinkButton.module.css'

// URL PÚBLICA de Airflow (accesible desde el navegador del usuario) — no
// confundir con `AIRFLOW_URL` del backend (`api/core/config.py`,
// `http://airflow:8080`), que solo resuelve dentro de la red Docker entre
// contenedores. Default a localhost, mismo puerto que expone
// `docker-compose.yml` (servicio `airflow`, `ports: ["8080:8080"]`);
// override vía `VITE_AIRFLOW_PUBLIC_URL` si el docente no accede desde
// localhost.
const AIRFLOW_PUBLIC_URL = import.meta.env.VITE_AIRFLOW_PUBLIC_URL ?? 'http://localhost:8080'

interface AirflowLinkButtonProps {
  dagId: string
  label?: string
  className: string
}

// Login de Airflow es independiente del de Tracklytics (usuario/password
// propios) — el botón solo abre la vista grid del DAG en pestaña nueva, sin
// intentar single sign-on; el usuario ve el login nativo de Airflow la
// primera vez. Credenciales documentadas en README.md, nunca en frontend.
export function AirflowLinkButton({ dagId, label = 'Ver en Airflow', className }: AirflowLinkButtonProps) {
  function handleClick() {
    window.open(`${AIRFLOW_PUBLIC_URL}/dags/${dagId}/grid`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={className} onClick={handleClick}>
        {label}
      </button>
      <span className={styles.hint}>Credenciales de Airflow: ver README</span>
    </div>
  )
}
