import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import styles from './ComingSoonPage.module.css'

type Props = {
  section:     string
  description: string
}

export function ComingSoonPage({ section, description }: Props) {
  useDocumentTitle(section)
  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>{section}</h1>
      <div className={styles.panel}>
        <p className={styles.description}>{description}</p>
      </div>
    </section>
  )
}
