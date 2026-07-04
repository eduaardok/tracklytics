import styles from './ComingSoonPage.module.css'

type Props = {
  section:     string
  description: string
}

export function ComingSoonPage({ section, description }: Props) {
  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>{section}</h1>
      <span className={styles.subtitle}>// sección pendiente</span>
      <div className={styles.panel}>
        <p className={styles.description}>{description}</p>
      </div>
    </section>
  )
}
