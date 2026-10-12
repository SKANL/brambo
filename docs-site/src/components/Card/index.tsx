import React, {type ReactNode} from 'react'
import Link from '@docusaurus/Link'
import clsx from 'clsx'
import styles from './styles.module.css'

export type CardProps = {
  title: ReactNode
  children?: ReactNode
  /** Docs route or URL. When set, the whole card is a link. */
  to?: string
  eyebrow?: ReactNode
  icon?: ReactNode
  className?: string
}

export function Card({title, children, to, eyebrow, icon, className}: CardProps): React.JSX.Element {
  const body = (
    <>
      {icon ? <span className={styles.icon} aria-hidden="true">{icon}</span> : null}
      {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
      <span className={styles.title}>{title}</span>
      {children ? <span className={styles.body}>{children}</span> : null}
      {to ? <span className={styles.arrow} aria-hidden="true">→</span> : null}
    </>
  )
  return to
    ? <Link className={clsx(styles.card, styles.linked, className)} to={to}>{body}</Link>
    : <div className={clsx(styles.card, className)}>{body}</div>
}

export function CardGrid({children, columns = 3}: {children: ReactNode; columns?: 2 | 3 | 4}): React.JSX.Element {
  return <div className={styles.grid} style={{'--card-columns': columns} as React.CSSProperties}>{children}</div>
}

export default Card
