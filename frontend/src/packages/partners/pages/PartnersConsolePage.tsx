import { useState } from 'react'
import { ENDPOINTS, partnersApi } from '../api/partners.api'
import type { PartnerEndpoint, PartnerProbeResult } from '../types'
import styles from './PartnersConsolePage.module.css'

// Réplica funcional mínima de app/partners/console.html — herramienta interna
// de verificación/demo (openspec/specs/partners/spec.md, "Herramientas de
// verificación y demo"), no UI de producto. No se replicó landing.html: es la
// demo pública dirigida a partners externos (sin sesión, copy comercial), no
// una pantalla interna de Tracklytics — confirmado contra el spec, que la
// documenta como un artefacto propio y separado de la consola.
function StatusBadge({ status, ok }: { status: number; ok: boolean }) {
  const cls = status === 0 ? styles.badgeError : ok ? styles.badgeOk : status === 403 ? styles.badgeWarn : styles.badgeError
  return <span className={`${styles.badge} ${cls}`}>{status === 0 ? 'sin respuesta' : status}</span>
}

export function PartnersConsolePage() {
  const [apiKey, setApiKey] = useState('')
  const [page, setPage]     = useState('1')
  const [limit, setLimit]   = useState('20')
  const [id, setId]         = useState('1')
  const [results, setResults] = useState<Record<string, PartnerProbeResult>>({})
  const [pending, setPending] = useState<string | null>(null)

  async function probe(ep: PartnerEndpoint) {
    if (!apiKey.trim()) return
    setPending(ep.id)
    const result = await partnersApi.probe(apiKey.trim(), ep.buildPath({ page, limit, id }))
    setResults((prev) => ({ ...prev, [ep.id]: result }))
    setPending(null)
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Consola de partners</h1>
      <span className={styles.subtitle}>
        // prueba /partners/v1/* con una API key real — igual que un partner externo, sin sesión de staff
      </span>

      <div className={styles.panel}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="api-key">API key</label>
          <input
            id="api-key"
            className={styles.input}
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Pega la API key del partner…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={styles.paramsRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="param-page">page</label>
            <input id="param-page" className={styles.inputSm} type="number" min={1} value={page} onChange={(e) => setPage(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="param-limit">limit</label>
            <input id="param-limit" className={styles.inputSm} type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="param-id">id (detalle)</label>
            <input id="param-id" className={styles.inputSm} type="number" min={1} value={id} onChange={(e) => setId(e.target.value)} />
          </div>
        </div>
        {!apiKey.trim() && <p className={styles.hint}>Ingresa una API key para habilitar las pruebas.</p>}
      </div>

      <div className={styles.endpointGrid}>
        {ENDPOINTS.map((ep) => {
          const result = results[ep.id]
          return (
            <div key={ep.id} className={styles.endpointCard}>
              <div className={styles.endpointHead}>
                <div>
                  <div className={styles.endpointLabel}>{ep.label}</div>
                  <div className={styles.endpointMeta}>
                    <span className={styles.method}>{ep.method}</span>
                    <span className={styles.tierTag}>tier mínimo: {ep.minTier}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!apiKey.trim() || pending === ep.id}
                  onClick={() => probe(ep)}
                >
                  {pending === ep.id ? 'Probando…' : 'Probar'}
                </button>
              </div>

              {result && (
                <div className={styles.resultBox}>
                  <div className={styles.resultMeta}>
                    <StatusBadge status={result.status} ok={result.ok} />
                    <span className={styles.respMs}>{result.ms} ms</span>
                  </div>
                  <pre className={styles.resultBody}>{JSON.stringify(result.body, null, 2)}</pre>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
