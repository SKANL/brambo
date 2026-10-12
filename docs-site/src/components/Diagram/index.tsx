import React, {type ReactNode} from 'react'
import styles from './styles.module.css'

/** Frame for an illustration: consistent spacing, surface and optional caption. */
export default function Diagram({children, caption}: {children: ReactNode; caption?: ReactNode}): React.JSX.Element {
  return (
    <figure className={styles.frame}>
      <div className={styles.canvas}>{children}</div>
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  )
}
