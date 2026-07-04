import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { catalogoApi } from '@packages/catalogo'
import { socialApi } from '../api/social.api'
import type { Canal, Comentario } from '../types'
import styles from './SocialPages.module.css'

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

function BubbleIcon() {
  return (
    <svg className={styles.icon} width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h13A2.5 2.5 0 0 1 22 6.5v8A2.5 2.5 0 0 1 19.5 17H10l-4.5 4v-4h-1A2.5 2.5 0 0 1 2 14.5v-8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

const CANALES: { canal: Canal; label: string }[] = [
  { canal: 'x', label: 'Compartir en X' },
  { canal: 'whatsapp', label: 'Compartir en WhatsApp' },
  { canal: 'copiar_enlace', label: 'Copiar enlace' },
]

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function TrackSocialPage() {
  const { factId } = useParams<{ factId: string }>()
  const id = Number(factId)
  const queryClient = useQueryClient()

  const [contenido, setContenido] = useState('')
  const [replyingTo, setReplyingTo] = useState<number | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareResult, setShareResult] = useState<string | null>(null)

  const track = useQuery({
    queryKey: ['catalogo', 'track', id],
    queryFn:  () => catalogoApi.trackDetailByFact(id),
    enabled:  Number.isFinite(id),
  })

  const comentarios = useQuery({
    queryKey: ['social', 'comentarios', id],
    queryFn:  () => socialApi.comentariosDeTrack(id),
    enabled:  Number.isFinite(id),
  })

  const comentar = useMutation({
    mutationFn: () => socialApi.comentar({ fact_id_track: id, contenido, comentario_padre_id: replyingTo }),
    onSuccess: () => {
      setContenido(''); setReplyingTo(null)
      queryClient.invalidateQueries({ queryKey: ['social', 'comentarios', id] })
    },
  })

  const compartir = useMutation({
    mutationFn: (canal: Canal) =>
      socialApi.compartir({ tipo_interaccion_id: 'compartir_track', canal, fact_id_track: id }),
    onSuccess: (res) => { setShareResult(res.contenido); setShareOpen(false) },
  })

  const data: Comentario[] = comentarios.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Track</h1>
      <span className={styles.subtitle}>// vista mínima de social — el detalle de track completo lo construye `experiencia`</span>

      {track.isError && (
        <div className={styles.bannerError} role="alert">No se pudo cargar el track.</div>
      )}

      <div className={styles.subjectBar}>
        <div className={styles.subjectInfo}>
          {track.isLoading ? (
            <span className={styles.skel} style={{ width: '50%', height: 18 }} />
          ) : (
            <>
              <span className={styles.subjectName}>{track.data?.track_name ?? `Track #${id}`}</span>
              {track.data?.artist_name && <div className={styles.subjectMeta}>{track.data.artist_name}</div>}
            </>
          )}
        </div>
        <div className={styles.subjectActions}>
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

      <p className={styles.sectionLabel}>Comentarios</p>

      <form className={styles.commentForm} onSubmit={(e) => { e.preventDefault(); comentar.mutate() }}>
        {replyingTo != null && (
          <div className={styles.replyingTo}>
            Respondiendo a comentario #{replyingTo}{' '}
            <button type="button" className={styles.linkBtn} onClick={() => setReplyingTo(null)}>cancelar</button>
          </div>
        )}
        <textarea
          className={styles.textarea}
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder={replyingTo != null ? 'Escribe tu respuesta…' : 'Escribe un comentario…'}
          required
        />
        <div className={styles.commentFormActions}>
          <span />
          <button className={styles.btnPrimary} type="submit" disabled={comentar.isPending || !contenido.trim()}>
            {comentar.isPending ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </form>
      {comentar.isError && (
        <div className={styles.bannerError} role="alert">No se pudo publicar el comentario. Intenta de nuevo.</div>
      )}

      {comentarios.isLoading ? (
        <ul className={styles.commentList}>
          <li className={styles.commentRow}><span className={styles.skel} style={{ width: '40%', height: 12, marginBottom: 8 }} /><span className={styles.skel} style={{ width: '80%', height: 14 }} /></li>
        </ul>
      ) : data.length === 0 ? (
        <div className={styles.emptyState}>
          <BubbleIcon />
          <span className={styles.emptyTitle}>Sin comentarios todavía</span>
          <span className={styles.emptyBody}>Sé el primero en comentar este track.</span>
        </div>
      ) : (
        <ul className={styles.commentList}>
          {data.map((c) => {
            const oculto = c.estado_moderacion === 'oculto'
            return (
              <li
                key={c.fact_id}
                className={c.comentario_padre_id != null ? `${styles.commentRow} ${styles['commentRow--reply']}` : styles.commentRow}
              >
                <div className={styles.commentHeader}>
                  <span className={styles.commentAuthor}>Usuario {c.usuario_id.slice(0, 6)}</span>
                  <span className={styles.commentDate}>{fmtDate(c.fecha_creacion)}</span>
                </div>
                <p className={oculto ? `${styles.commentBody} ${styles['commentBody--hidden']}` : styles.commentBody}>
                  {oculto ? 'Comentario oculto por moderación.' : c.contenido}
                </p>
                <div className={styles.commentFooter}>
                  <button className={styles.linkBtn} onClick={() => setReplyingTo(c.fact_id)}>Responder</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
