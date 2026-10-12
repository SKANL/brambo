import React from 'react'
import DiagramSvg, {Token, delay, shared as s, useCopy, useIds} from '../DiagramSvg'
import styles from './styles.module.css'

const COPY = {
  en: {
    title: 'Durable leases and fencing',
    desc: 'Worker A claims a lease and receives fencing epoch 1, then stalls. After the lease expires, worker B claims it and receives epoch 2. When worker A tries to commit with epoch 1, the store rejects the stale write at the compare-and-swap commit. Worker B commits with epoch 2 and the revision advances. Retrying the same command with the same idempotency key replays the stored receipt instead of repeating the effect.',
    lanes: ['Worker A', 'Store', 'Worker B'],
    store: 'CAS revision + epoch',
    steps: {
      claimA: 'claim lease',
      epoch1: 'epoch 1',
      stall: 'stalls · lease expires',
      claimB: 'claim lease',
      epoch2: 'epoch 2',
      staleCommit: 'commit (epoch 1)',
      rejected: 'stale epoch: rejected',
      commitB: 'commit (epoch 2)',
      accepted: 'rev 7 → 8',
      retry: 'retry, same idempotency key',
      replay: 'receipt replayed, no new effect',
    },
  },
  es: {
    title: 'Leases durables y fencing',
    desc: 'El worker A reclama un lease y recibe la época de fencing 1; luego se detiene. Cuando el lease vence, el worker B lo reclama y recibe la época 2. Cuando el worker A intenta confirmar con la época 1, el store rechaza la escritura obsoleta en el commit compare-and-swap. El worker B confirma con la época 2 y la revisión avanza. Reintentar el mismo comando con la misma clave de idempotencia reproduce el recibo guardado en lugar de repetir el efecto.',
    lanes: ['Worker A', 'Store', 'Worker B'],
    store: 'revisión CAS + época',
    steps: {
      claimA: 'reclama lease',
      epoch1: 'época 1',
      stall: 'se detiene · el lease vence',
      claimB: 'reclama lease',
      epoch2: 'época 2',
      staleCommit: 'commit (época 1)',
      rejected: 'época obsoleta: rechazado',
      commitB: 'commit (época 2)',
      accepted: 'rev 7 → 8',
      retry: 'reintento, misma clave',
      replay: 'recibo reproducido, sin efecto nuevo',
    },
  },
}

const A = 120
const S = 360
const B = 600
const TOP = 78

type Msg = {from: number; to: number; y: number; label: string; kind?: 'reply' | 'danger' | 'accent'}

export default function DurableLease(): React.JSX.Element {
  const copy = useCopy(COPY)
  const ids = useIds()
  const t = copy.steps
  const msgs: Msg[] = [
    {from: A, to: S, y: 112, label: t.claimA},
    {from: S, to: A, y: 140, label: t.epoch1, kind: 'reply'},
    {from: B, to: S, y: 214, label: t.claimB},
    {from: S, to: B, y: 242, label: t.epoch2, kind: 'reply'},
    {from: A, to: S, y: 286, label: t.staleCommit, kind: 'danger'},
    {from: B, to: S, y: 334, label: t.commitB, kind: 'accent'},
    {from: B, to: S, y: 384, label: t.retry},
    {from: S, to: B, y: 412, label: t.replay, kind: 'reply'},
  ]
  const marker = (kind?: Msg['kind']) => `url(#${ids(kind === 'danger' ? 'arrowDanger' : kind === 'accent' ? 'arrowAccent' : 'arrow')})`
  return (
    <DiagramSvg viewBox="0 0 720 450" copy={copy} ids={ids}>
      {[A, S, B].map((x, i) => (
        <g key={x} className={s.reveal} style={delay(0.1 + i * 0.12)}>
          <line x1={x} x2={x} y1={TOP} y2={436} className={styles.lifeline} />
          <rect x={x - 78} y={20} width={156} height={TOP - 26} rx={12} className={i === 1 ? s.boxAccent : s.box} />
          <text x={x} y={i === 1 ? 42 : 51} textAnchor="middle" className={s.label}>{copy.lanes[i]}</text>
          {i === 1 ? <text x={x} y={60} textAnchor="middle" className={s.muted}>{copy.store}</text> : null}
        </g>
      ))}
      <g className={s.reveal} style={delay(1.3)}>
        <rect x={A - 6} y={152} width={12} height={110} rx={6} className={styles.stalled} />
        <text x={A + 14} y={186} className={`${s.muted} ${styles.stallText}`}>{t.stall}</text>
        <circle cx={A} cy={170} r={9} className={styles.clock} />
        <path d={`M${A} 165 L${A} 170 L${A + 4} 172`} className={styles.clockHand} />
      </g>
      {msgs.map((m, i) => {
        const dir = m.to > m.from ? 1 : -1
        const x1 = m.from + dir * 4
        const x2 = m.to - dir * 6
        const cls = m.kind === 'danger' ? s.edgeDanger : m.kind === 'accent' ? s.edgeAccent : s.edge
        return (
          <g key={i} className={s.reveal} style={delay(0.5 + i * 0.42)}>
            <path d={`M${x1} ${m.y} L${x2} ${m.y}`} className={`${cls} ${m.kind === 'reply' ? styles.reply : ''}`} markerEnd={marker(m.kind)} />
            <text x={(m.from + m.to) / 2} y={m.y - 7} textAnchor="middle"
              className={m.kind === 'danger' ? `${s.small} ${s.dangerText}` : m.kind === 'accent' ? `${s.small} ${s.accentText}` : s.small}>{m.label}</text>
          </g>
        )
      })}
      <g className={s.reveal} style={delay(0.5 + 4 * 0.42 + 0.2)}>
        <circle cx={S} cy={286} r={11} className={styles.reject} />
        <path d={`M${S - 5} 281 L${S + 5} 291 M${S + 5} 281 L${S - 5} 291`} className={styles.rejectX} />
        <text x={S + 18} y={304} className={`${s.muted} ${s.dangerText}`}>{t.rejected}</text>
      </g>
      <g className={s.reveal} style={delay(0.5 + 5 * 0.42 + 0.2)}>
        <rect x={S - 40} y={344} width={80} height={20} rx={10} className={s.boxAccent} filter={`url(#${ids('glow')})`} />
        <text x={S} y={358} textAnchor="middle" className={s.mono}>{t.accepted}</text>
      </g>
      <Token ids={ids} path={`M${B} 334 L${S} 334`} dur={2.4} begin={3.2} />
      <Token ids={ids} path={`M${A} 286 L${S} 286`} dur={2.4} begin={2.6} variant="danger" r={4.5} />
      <Token ids={ids} path={`M${S} 412 L${B} 412`} dur={2.4} begin={4} variant="highlight" r={4.5} />
    </DiagramSvg>
  )
}
