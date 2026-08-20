import { useEffect, useState } from 'react'
import { getSidebarOpenGroup, setSidebarOpenGroup } from '@shared/lib/ui-prefs'

// Acordeón exclusivo (nivel 2 de navegación, rediseño de dos niveles): solo
// un grupo abierto a la vez, persistido por shell (`shellKey`). `activeGroup`
// es el grupo que contiene la ruta actual (si hay alguno) — al cambiar de
// ruta hacia otro grupo, ese grupo se abre automáticamente y el anterior se
// cierra, sin depender de que el usuario haga click. Sin ruta activa en
// ningún grupo (ej. la sección base no-colapsable de AnalyticaShell), se
// respeta el último grupo que el usuario dejó abierto.
export function useExclusiveAccordion(shellKey: string, activeGroup: string | null) {
  const [openGroup, setOpenGroup] = useState<string | null>(() => activeGroup ?? getSidebarOpenGroup(shellKey))

  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup)
  }, [activeGroup])

  function toggle(group: string) {
    setOpenGroup((current) => {
      const next = current === group ? null : group
      setSidebarOpenGroup(shellKey, next)
      return next
    })
  }

  return { openGroup, toggle }
}
