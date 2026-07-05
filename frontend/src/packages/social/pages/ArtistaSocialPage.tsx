import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { catalogoApi } from '@packages/catalogo'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { socialApi } from '../api/social.api'
import type { Canal } from '../types'
import styles from './SocialPages.module.css'

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill={filled ? 'currentColor' : 'none'} aria-hidden="true">
      <path d="M7 12.2S1.5 8.7 1.5 5A2.8 2.8 0 0 1 7 3.6 2.8 2.8 0 0 1 12.5 5c0 3.7-5.5 7.2-5.5 7.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="11" cy="3" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="3" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.4 6.2l5.2-2.4M4.4 7.8l5.2 2.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

const CANALES: { canal: Canal; label: string }[] = [
  { canal: 'x', label: 'Compartir en X' },
  { canal: 'whatsapp', label: 'Compartir en WhatsApp' },
  { canal: 'copiar_enlace', label: 'Copiar enlace' },
]

export function ArtistaSocialPage() {
  useDocumentTitle('Artista')
  const { artistaId } = useParams<{ artistaId: string }>()
  const id = Number(artistaId)
  const queryClient = useQueryClient()
  const [shareOpen, setShareOpen] = useState(false)
  const [shareResult, setShareResult] = useState<string | null>(null)

  const artista = useQuery({
    queryKey: ['catalogo', 'artista', id],
    queryFn:  () => catalogoApi.artistDetail(id),
    enabled:  Number.isFinite(id),
  })

  const seguidos = useQuery({
    queryKey: ['social', 'seguimiento'],
    queryFn:  () => socialApi.misSeguidos(),
  })

  const siguiendo = (seguidos.data?.data ?? []).some((a) => a.artista_id === id)

  const seguir = useMutation({
    mutationFn: () => socialApi.seguirArtista(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['social', 'seguimiento'] }),
  })

  const dejarDeSeguir = useMutation({
    mutationFn: () => socialApi.dejarDeSeguir(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['social', 'seguimiento'] }),
  })

  const compartir = useMutation({
    mutationFn: (canal: Canal) =>
      socialApi.compartir({ tipo_interaccion_id: 'compartir_perfil_artista', canal, artista_id: id }),
    onSuccess: (res) => { setShareResult(res.contenido); setShareOpen(false) },
  })

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Artista</h1>

      {artista.isError && (
        <div className={styles.bannerError} role="alert">No se pudo cargar el artista (¿sesión activa?).</div>
      )}

      <div className={styles.subjectBar}>
        <div className={styles.subjectInfo}>
          {artista.isLoading ? (
            <span className={styles.skel} style={{ width: '50%', height: 18 }} />
          ) : (
            <span className={styles.subjectName}>{artista.data?.name ?? `Artista #${id}`}</span>
          )}
        </div>
        <div className={styles.subjectActions}>
          <button
            className={siguiendo ? styles.btnGhost : styles.btnPrimary}
            disabled={seguir.isPending || dejarDeSeguir.isPending}
            onClick={() => (siguiendo ? dejarDeSeguir.mutate() : seguir.mutate())}
          >
            <HeartIcon filled={siguiendo} />
            {siguiendo ? 'Siguiendo' : 'Seguir'}
          </button>
          <div className={styles.shareMenu}>
            <button className={styles.btnGhost} onClick={() => setShareOpen((v) => !v)}>
              <ShareIcon /> Compartir
            </button>
            {shareOpen && (
              <div className={styles.shareOptions}>
                {CANALES.map(({ canal, label }) => (
                  <button key={canal} className={styles.shareOption} onClick={() => compartir.mutate(canal)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {shareResult && <div className={styles.shareLinkBox}>{shareResult}</div>}

      {(seguir.isError || dejarDeSeguir.isError) && (
        <div className={styles.bannerError} role="alert">No se pudo actualizar el seguimiento. Intenta de nuevo.</div>
      )}
    </section>
  )
}
