import React, {type ReactNode} from 'react'
import clsx from 'clsx'
import styles from './styles.module.css'

export type PackageStatus = 'stable' | 'experimental' | 'frozen'

const LABELS: Record<PackageStatus, string> = {stable: 'Stable', experimental: 'Experimental', frozen: 'Frozen'}

/** Package status badge. Pass `children` to localize the label. */
export default function Badge({status, children}: {status: PackageStatus; children?: ReactNode}): React.JSX.Element {
  return <span className={clsx(styles.badge, styles[status])}>{children ?? LABELS[status]}</span>
}
