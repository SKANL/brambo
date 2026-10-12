import React from 'react'
import DiagramSvg, {Token, delay, shared as s, useCopy, useIds} from '../DiagramSvg'
import styles from './styles.module.css'

const COPY = {
  en: {
    title: 'Session lifecycle',
    desc: 'runSession takes a configuration snapshot, mounts an executor and a workspace, and runs the tool loop. Every tool call the model requests passes the host authorization gate: allowed calls run through the ToolExecutor and return to the loop; denied calls return a refusal to the model. The run ends with a typed ResultEnvelope.',
    steps: [
      ['Config', 'layered snapshot'],
      ['Executor', 'CLI or API adapter'],
      ['Workspace', 'local · git worktree'],
      ['Tool loop', 'model ↔ tools'],
      ['ResultEnvelope', 'typed, frozen'],
    ],
    gate: 'host authorization',
    allow: ['ToolExecutor', 'allowed → runs'],
    deny: ['Refusal', 'denied → model'],
    call: 'tool call',
  },
  es: {
    title: 'Ciclo de vida de una sesión',
    desc: 'runSession recibe una instantánea de configuración, monta un executor y un workspace, y ejecuta el ciclo de herramientas. Cada llamada a herramienta que pide el modelo pasa por la autorización del host: las permitidas se ejecutan mediante el ToolExecutor y vuelven al ciclo; las denegadas devuelven un rechazo al modelo. La ejecución termina con un ResultEnvelope tipado.',
    steps: [
      ['Config', 'instantánea por capas'],
      ['Executor', 'adaptador CLI o API'],
      ['Workspace', 'local · git worktree'],
      ['Ciclo de tools', 'modelo ↔ tools'],
      ['ResultEnvelope', 'tipado, congelado'],
    ],
    gate: 'autorización del host',
    allow: ['ToolExecutor', 'permitida → se ejecuta'],
    deny: ['Rechazo', 'denegada → modelo'],
    call: 'llamada',
  },
}

const XS = [16, 174, 332, 490, 648]
const WS = [128, 128, 128, 128, 156]
const Y = 150
const H = 52
const MID = Y + H / 2

export default function SessionLifecycle(): React.JSX.Element {
  const copy = useCopy(COPY)
  const ids = useIds()
  const arrow = `url(#${ids('arrow')})`
  const allowPath = 'M554 150 L554 62 L644 62 L676 84 C676 122 600 118 600 150'
  const denyPath = 'M554 150 L554 62 L464 62 L432 84 C432 122 508 118 508 150'
  return (
    <DiagramSvg viewBox="0 0 820 222" copy={copy} ids={ids}>
      {XS.slice(0, 4).map((x, i) => (
        <path key={i} d={`M${x + WS[i]} ${MID} L${XS[i + 1] - 2} ${MID}`} pathLength={1}
          className={`${i === 3 ? s.edgeAccent : s.edge} ${s.draw}`} markerEnd={i === 3 ? `url(#${ids('arrowAccent')})` : arrow} style={delay(0.3 + i * 0.25)} />
      ))}
      {copy.steps.map(([name, note], i) => (
        <g key={name} className={s.reveal} style={delay(0.15 + i * 0.25)}>
          <rect x={XS[i]} y={Y} width={WS[i]} height={H} rx={12} className={i === 4 ? s.boxAccent : s.box} />
          <text x={XS[i] + WS[i] / 2} y={Y + 22} textAnchor="middle" className={s.label}>{name}</text>
          <text x={XS[i] + WS[i] / 2} y={Y + 39} textAnchor="middle" className={s.muted}>{note}</text>
        </g>
      ))}

      <g className={s.reveal} style={delay(1.2)}>
        <path d="M554 150 L554 86" pathLength={1} className={`${s.edge} ${s.draw}`} markerEnd={arrow} style={delay(1.2)} />
        <text x={562} y={124} className={s.muted}>{copy.call}</text>
        <text x={554} y={22} textAnchor="middle" className={s.caps}>{copy.gate}</text>
        <path d="M554 38 L578 62 L554 86 L530 62 Z" className={styles.gate} filter={`url(#${ids('glow')})`} />
        <text x={554} y={67} textAnchor="middle" className={styles.gateMark}>?</text>
      </g>

      <g className={s.reveal} style={delay(1.5)}>
        <path d="M578 62 L610 62" className={s.edgeAccent} markerEnd={`url(#${ids('arrowAccent')})`} />
        <rect x={612} y={40} width={128} height={44} rx={10} className={s.boxAccent} />
        <text x={676} y={58} textAnchor="middle" className={s.small}>{copy.allow[0]}</text>
        <text x={676} y={74} textAnchor="middle" className={`${s.muted} ${s.accentText}`}>{copy.allow[1]}</text>
        <path d="M676 84 C676 122 600 118 600 150" className={s.edge} markerEnd={arrow} />
      </g>

      <g className={s.reveal} style={delay(1.8)}>
        <path d="M530 62 L498 62" className={s.edgeDanger} markerEnd={`url(#${ids('arrowDanger')})`} />
        <rect x={368} y={40} width={128} height={44} rx={10} className={styles.denyBox} />
        <text x={432} y={58} textAnchor="middle" className={s.small}>{copy.deny[0]}</text>
        <text x={432} y={74} textAnchor="middle" className={`${s.muted} ${s.dangerText}`}>{copy.deny[1]}</text>
        <path d="M432 84 C432 122 508 118 508 150" className={s.edgeDanger} markerEnd={`url(#${ids('arrowDanger')})`} />
      </g>

      <Token ids={ids} path={`M80 ${MID} L554 ${MID}`} dur={3} begin={0.8} />
      <Token ids={ids} path={allowPath} dur={3.4} begin={2.4} />
      <Token ids={ids} path={denyPath} dur={3.4} begin={4.1} variant="danger" r={4.5} />
      <Token ids={ids} path={`M618 ${MID} L726 ${MID}`} dur={2.2} begin={3.2} variant="highlight" r={4.5} />
    </DiagramSvg>
  )
}
