import React, {useState} from 'react'
import Link from '@docusaurus/Link'
import Head from '@docusaurus/Head'
import Layout from '@theme/Layout'
import CodeBlock from '@theme/CodeBlock'
import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import {Card, CardGrid} from '@site/src/components/Card'
import LayeredArchitecture from '@site/src/components/diagrams/LayeredArchitecture'
import ThreeWorlds from '@site/src/components/diagrams/ThreeWorlds'
import styles from './index.module.css'

const INSTALL = 'npm i @brambodev/session'
const VERSION = '0.5.x'

const SAMPLES = {
  session: `import { readExecutorConfigLayers, runSession } from '@brambodev/session'

const configLayers = await readExecutorConfigLayers({ projectDir: process.cwd() })

const result = await runSession({
  prompt: 'Summarize the open TODOs in this repository',
  configLayers,
  // Your host owns cancellation; brambo registers its handler here.
  onInterrupt: (cancel) => {
    process.once('SIGINT', cancel)
    return () => process.off('SIGINT', cancel)
  },
})

console.log(result.status, result.summary) // a typed ResultEnvelope`,
  durable: `import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'
import { leaseResources } from '@brambodev/contracts'
import { runDurableWorkflow } from '@brambodev/orchestration'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
const artifacts = createLocalArtifactProvider({ rootDir: './artifacts', store })

const admitted = await store.create(initial, command, principal)
const claimed = await store.claim(initial.key.namespace,
  leaseResources(initial.key, initial.workspace.workspaceId), principal.subject, 30_000)

if (admitted.status === 'accepted' && claimed.status === 'acquired') {
  // Fenced by the lease epoch: a stale worker cannot commit.
  await runDurableWorkflow({ ...execution, key: initial.key, principal,
    lease: claimed.lease, store, artifacts, concurrency: 1 })
}`,
  provider: `import { createExecutorRegistry } from '@brambodev/adapter-api'
import { defineExecutorProviderConformance } from '@brambodev/adapter-api/testing'
import { createAcmeProvider } from '@acme/brambo-adapter' // your ExecutorProvider

// Host code registers trusted providers explicitly; config never loads code.
const registry = createExecutorRegistry()
registry.register(createAcmeProvider({ credential: () => process.env.ACME_API_KEY ?? '' }))

// In your test suite: the published conformance clauses for providers.
defineExecutorProviderConformance({
  name: 'acme',
  provider: createAcmeProvider({ credential: () => 'test-key' }),
  fixtures, // deterministic success, cancellation, malformed and denial cases
})`,
}

const COPY = {
  en: {
    eyebrow: 'SDK-first · TypeScript · Fail-closed',
    title: 'Build AI coding hosts you can reason about',
    lead: 'brambo is a microkernel SDK for embedding coding agents in your own product: run executor sessions, orchestrate durable workflows, and project vendor configuration, all through explicit, tested contracts.',
    start: 'Run your first session',
    arch: 'Explore the architecture',
    copy: 'Copy',
    copied: 'Copied',
    versionLabel: 'Docs for',
    values: [
      {title: 'Explicit contracts', body: 'Every seam is a port in @brambodev/contracts with runnable conformance suites, not a convention.'},
      {title: 'Fail-closed by default', body: 'Invalid input, unknown capabilities and unprovable isolation are refused with coded errors.'},
      {title: 'Topology you can trust', body: 'Imports flow strictly downward through nine tiers, enforced by a test on every change.'},
      {title: 'Honest boundaries', body: 'brambo states what it does and what your host must do: timeouts, credentials and sandboxing included.'},
    ],
    worldsEyebrow: 'One core, three worlds',
    worldsTitle: 'Pick the world you are building in',
    worlds: [
      {title: 'Embed', body: 'Run one executor turn with runSession and get a typed ResultEnvelope.', to: '/docs/tutorials/first-session'},
      {title: 'Orchestrate', body: 'Run fenced, resumable workflows with leases, epochs and idempotent receipts.', to: '/docs/guides/durable-orchestration'},
      {title: 'Extend', body: 'Write an ExecutorProvider, register it explicitly, and prove it with conformance.', to: '/docs/guides/third-party-executor-providers'},
    ],
    codeEyebrow: 'Real APIs',
    codeTitle: 'What it looks like',
    tabs: {session: 'runSession', durable: 'runDurableWorkflow', provider: 'Custom provider'},
    trustEyebrow: 'Evidence, not adjectives',
    trust: [
      'Every public claim is traced to a test, workflow or script.',
      'Package topology and kernel isolation are enforced in CI.',
      'Packed tarballs are installed and imported in a clean consumer.',
    ],
    trustLink: 'Read claims and evidence',
    limitsEyebrow: 'Known limits',
    limits: [
      'brambo is not a sandbox; the CLI adapter runs vendor tools with their own permissions.',
      'No built-in timeouts or retries: your host supplies cancellation.',
      'Windows real-host sandbox conformance is not run in CI.',
    ],
    limitsLink: 'Security boundaries',
    compatLink: 'Compatibility',
    ctaTitle: 'Ship your first session in five minutes',
    ctaBody: 'Install one package, point it at an executor you already use, and read a typed result.',
    ctaButton: 'Start the tutorial',
  },
  es: {
    eyebrow: 'SDK primero · TypeScript · Falla de forma cerrada',
    title: 'Construye hosts de IA para programación que puedes razonar',
    lead: 'brambo es un SDK de microkernel para integrar agentes de programación en tu propio producto: ejecuta sesiones de executors, orquesta flujos durables y proyecta la configuración de proveedores, todo mediante contratos explícitos y probados.',
    start: 'Ejecuta tu primera sesión',
    arch: 'Explora la arquitectura',
    copy: 'Copiar',
    copied: 'Copiado',
    versionLabel: 'Documentación de',
    values: [
      {title: 'Contratos explícitos', body: 'Cada límite es un puerto en @brambodev/contracts con suites de conformidad ejecutables, no una convención.'},
      {title: 'Falla de forma cerrada', body: 'Las entradas inválidas, las capacidades desconocidas y el aislamiento no demostrable se rechazan con errores codificados.'},
      {title: 'Topología confiable', body: 'Las importaciones fluyen estrictamente hacia abajo por nueve niveles, y una prueba lo verifica en cada cambio.'},
      {title: 'Límites honestos', body: 'brambo indica qué hace y qué debe hacer tu host, incluidos timeouts, credenciales y sandboxing.'},
    ],
    worldsEyebrow: 'Un núcleo, tres mundos',
    worldsTitle: 'Elige el mundo en el que construyes',
    worlds: [
      {title: 'Integrar', body: 'Ejecuta un turno de un executor con runSession y obtén un ResultEnvelope tipado.', to: '/docs/tutorials/first-session'},
      {title: 'Orquestar', body: 'Ejecuta flujos reanudables con leases, épocas de fencing y recibos idempotentes.', to: '/docs/guides/durable-orchestration'},
      {title: 'Extender', body: 'Escribe un ExecutorProvider, regístralo de forma explícita y demuéstralo con la suite de conformidad.', to: '/docs/guides/third-party-executor-providers'},
    ],
    codeEyebrow: 'APIs reales',
    codeTitle: 'Así se ve',
    tabs: {session: 'runSession', durable: 'runDurableWorkflow', provider: 'Provider propio'},
    trustEyebrow: 'Evidencia, no adjetivos',
    trust: [
      'Cada afirmación pública se vincula con una prueba, un workflow o un script.',
      'La topología de paquetes y el aislamiento del kernel se verifican en CI.',
      'Los paquetes empaquetados se instalan e importan en un consumidor limpio.',
    ],
    trustLink: 'Lee afirmaciones y evidencia',
    limitsEyebrow: 'Límites conocidos',
    limits: [
      'brambo no es un sandbox; el adaptador CLI ejecuta herramientas del proveedor con sus propios permisos.',
      'No incluye timeouts ni reintentos: tu host aporta la cancelación.',
      'La conformidad del sandbox en hosts Windows reales no se ejecuta en CI.',
    ],
    limitsLink: 'Límites de seguridad',
    compatLink: 'Compatibilidad',
    ctaTitle: 'Ejecuta tu primera sesión en cinco minutos',
    ctaBody: 'Instala un paquete, apúntalo a un executor que ya uses y lee un resultado tipado.',
    ctaButton: 'Comenzar el tutorial',
  },
}

function InstallCommand({copyLabel, copiedLabel}: {copyLabel: string; copiedLabel: string}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be unavailable (insecure context); the command stays selectable.
    }
  }
  return (
    <div className={styles.install}>
      <span className={styles.prompt} aria-hidden="true">$</span>
      <code>{INSTALL}</code>
      <button type="button" className={styles.copyButton} onClick={copy} aria-live="polite">
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  )
}

export default function Home(): React.JSX.Element {
  const {i18n} = useDocusaurusContext()
  const t = i18n.currentLocale === 'es' ? COPY.es : COPY.en
  return (
    <Layout>
      <Head>
        <title>brambo | {t.title}</title>
        <meta name="description" content={t.lead} />
      </Head>
      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={`container ${styles.heroInner}`}>
            <div className={styles.heroText}>
              <p className={styles.eyebrow}>
                <span className={styles.version}>{t.versionLabel} {VERSION}</span>
                {t.eyebrow}
              </p>
              <h1 id="home-title" className={styles.title}>{t.title}</h1>
              <p className={styles.lead}>{t.lead}</p>
              <div className={styles.actions}>
                <Link className="button button--primary button--lg" to="/docs/tutorials/first-session">{t.start}</Link>
                <Link className="button button--secondary button--lg" to="/docs/explanation/architecture">{t.arch}</Link>
              </div>
              <InstallCommand copyLabel={t.copy} copiedLabel={t.copied} />
            </div>
            <div className={styles.heroArt}>
              <LayeredArchitecture />
            </div>
          </div>
        </section>

        <section className="container">
          <CardGrid columns={4}>
            {t.values.map((v) => <Card key={v.title} title={v.title}>{v.body}</Card>)}
          </CardGrid>
        </section>

        <section className={`container ${styles.worlds}`} aria-labelledby="worlds-title">
          <div className={styles.worldsArt}><ThreeWorlds /></div>
          <div>
            <p className={styles.sectionEyebrow}>{t.worldsEyebrow}</p>
            <h2 id="worlds-title" className={styles.sectionTitle}>{t.worldsTitle}</h2>
            <div className={styles.worldList}>
              {t.worlds.map((w) => <Card key={w.title} title={w.title} to={w.to}>{w.body}</Card>)}
            </div>
          </div>
        </section>

        <section className={`container ${styles.code}`} aria-labelledby="code-title">
          <p className={styles.sectionEyebrow}>{t.codeEyebrow}</p>
          <h2 id="code-title" className={styles.sectionTitle}>{t.codeTitle}</h2>
          <Tabs groupId="landing-sample">
            <TabItem value="session" label={t.tabs.session} default>
              <CodeBlock language="ts">{SAMPLES.session}</CodeBlock>
            </TabItem>
            <TabItem value="durable" label={t.tabs.durable}>
              <CodeBlock language="ts">{SAMPLES.durable}</CodeBlock>
            </TabItem>
            <TabItem value="provider" label={t.tabs.provider}>
              <CodeBlock language="ts">{SAMPLES.provider}</CodeBlock>
            </TabItem>
          </Tabs>
        </section>

        <section className={`container ${styles.strips}`}>
          <div className={`${styles.strip} ${styles.trust}`}>
            <p className={styles.sectionEyebrow}>{t.trustEyebrow}</p>
            <ul>{t.trust.map((item) => <li key={item}>{item}</li>)}</ul>
            <Link to="/docs/reference/claims-and-evidence">{t.trustLink} →</Link>
          </div>
          <div className={`${styles.strip} ${styles.limits}`}>
            <p className={styles.sectionEyebrow}>{t.limitsEyebrow}</p>
            <ul>{t.limits.map((item) => <li key={item}>{item}</li>)}</ul>
            <span className={styles.links}>
              <Link to="/docs/explanation/security-boundaries">{t.limitsLink} →</Link>
              <Link to="/docs/reference/compatibility">{t.compatLink} →</Link>
            </span>
          </div>
        </section>

        <section className={`container ${styles.cta}`}>
          <h2>{t.ctaTitle}</h2>
          <p>{t.ctaBody}</p>
          <Link className="button button--primary button--lg" to="/docs/tutorials/first-session">{t.ctaButton}</Link>
        </section>
      </main>
    </Layout>
  )
}
