import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ChevronDown, LayoutGrid, ShieldCheck, type LucideIcon } from 'lucide-react'
import { getRole, getUser } from '@shared/lib/session'
import { esSuperadmin } from '@shared/lib/roles'
import styles from './ZoneSwitcher.module.css'

export type Zone = 'catalogo' | 'analitica' | 'administracion'

const ZONE_META: Record<Zone, { label: string; icon: LucideIcon; to: string }> = {
  catalogo:       { label: 'Catálogo',       icon: LayoutGrid,  to: '/' },
  analitica:      { label: 'Analítica',      icon: BarChart3,   to: '/analitica' },
  administracion: { label: 'Administración', icon: ShieldCheck, to: '/seguridad' },
}

type Props = { currentZone: Zone; badge?: string }

// Selector de zona (nivel 1 de la navegación de dos niveles) — antes esto
// eran dos cosas separadas y sin relación entre sí: el wordmark estático de
// cada shell y, en AnalyticaShell/SeguridadShell, un `ZoneSwitcher` que solo
// hacía de "← Volver al catálogo". Ahora es un único control corto (máx. 3
// ítems: Catálogo / Analítica / Administración), mismo componente en los 3
// shells, con el mismo gating por rol que ya usaba `navAdminFor` en
// AppShell — Analítica exige superadmin o analyst, Administración exige
// esAdmin. Su única responsabilidad es cambiar de zona: NUNCA debe listar
// la navegación interna de ninguna zona (eso vive en el nivel 2, dentro de
// cada shell) — es la corrección de arquitectura central de este rediseño,
// a diferencia del intento anterior (accordions dentro del sidebar global)
// que seguía mostrando 5-7 secciones a la vez en el nivel 1.
export function ZoneSwitcher({ currentZone, badge }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const user = getUser()
  const role = getRole()
  const superadmin = esSuperadmin(user)
  const esAdmin = Boolean(user?.esAdmin)

  const zones: Zone[] = ['catalogo']
  if (superadmin || role === 'analyst') zones.push('analitica')
  if (esAdmin) zones.push('administracion')

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Sin ningún rol admin/analyst, "cambiar de zona" no tiene sentido — la
  // única zona posible es la actual, se muestra la marca sola sin dropdown
  // en vez de un botón que abre un menú de un solo ítem deshabilitado.
  if (zones.length <= 1) {
    return (
      <span className={styles.brandStatic}>
        <img src="/logo.png" alt="" className={styles.logo} width={24} height={24} />
        <span className={styles.brandName}>Tracklytics</span>
        {badge && <span className={styles.badge}>{badge}</span>}
      </span>
    )
  }

  return (
    <div className={styles.switcher} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <img src="/logo.png" alt="" className={styles.logo} width={24} height={24} />
        <span className={styles.brandName}>Tracklytics</span>
        {badge && <span className={styles.badge}>{badge}</span>}
        <ChevronDown size={14} className={open ? styles.chevronOpen : styles.chevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.menu} role="menu" aria-label="Cambiar de zona">
          {zones.map((z) => {
            const meta = ZONE_META[z]
            const Icon = meta.icon
            if (z === currentZone) {
              return (
                <span key={z} className={styles.menuItemCurrent} role="menuitem" aria-current="page">
                  <Icon size={15} aria-hidden="true" />
                  {meta.label}
                </span>
              )
            }
            return (
              <Link key={z} to={meta.to} className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>
                <Icon size={15} aria-hidden="true" />
                {meta.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
