import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { catalogoApi } from '@packages/catalogo'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { socialApi } from '../api/social.api'
import { DenunciarButton } from '../components/DenunciarButton'
import { BloquearButton } from '../components/BloquearButton'
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
  useDocumentTitle('Track')
  const { factId } = useParams<{ factId: string }>()
  const id = Number(factId)
  const queryClient = useQueryClient()
  const toast = useToast()

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
      toast.success('Comentario publicado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo publicar el comentario.')),
  })

  const compartir = useMutation({
    mutationFn: (canal: Canal) =>
      socialApi.compartir({ tipo_interaccion_id: 'compartir_track', canal, fact_id_track: id }),
    onSuccess: (res) => {
      setShareResult(res.contenido); setShareOpen(false)
      toast.success('Enlace generado para compartir')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo generar el enlace para compartir.')),
  })

  const data: Comentario[] = comentarios.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Track</h1>

      {track.isError && (
        <div className={styles.bannerError} role="alert">No se pudo cargar el track.</div>
      )}

      <div className={styles.subjectBar}>
        <div className={styles.subjectInfo}>
          {track.isLoading ? (
            <span className={styles.skel} style={{ width: '50%', height: 18 }} />
          ) : (
            <>
              {/* F1 (recíproco): el hilo era un callejón sin salida — track y
                  artista eran texto plano. Ahora vuelven al catálogo. */}
              <Link to={`/catalogo/track/${id}`} className={`${styles.subjectName} ${styles.subjectLink}`}>
                {track.data?.track_name ?? `Track #${id}`}
              </Link>
              {track.data?.artist_name && (
                <div className={styles.subjectMeta}>
                  <Link to={`/catalogo/artista/${track.data.artist_id}`} className={styles.subjectLink}>
                    {track.data.artist_name}
                  </Link>
                </div>
              )}
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
          <DenunciarButton tipoObjeto="track" objetoId={String(id)} label="Denunciar track" className={styles.btnGhost} />
        </div>
      </div>

      {shareResult && <div className={styles.shareLinkBox}>{shareResult}</div>}

      <p className={styles.sectionLabel}>Comentarios</p>

      <form
        className={styles.commentForm}
        onSubmit={(e) => {
          e.preventDefault()
          if (!contenido.trim()) return
          comentar.mutate()
        }}
        noValidate
      >
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
          maxLength={2000}
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
                  <Link to={`/usuarios/${c.usuario_id}`} className={styles.commentAuthor}>
                    {c.usuario_nombre || `Usuario ${c.usuario_id.slice(0, 6)}`}
                  </Link>
                  <span className={styles.commentDate}>{fmtDate(c.fecha_creacion)}</span>
                </div>
                <p className={oculto ? `${styles.commentBody} ${styles['commentBody--hidden']}` : styles.commentBody}>
                  {oculto ? 'Comentario oculto por moderación.' : c.contenido}
                </p>
                <div className={styles.commentFooter}>
                  <button className={styles.linkBtn} onClick={() => setReplyingTo(c.fact_id)}>Responder</button>
                  {!oculto && <DenunciarButton tipoObjeto="comentario" objetoId={String(c.fact_id)} className={styles.linkBtn} />}
                  {!oculto && <BloquearButton usuarioId={c.usuario_id} className={styles.linkBtn} />}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
