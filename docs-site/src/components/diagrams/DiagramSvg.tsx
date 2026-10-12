import React, {useId, type ReactNode} from 'react'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import clsx from 'clsx'
import styles from './shared.module.css'

export type Copy = {title: string; desc: string}

/** Picks the copy for the current locale; English is the fallback. */
export function useCopy<T>(copy: {en: T; es: T}): T {
  const {i18n} = useDocusaurusContext()
  return i18n.currentLocale === 'es' ? copy.es : copy.en
}

/** Defs ids are prefixed so several diagrams can share one page. */
export function useIds(): (name: string) => string {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (name) => `bb${base}-${name}`
}

type Props = {
  viewBox: string
  copy: Copy
  ids: (name: string) => string
  className?: string
  children: ReactNode
}

/**
 * Accessible, theme-aware SVG frame shared by every diagram: role="img",
 * <title>/<desc>, and the common defs (glow, gradients, arrow markers).
 */
export default function DiagramSvg({viewBox, copy, ids, className, children}: Props): React.JSX.Element {
  return (
    <svg
      className={clsx(styles.svg, className)}
      viewBox={viewBox}
      role="img"
      aria-labelledby={`${ids('title')} ${ids('desc')}`}
      xmlns="http://www.w3.org/2000/svg">
      <title id={ids('title')}>{copy.title}</title>
      <desc id={ids('desc')}>{copy.desc}</desc>
      <defs>
        <filter id={ids('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={ids('accent')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" className={styles.stopAccent} />
          <stop offset="100%" className={styles.stopHighlight} />
        </linearGradient>
        <linearGradient id={ids('surface')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className={styles.stopSurfaceTop} />
          <stop offset="100%" className={styles.stopSurfaceBottom} />
        </linearGradient>
        <marker id={ids('arrow')} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" className={styles.arrowHead} />
        </marker>
        <marker id={ids('arrowAccent')} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" className={styles.arrowHeadAccent} />
        </marker>
        <marker id={ids('arrowDanger')} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" className={styles.arrowHeadDanger} />
        </marker>
      </defs>
      {children}
    </svg>
  )
}

/** Inline style carrying a stagger delay for `.reveal` / `.draw` elements. */
export const delay = (seconds: number): React.CSSProperties => ({'--d': `${seconds}s`} as React.CSSProperties)

/** A token travelling a path. Hidden entirely under reduced motion. */
export function Token({path, dur, begin = 0, ids, variant = 'accent', r = 5}: {
  path: string
  dur: number
  begin?: number
  ids: (name: string) => string
  variant?: 'accent' | 'highlight' | 'danger'
  r?: number
}): React.JSX.Element {
  return (
    <circle r={r} className={clsx(styles.token, styles[`token_${variant}`])} filter={`url(#${ids('glow')})`}>
      <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={path} rotate="auto" />
    </circle>
  )
}

export {styles as shared}
