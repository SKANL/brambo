import React from 'react'
import DiagramSvg, {Token, delay, shared as s, useCopy, useIds} from '../DiagramSvg'
import styles from './styles.module.css'

type Tier = {name: string; note: string; chips: string[]; accent?: boolean; dashed?: boolean}

const TIERS: {tier: number; chips: string[]}[] = [
  {tier: 8, chips: ['cli']},
  {tier: 7, chips: ['workflow-coordinator']},
  {tier: 6, chips: ['adapter-openai', 'adapter-anthropic']},
  {tier: 5, chips: ['adapter-api']},
  {tier: 4, chips: ['session']},
  {tier: 3, chips: ['orchestration', 'environment']},
  {tier: 2, chips: ['adapter-cli', 'adapter-acp', 'workspace-local', 'workspace-git-worktree', 'workspace-artifacts-local', 'runtime-local', 'workflow-store-sqlite', 'workflow-remote', 'memory-filesystem', 'memory-sqlite', 'registry', 'projection']},
  {tier: 1, chips: ['lock', 'sandbox', 'sandbox-local', 'sandbox-remote', 'provenance', 'delegation']},
  {tier: 0, chips: ['kernel', 'contracts']},
]

function tiers(host: Tier, label: (tier: number) => string, notes: Record<number, string>): Tier[] {
  return [host, ...TIERS.map(({tier, chips}) => ({name: label(tier), note: notes[tier] ?? '', chips, accent: tier === 0}))]
}

const COPY = {
  en: {
    title: 'brambo layered architecture',
    desc: 'The host application sits above nine package tiers, from the CLI at tier 8 down to the kernel and contracts at tier 0, which have no runtime package dependencies. Imports only flow strictly downward, enforced by the topology test; a request token travels from the host down to the kernel.',
    tiers: tiers({name: 'Your host', note: 'app or service', chips: ['credentials', 'policy', 'AbortSignal', 'authorization'], dashed: true},
      (tier) => `Tier ${tier}`, {8: 'argv binding', 4: 'SDK entry', 3: 'composition', 2: 'implementations', 1: 'primitives', 0: 'no package deps'}),
    flow: 'imports flow strictly down',
  },
  es: {
    title: 'Arquitectura en capas de brambo',
    desc: 'La aplicación host está por encima de nueve niveles de paquetes, desde la CLI en el nivel 8 hasta el kernel y los contratos en el nivel 0, que no tienen dependencias de paquetes en tiempo de ejecución. Las importaciones solo fluyen estrictamente hacia abajo, lo que garantiza la prueba de topología; un token de solicitud viaja desde el host hasta el kernel.',
    tiers: tiers({name: 'Tu host', note: 'app o servicio', chips: ['credentials', 'policy', 'AbortSignal', 'authorization'], dashed: true},
      (tier) => `Nivel ${tier}`, {8: 'enlace argv', 4: 'entrada del SDK', 3: 'composición', 2: 'implementaciones', 1: 'primitivas', 0: 'sin dependencias'}),
    flow: 'importaciones solo hacia abajo',
  },
}

const X0 = 70
const X1 = 740
const CHIP_X = 200
const ROW = 24
const CHAR = 6.7

/** Wraps chips into rows inside the tier; returns positions and the row count. */
function layout(chips: string[]) {
  const placed: {label: string; x: number; row: number; w: number}[] = []
  let x = CHIP_X
  let row = 0
  for (const label of chips) {
    const w = label.length * CHAR + 18
    if (x + w > X1 - 12) { row += 1; x = CHIP_X }
    placed.push({label, x, row, w})
    x += w + 8
  }
  return {placed, rows: row + 1}
}

export default function LayeredArchitecture(): React.JSX.Element {
  const copy = useCopy(COPY)
  const ids = useIds()
  let y = 16
  const tiers = copy.tiers.map((tier) => {
    const {placed, rows} = layout(tier.chips)
    const h = 22 + rows * ROW
    const top = y
    y += h + 8
    return {tier, placed, top, h}
  })
  const bottom = y
  const spine = `M 34 ${tiers[0].top + 20} L 34 ${tiers[tiers.length - 1].top + tiers[tiers.length - 1].h / 2}`
  return (
    <DiagramSvg viewBox={`0 0 760 ${bottom + 6}`} copy={copy} ids={ids}>
      <path d={spine} pathLength={1} className={`${s.edgeAccent} ${s.draw}`} markerEnd={`url(#${ids('arrowAccent')})`} style={delay(0.2)} />
      <text className={s.caps} transform={`translate(22 ${bottom / 2}) rotate(-90)`} textAnchor="middle">{copy.flow}</text>
      {tiers.map(({tier, placed, top, h}, index) => (
        <g key={tier.name} className={s.reveal} style={delay(0.1 + index * 0.1)}>
          <rect x={X0} y={top} width={X1 - X0} height={h} rx={14}
            className={tier.dashed ? s.boxDashed : tier.accent ? s.boxAccent : s.box}
            filter={tier.accent ? `url(#${ids('glow')})` : undefined} />
          <text x={X0 + 18} y={top + h / 2 - (tier.note ? 2 : -5)} className={s.label}>{tier.name}</text>
          {tier.note ? <text x={X0 + 18} y={top + h / 2 + 13} className={s.muted}>{tier.note}</text> : null}
          {placed.map((chip) => (
            <g key={chip.label} className={styles.chipGroup}>
              <rect x={chip.x} y={top + 11 + chip.row * ROW} width={chip.w} height={20} rx={10} className={s.chip} />
              <text x={chip.x + chip.w / 2} y={top + 25 + chip.row * ROW} textAnchor="middle" className={s.mono}>{chip.label}</text>
            </g>
          ))}
        </g>
      ))}
      <Token ids={ids} path={spine} dur={3.2} begin={1.2} />
      <Token ids={ids} path={spine} dur={3.2} begin={2.8} variant="highlight" r={4} />
    </DiagramSvg>
  )
}
