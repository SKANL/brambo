import React from 'react'
import DiagramSvg, {Token, delay, shared as s, useCopy, useIds} from '../DiagramSvg'
import styles from './styles.module.css'

const COPY = {
  en: {
    title: 'Trust boundaries',
    desc: 'Three zones: your host owns credentials, authorization policy and timeouts; the brambo SDK validates, freezes, redacts and fails closed; the agent process (a vendor CLI or a model API) runs with its own permissions. The line between the SDK and the agent process is not a sandbox: brambo does not isolate the agent. Isolation exists only where an optional sandbox provider such as sandbox-local or sandbox-remote can prove it.',
    zones: [
      {name: 'Your host', items: ['credentials', 'authorization policy', 'AbortSignal, timeouts', 'deployment, secrets']},
      {name: 'brambo SDK', items: ['validates and freezes', 'fails closed', 'redacts secrets', 'ownership ledger']},
      {name: 'Agent process', items: ['vendor CLI or model API', 'own permissions', 'own network access']},
    ],
    notSandbox: 'not a sandbox',
    sandbox: 'optional sandbox provider',
    sandboxNote: 'isolation only where a provider proves it',
    flows: ['runSession', 'prompt', 'tool call', 'authorize?'],
  },
  es: {
    title: 'Límites de confianza',
    desc: 'Tres zonas: tu host administra credenciales, la política de autorización y los timeouts; el SDK de brambo valida, congela, redacta y falla de forma cerrada; el proceso del agente (una CLI del proveedor o una API de modelo) se ejecuta con sus propios permisos. La línea entre el SDK y el proceso del agente no es un sandbox: brambo no aísla al agente. El aislamiento existe solo donde un provider de sandbox opcional, como sandbox-local o sandbox-remote, puede demostrarlo.',
    zones: [
      {name: 'Tu host', items: ['credenciales', 'política de autorización', 'AbortSignal, timeouts', 'despliegue, secretos']},
      {name: 'SDK de brambo', items: ['valida y congela', 'falla de forma cerrada', 'redacta secretos', 'ledger de propiedad']},
      {name: 'Proceso del agente', items: ['CLI del proveedor o API', 'permisos propios', 'acceso de red propio']},
    ],
    notSandbox: 'no es un sandbox',
    sandbox: 'provider de sandbox opcional',
    sandboxNote: 'aislamiento solo si un provider lo demuestra',
    flows: ['runSession', 'prompt', 'tool call', '¿autorizar?'],
  },
}

const ZX = [16, 296, 580]
const ZW = 196
const ZY = 56
const ZH = 196

export default function TrustBoundary(): React.JSX.Element {
  const copy = useCopy(COPY)
  const ids = useIds()
  const accent = `url(#${ids('arrowAccent')})`
  const plain = `url(#${ids('arrow')})`
  const flows = [
    {d: `M${ZX[0] + ZW + 2} 120 L${ZX[1] - 4} 120`, label: copy.flows[0], y: 112, marker: accent, cls: s.edgeAccent},
    {d: `M${ZX[1] + ZW + 2} 120 L${ZX[2] - 4} 120`, label: copy.flows[1], y: 112, marker: accent, cls: s.edgeAccent},
    {d: `M${ZX[2] - 2} 186 L${ZX[1] + ZW + 4} 186`, label: copy.flows[2], y: 178, marker: plain, cls: s.edge},
    {d: `M${ZX[1] - 2} 186 L${ZX[0] + ZW + 4} 186`, label: copy.flows[3], y: 178, marker: plain, cls: s.edge},
  ]
  return (
    <DiagramSvg viewBox="0 0 800 370" copy={copy} ids={ids}>
      <g className={s.reveal} style={delay(1.4)}>
        <rect x={572} y={36} width={214} height={226} rx={20} className={styles.sandbox} />
        <text x={680} y={290} textAnchor="middle" className={s.caps}>{copy.sandbox}</text>
        {['sandbox-local', 'sandbox-remote'].map((name, i) => (
          <g key={name}>
            <rect x={576 + i * 106} y={302} width={100} height={22} rx={11} className={s.chip} />
            <text x={626 + i * 106} y={317} textAnchor="middle" className={s.mono}>{name}</text>
          </g>
        ))}
        <text x={680} y={344} textAnchor="middle" className={s.muted}>{copy.sandboxNote}</text>
      </g>

      {copy.zones.map((zone, i) => (
        <g key={zone.name} className={s.reveal} style={delay(0.1 + i * 0.25)}>
          <rect x={ZX[i]} y={ZY} width={ZW} height={ZH} rx={16}
            className={i === 0 ? s.boxDashed : i === 1 ? s.boxAccent : s.box}
            filter={i === 1 ? `url(#${ids('glow')})` : undefined} />
          <text x={ZX[i] + 18} y={ZY + 28} className={s.label}>{zone.name}</text>
          {zone.items.map((item, j) => (
            <g key={item}>
              <circle cx={ZX[i] + 22} cy={ZY + 104 + j * 24} r={3} className={i === 1 ? styles.dotAccent : styles.dot} />
              <text x={ZX[i] + 32} y={ZY + 108 + j * 24} className={s.small}>{item}</text>
            </g>
          ))}
        </g>
      ))}

      {flows.map((f, i) => (
        <g key={f.label} className={s.reveal} style={delay(0.8 + i * 0.2)}>
          <path d={f.d} className={f.cls} markerEnd={f.marker} />
          <text x={i === 0 || i === 3 ? (ZX[0] + ZW + ZX[1]) / 2 : (ZX[1] + ZW + 566) / 2} y={f.y} textAnchor="middle" className={s.mono}>{f.label}</text>
        </g>
      ))}

      <g className={s.reveal} style={delay(1.2)}>
        <path d="M566 18 L566 270" className={styles.boundary} />
        <rect x={510} y={6} width={112} height={22} rx={11} className={styles.boundaryTag} />
        <text x={566} y={21} textAnchor="middle" className={`${s.small} ${s.dangerText}`}>{copy.notSandbox}</text>
      </g>

      <Token ids={ids} path={`M${ZX[0] + ZW} 120 L${ZX[2]} 120`} dur={3} begin={1.6} />
      <Token ids={ids} path={`M${ZX[2]} 186 L${ZX[0] + ZW} 186`} dur={3} begin={3.1} variant="highlight" r={4.5} />
    </DiagramSvg>
  )
}
