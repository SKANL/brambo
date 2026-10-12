import React from 'react'
import DiagramSvg, {Token, delay, shared as s, useCopy, useIds} from '../DiagramSvg'
import styles from './styles.module.css'

const COPY = {
  en: {
    title: 'Projection and the ownership ledger',
    desc: "runProjection writes registry entries into each executor's native configuration file: .claude.json for Claude Code, config.toml for Codex and opencode.json for OpenCode. Every write is recorded in the ownership ledger by target, file, native location and content hash. When an entry is removed, brambo removes only the lines its ledger owns; a server the user added by hand stays untouched.",
    registry: 'Registry',
    entries: ['mcp · github', 'mcp · docs', 'skill · review'],
    project: 'runProjection',
    files: [
      {file: '.claude.json', who: 'Claude Code'},
      {file: 'config.toml', who: 'Codex'},
      {file: 'opencode.json', who: 'OpenCode'},
    ],
    owned: 'github (owned)',
    user: 'my-server (yours)',
    preserved: 'kept on removal',
    ledger: 'Ownership ledger',
    records: 'records each owned write',
  },
  es: {
    title: 'Proyección y ledger de propiedad',
    desc: 'runProjection escribe las entradas del registro en el archivo de configuración nativo de cada executor: .claude.json para Claude Code, config.toml para Codex y opencode.json para OpenCode. Cada escritura queda registrada en el ledger de propiedad por destino, archivo, ubicación nativa y hash del contenido. Cuando se elimina una entrada, brambo elimina solo las líneas que su ledger registra como propias; un servidor que el usuario agregó a mano no se modifica.',
    registry: 'Registry',
    entries: ['mcp · github', 'mcp · docs', 'skill · review'],
    project: 'runProjection',
    files: [
      {file: '.claude.json', who: 'Claude Code'},
      {file: 'config.toml', who: 'Codex'},
      {file: 'opencode.json', who: 'OpenCode'},
    ],
    owned: 'github (propio)',
    user: 'my-server (tuyo)',
    preserved: 'se conserva',
    ledger: 'Ledger de propiedad',
    records: 'registra cada escritura propia',
  },
}

const COLS = ['target', 'file', 'location', 'hash']
const FILE_X = 470
const FILE_W = 292
const FILE_Y = [16, 130, 244]
const FILE_H = 96
const ROWS = [
  ['claude-code', '.claude.json', 'mcpServers.github', '9f2c…'],
  ['codex', 'config.toml', 'mcp_servers.github', '41ab…'],
  ['opencode', 'opencode.json', 'mcp.github', 'c07e…'],
]

export default function ProjectionLedger(): React.JSX.Element {
  const copy = useCopy(COPY)
  const ids = useIds()
  const flows = FILE_Y.map((y) => `M206 120 C330 120 340 ${y + FILE_H / 2} ${FILE_X - 4} ${y + FILE_H / 2}`)
  return (
    <DiagramSvg viewBox="0 0 780 520" copy={copy} ids={ids}>
      <g className={s.reveal} style={delay(0.1)}>
        <rect x={16} y={36} width={190} height={170} rx={16} className={s.boxAccent} />
        <text x={36} y={66} className={s.label}>{copy.registry}</text>
        {copy.entries.map((entry, i) => (
          <g key={entry}>
            <rect x={34} y={82 + i * 38} width={154} height={28} rx={8} className={s.box} />
            <text x={48} y={100 + i * 38} className={s.mono}>{entry}</text>
          </g>
        ))}
      </g>
      {flows.map((d, i) => (
        <g key={i}>
          <path d={d} pathLength={1} className={`${s.edgeAccent} ${s.draw}`} markerEnd={`url(#${ids('arrowAccent')})`} style={delay(0.6 + i * 0.2)} />
          <Token ids={ids} path={d} dur={2.8} begin={1.4 + i * 0.5} />
        </g>
      ))}
      <text x={300} y={96} textAnchor="middle" className={`${s.mono} ${styles.call}`}>{copy.project}</text>

      {copy.files.map((f, i) => {
        const y = FILE_Y[i]
        return (
          <g key={f.file} className={s.reveal} style={delay(0.9 + i * 0.2)}>
            <rect x={FILE_X} y={y} width={FILE_W} height={FILE_H} rx={12} className={s.box} />
            <path d={`M${FILE_X} ${y + 26} L${FILE_X + FILE_W} ${y + 26}`} className={styles.rule} />
            <text x={FILE_X + 14} y={y + 18} className={s.mono}>{f.file}</text>
            <text x={FILE_X + FILE_W - 14} y={y + 18} textAnchor="end" className={s.muted}>{f.who}</text>
            <g className={i === 0 ? styles.ownedCycle : undefined}>
              <rect x={FILE_X + 12} y={y + 36} width={150} height={22} rx={6} className={styles.ownedLine} />
              <text x={FILE_X + 22} y={y + 51} className={s.mono}>{copy.owned}</text>
            </g>
            {i === 0 ? <path d={`M${FILE_X + 16} ${y + 47} L${FILE_X + 158} ${y + 47}`} pathLength={1} className={styles.strike} /> : null}
            {i === 0 ? (
              <g className={styles.userCycle}>
                <rect x={FILE_X + 12} y={y + 64} width={150} height={22} rx={6} className={styles.userLine} />
                <text x={FILE_X + 22} y={y + 79} className={s.mono}>{copy.user}</text>
                <text x={FILE_X + 172} y={y + 79} className={`${s.muted} ${s.highlightText}`}>{copy.preserved}</text>
              </g>
            ) : null}
          </g>
        )
      })}

      <g className={s.reveal} style={delay(1.6)}>
        <path d="M300 236 L300 358" className={`${s.edge} ${styles.dashed}`} markerEnd={`url(#${ids('arrow')})`} />
        <text x={308} y={300} className={s.muted}>{copy.records}</text>
        <rect x={16} y={364} width={746} height={140} rx={14} className={s.box} />
        <text x={34} y={390} className={s.label}>{copy.ledger}</text>
        <text x={746} y={390} textAnchor="end" className={s.mono}>projection-ledger.json</text>
        {COLS.map((col, c) => (
          <text key={col} x={34 + c * 182} y={414} className={s.caps}>{col}</text>
        ))}
        {ROWS.map((row, r) => (
          <g key={row[0]} className={s.reveal} style={delay(1.9 + r * 0.25)}>
            <rect x={26} y={422 + r * 26} width={726} height={22} rx={5} className={styles.ledgerRow} />
            {row.map((cell, c) => (
              <text key={c} x={34 + c * 182} y={437 + r * 26} className={s.mono}>{cell}</text>
            ))}
          </g>
        ))}
      </g>
    </DiagramSvg>
  )
}
