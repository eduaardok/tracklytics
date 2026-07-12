import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { distribucionApi } from '../api/distribucion.api'
import styles from '../pages/DistribucionPages.module.css'

export function SellosTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [nombre, setNombre] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [asignarArtistId, setAsignarArtistId] = useState('')
  const [asignarAlbumId, setAsignarAlbumId] = useState('')
  const [asignarSelloId, setAsignarSelloId] = useState('')
  const [asignarMsg, setAsignarMsg] = useState<string | null>(null)

  const sellos = useQuery({
    queryKey: ['distribucion', 'sellos'],
    queryFn:  () => distribucionApi.sellos(),
  })

  const crear = useMutation({
    mutationFn: () => distribucionApi.crearSello({ nombre }),
    onSuccess: () => {
      setNombre('')
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'sellos'] })
      toast.success('Sello creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el sello.')),
  })

  const editar = useMutation({
    mutationFn: ({ id, nombre: n }: { id: number; nombre: string }) => distribucionApi.editarSello(id, { nombre: n }),
    onSuccess: () => {
      setEditId(null)
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'sellos'] })
      toast.success('Sello actualizado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar el sello.')),
  })

  const asignar = useMutation({
    mutationFn: async () => {
      const selloId = Number(asignarSelloId)
      if (asignarArtistId.trim()) await distribucionApi.asignarSelloArtista(Number(asignarArtistId), { sello_id: selloId })
      if (asignarAlbumId.trim()) await distribucionApi.asignarSelloAlbum(Number(asignarAlbumId), { sello_id: selloId })
    },
    onSuccess: () => {
      setAsignarMsg('Sello asignado correctamente.')
      toast.success('Sello asignado')
    },
    onError: (err) => {
      setAsignarMsg('No se pudo asignar el sello (¿id existente?).')
      toast.error(apiErrorMessage(err, 'No se pudo asignar el sello.'))
    },
  })

  const data = sellos.data?.data ?? []

  return (
    <div>
      <p className={styles.sectionLabel}>Nuevo sello</p>
      <form
        className={styles.form}
        onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) crear.mutate() }}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sello-nombre">Nombre</label>
          <input
            id="sello-nombre"
            className={styles.input}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Universal Music Group"
          />
        </div>
        <button className={styles.btnPrimary} type="submit" disabled={crear.isPending || !nombre.trim()}>
          {crear.isPending ? 'Creando…' : 'Crear sello'}
        </button>
      </form>

      <p className={styles.sectionLabel}>Sellos existentes ({data.length})</p>
      <div className={styles.tablePanel}>
        {sellos.isError ? (
          <ErrorState message="No se pudieron cargar los sellos (¿sesión de admin?)." />
        ) : sellos.isLoading ? (
          <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
        ) : data.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin sellos registrados</span>
            <span className={styles.emptyBody}>Crea el primero con el formulario de arriba.</span>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>ID</th><th>Nombre</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.sello_id}>
                  <td>{s.sello_id}</td>
                  <td>
                    {editId === s.sello_id ? (
                      <input
                        className={styles.input}
                        defaultValue={s.nombre}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') editar.mutate({ id: s.sello_id, nombre: (e.target as HTMLInputElement).value })
                          if (e.key === 'Escape') setEditId(null)
                        }}
                        onBlur={(e) => editar.mutate({ id: s.sello_id, nombre: e.target.value })}
                      />
                    ) : s.nombre}
                  </td>
                  <td className={styles.tableActions}>
                    <button className={styles.btnGhost} onClick={() => setEditId(s.sello_id)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className={styles.sectionLabel}>Asignar sello a artista o álbum</p>
      <form
        className={styles.form}
        onSubmit={(e) => { e.preventDefault(); setAsignarMsg(null); asignar.mutate() }}
        noValidate
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="asignar-sello">Sello</label>
          <select id="asignar-sello" className={styles.select} value={asignarSelloId} onChange={(e) => setAsignarSelloId(e.target.value)}>
            <option value="">Selecciona…</option>
            {data.map((s) => <option key={s.sello_id} value={s.sello_id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="asignar-artist">artist_id (opcional)</label>
          <input id="asignar-artist" className={styles.input} type="number" min={1} value={asignarArtistId} onChange={(e) => setAsignarArtistId(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="asignar-album">album_id (opcional)</label>
          <input id="asignar-album" className={styles.input} type="number" min={1} value={asignarAlbumId} onChange={(e) => setAsignarAlbumId(e.target.value)} />
        </div>
        <button
          className={styles.btnPrimary}
          type="submit"
          disabled={asignar.isPending || !asignarSelloId || (!asignarArtistId.trim() && !asignarAlbumId.trim())}
        >
          {asignar.isPending ? 'Asignando…' : 'Asignar'}
        </button>
      </form>
      {asignarMsg && <div className={asignar.isError ? styles.bannerError : styles.bannerOk} role="status">{asignarMsg}</div>}
    </div>
  )
}
