import React from 'react'
import DiagramSvg, {Token, delay, shared as s, useCopy, useIds} from '../DiagramSvg'
import styles from './styles.module.css'

const COPY = {
  en: {
    title: 'The three worlds of brambo',
    desc: 'Three independent worlds orbit a shared core of contracts and kernel: the session world runs one executor turn, the durable world runs fenced, resumable workflows, and the environment world projects a registry into vendor configuration. Each world depends only on the core, never on another world.',
    core: ['contracts', '+ kernel'],
    worlds: [
      {name: 'Session', note: 'one run, one result', packages: 'runSession · adapters'},
      {name: 'Durable', note: 'fenced, resumable', packages: 'runDurableWorkflow · store'},
      {name: 'Environment', note: 'native vendor config', packages: 'registry · projection'},
    ],
  },
  es: {
    title: 'Los tres mundos de brambo',
    desc: 'Tres mundos independientes orbitan un núcleo compartido de contratos y kernel: el mundo de sesión ejecuta un turno de un executor, el mundo durable ejecuta flujos reanudables con fencing y el mundo de entorno proyecta un registro hacia la configuración del proveedor. Cada mundo depende solo del núcleo, nunca de otro mundo.',
    core: ['contracts', '+ kernel'],
    worlds: [
      {name: 'Sesión', note: 'una ejecución, un resultado', packages: 'runSession · adapters'},
      {name: 'Durable', note: 'con fencing, reanudable', packages: 'runDurableWorkflow · store'},
      {name: 'Entorno', note: 'configuración nativa', packages: 'registry · projection'},
    ],
  },
}

const CX = 340
const CY = 215
const R = 168
const ANGLES = [-90, 150, 30]
const W = 210
const H = 74

export default function ThreeWorlds(): React.JSX.Element {
  const copy = useCopy(COPY)
  const ids = useIds()
  const points = ANGLES.map((deg) => {
    const rad = (deg * Math.PI) / 180
    return {x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad)}
  })
  return (
    <DiagramSvg viewBox="0 0 680 440" copy={copy} ids={ids}>
      <g className={styles.orbit}>
        <circle cx={CX} cy={CY} r={R} className={s.boxDashed} />
      </g>
      <circle cx={CX} cy={CY} r={R - 52} className={styles.innerRing} />
      {points.map((p, i) => {
        const path = `M ${CX} ${CY} L ${p.x} ${p.y}`
        return (
          <g key={i}>
            <path d={path} pathLength={1} className={`${s.edgeAccent} ${s.draw}`} style={delay(0.5 + i * 0.25)} />
            <Token ids={ids} path={path} dur={2.6} begin={1.5 + i * 0.85} variant={i === 1 ? 'highlight' : 'accent'} r={4.5} />
          </g>
        )
      })}
      <g className={s.reveal} style={delay(0.1)}>
        <circle cx={CX} cy={CY} r={58} fill={`url(#${ids('accent')})`} className={styles.coreGlow} filter={`url(#${ids('glow')})`} />
        <circle cx={CX} cy={CY} r={52} className={styles.core} />
        <text x={CX} y={CY - 2} textAnchor="middle" className={s.label}>{copy.core[0]}</text>
        <text x={CX} y={CY + 16} textAnchor="middle" className={s.muted}>{copy.core[1]}</text>
      </g>
      {copy.worlds.map((world, i) => {
        const p = points[i]
        return (
          <g key={world.name} className={s.reveal} style={delay(0.9 + i * 0.25)}>
            <rect x={p.x - W / 2} y={p.y - H / 2} width={W} height={H} rx={16} className={s.box} />
            <rect x={p.x - W / 2} y={p.y - H / 2} width={6} height={H} rx={3} className={styles[`stripe${i}`]} />
            <text x={p.x - W / 2 + 20} y={p.y - 12} className={s.label}>{world.name}</text>
            <text x={p.x - W / 2 + 20} y={p.y + 5} className={s.muted}>{world.note}</text>
            <text x={p.x - W / 2 + 20} y={p.y + 24} className={s.mono}>{world.packages}</text>
          </g>
        )
      })}
    </DiagramSvg>
  )
}
