import { COMERCIAL_INFORMES } from './comercial'
import { TECNOLOGIA_INFORMES } from './tecnologia'
import { FINANCIERO_INFORMES } from './financiero'
import { DATOS_INFORMES } from './datos'
import { ANALITICA_INFORMES } from './analitica'
import { CONTENIDO_INFORMES } from './contenido'
import { COMUNIDAD_INFORMES } from './comunidad'
import { SEGURIDAD_INFORMES } from './seguridad'
import { PRODUCTO_INFORMES } from './producto'
import type { DepartamentoConfig, InformeConfig } from './registryTypes'

// Registro central de los 30 informes compuestos (S13-P3b) — un slug de
// departamento (mismo que usa el backend, `api/paquetes/reportes/router.py`)
// agrupa sus informes; el sidebar y `InformeCompuestoPage` leen de acá, no
// hay 30 archivos de ruta separados (ver docs/BITACORA_S13.md, decisión de
// ruta dinámica).
export const DEPARTAMENTOS_REPORTES: DepartamentoConfig[] = [
  { slug: 'comercial',   label: 'Comercial',            informes: COMERCIAL_INFORMES },
  { slug: 'tecnologia',  label: 'Tecnología',            informes: TECNOLOGIA_INFORMES },
  { slug: 'financiero',  label: 'Financiero',            informes: FINANCIERO_INFORMES },
  { slug: 'datos',       label: 'Ingeniería de Datos',   informes: DATOS_INFORMES },
  { slug: 'analitica',   label: 'Analítica y BI',        informes: ANALITICA_INFORMES },
  { slug: 'contenido',   label: 'Contenido y A&R',       informes: CONTENIDO_INFORMES },
  { slug: 'comunidad',   label: 'Comunidad y Soporte',   informes: COMUNIDAD_INFORMES },
  { slug: 'seguridad',   label: 'Seguridad',             informes: SEGURIDAD_INFORMES },
  { slug: 'producto',    label: 'Producto',              informes: PRODUCTO_INFORMES },
]

export function buscarInforme(departamento: string, informe: string): InformeConfig | undefined {
  return DEPARTAMENTOS_REPORTES
    .find((d) => d.slug === departamento)
    ?.informes.find((i) => i.informe === informe)
}
