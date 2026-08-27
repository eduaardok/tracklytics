import styles from './UserAvatar.module.css'

// Avatar de iniciales con color determinístico por usuario (S17, TASK 5) —
// no hay foto de perfil real en el modelo de usuario (`seguridad`/`social`
// solo exponen nombre + id), así que se sigue el mismo patrón de iniciales
// que ya usa `seguridad/pages/ProfilePage.tsx` (avatar del hero propio), pero
// con un color por usuario en vez del gradiente fijo — necesario acá porque
// un hilo de comentarios muestra a VARIOS usuarios a la vez y todos con el
// mismo color se verían idénticos. El color se deriva de `usuarioId` con un
// hash simple (no random en cada render): el mismo usuario siempre cae en el
// mismo tono, en cualquier comentario o carga de la página.
function inicialesDe(nombre: string | null | undefined, usuarioId: string): string {
  const limpio = (nombre ?? '').trim()
  if (!limpio) return usuarioId.slice(0, 2).toUpperCase()
  const partes = limpio.split(/\s+/).filter(Boolean)
  return partes.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}

function hueDe(usuarioId: string): number {
  let hash = 0
  for (let i = 0; i < usuarioId.length; i++) {
    hash = (hash * 31 + usuarioId.charCodeAt(i)) >>> 0
  }
  return hash % 360
}

export function UserAvatar({
  usuarioId, nombre, size = 32,
}: { usuarioId: string; nombre?: string | null; size?: number }) {
  const hue = hueDe(usuarioId)
  return (
    <span
      className={styles.avatar}
      style={{
        width: size, height: size, fontSize: size * 0.4,
        background: `oklch(0.55 0.13 ${hue})`,
      }}
      aria-hidden="true"
    >
      {inicialesDe(nombre, usuarioId)}
    </span>
  )
}
