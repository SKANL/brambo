import React from 'react'
import DiagramSvg, {Token, delay, shared as s, useCopy, useIds} from '../DiagramSvg'
import styles from './styles.module.css'

const COPY = {
  en: {
    title: 'Kernel action pipeline',
    desc: 'Every kernel action runs pre, then guard, then budget admission, then around which wraps the operation through proceed(), then post. A guard denial or an exceeded budget refuses the action before the operation runs, and post still runs to release what pre acquired. The budget meter tracks invocations, cost and concurrency across the pipeline.',
    stages: [
      ['pre', 'acquire'],
      ['guard', 'allow or deny'],
      ['admit', 'budget check'],
      ['around', 'wraps proceed()'],
      ['post', 'always runs'],
    ],
    op: 'operation',
    refused: 'refused: nothing spent, post still runs',
    budget: 'budget',
    budgetNote: 'invocations · cost · concurrency',
  },
  es: {
    title: 'Pipeline de acciones del kernel',
    desc: 'Cada acción del kernel ejecuta pre, luego guard, luego la admisión de presupuesto, luego around, que envuelve la operación mediante proceed(), y por último post. Una denegación del guard o un presupuesto excedido rechaza la acción antes de ejecutar la operación, y post se ejecuta igualmente para liberar lo que adquirió pre. El medidor de presupuesto registra invocaciones, costo y concurrencia en todo el pipeline.',
    stages: [
      ['pre', 'adquiere'],
      ['guard', 'permite o deniega'],
      ['admit', 'revisa presupuesto'],
      ['around', 'envuelve proceed()'],
      ['post', 'siempre se ejecuta'],
    ],
    op: 'operación',
    refused: 'rechazada: no gasta nada, post se ejecuta',
    budget: 'presupuesto',
    budgetNote: 'invocaciones · costo · concurrencia',
  },
}

const XS = [16, 150, 284, 434, 668]
const WS = [110, 110, 120, 206, 120]
const Y = 64
const H = 60
const MID = Y + H / 2

export default function ActionPipeline(): React.JSX.Element {
  const copy = useCopy(COPY)
  const ids = useIds()
  const arrow = `url(#${ids('arrow')})`
  const danger = `url(#${ids('arrowDanger')})`
  return (
    <DiagramSvg viewBox="0 0 804 280" copy={copy} ids={ids}>
      {XS.slice(0, 4).map((x, i) => (
        <path key={i} d={`M${x + WS[i]} ${MID} L${XS[i + 1] - 2} ${MID}`} pathLength={1}
          className={`${s.edge} ${s.draw}`} markerEnd={arrow} style={delay(0.3 + i * 0.25)} />
      ))}
      {copy.stages.map(([name, note], i) => (
        <g key={name} className={s.reveal} style={delay(0.1 + i * 0.22)}>
          <rect x={XS[i]} y={Y} width={WS[i]} height={H} rx={12}
            className={i === 3 ? s.boxDashed : i === 4 ? s.boxAccent : s.box} />
          <text x={XS[i] + (i === 3 ? 14 : WS[i] / 2)} y={i === 3 ? Y - 8 : Y + 26} textAnchor={i === 3 ? 'start' : 'middle'} className={`${s.mono} ${styles.stage}`}>{name}</text>
          <text x={XS[i] + (i === 3 ? 92 : WS[i] / 2)} y={i === 3 ? Y - 8 : Y + 44} textAnchor={i === 3 ? 'start' : 'middle'} className={s.muted}>{note}</text>
        </g>
      ))}
      <g className={s.reveal} style={delay(1.1)}>
        <rect x={470} y={Y + 12} width={134} height={36} rx={9} className={s.boxAccent} filter={`url(#${ids('glow')})`} />
        <text x={537} y={MID + 5} textAnchor="middle" className={s.label}>{copy.op}</text>
      </g>

      <g className={s.reveal} style={delay(1.4)}>
        <path d={`M205 ${Y + H} L205 192`} className={s.edgeDanger} markerEnd={danger} />
        <path d={`M344 ${Y + H} L344 192`} className={s.edgeDanger} markerEnd={danger} />
        <rect x={150} y={194} width={254} height={34} rx={9} className={styles.refused} />
        <text x={277} y={215} textAnchor="middle" className={`${s.small} ${s.dangerText}`}>{copy.refused}</text>
        <path d={`M404 211 L728 211 L728 ${Y + H + 4}`} className={s.edgeDanger} markerEnd={danger} />
      </g>

      <g className={s.reveal} style={delay(1.7)}>
        <text x={16} y={262} className={s.caps}>{copy.budget}</text>
        <text x={16} y={276} className={s.muted}>{copy.budgetNote}</text>
        <rect x={300} y={252} width={488} height={12} rx={6} className={styles.meterTrack} />
        <rect x={300} y={252} width={488} height={12} rx={6} className={styles.meterFill} fill={`url(#${ids('accent')})`} />
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={300 + 488 * t} x2={300 + 488 * t} y1={250} y2={266} className={styles.tick} />
        ))}
      </g>

      <Token ids={ids} path={`M60 ${MID} L728 ${MID}`} dur={4} begin={1} />
      <Token ids={ids} path={`M344 ${MID} L344 211 L728 211 L728 ${Y + H}`} dur={3.6} begin={3.2} variant="danger" r={4.5} />
    </DiagramSvg>
  )
}
