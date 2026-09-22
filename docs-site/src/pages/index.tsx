import React from 'react'
import Link from '@docusaurus/Link'
import Head from '@docusaurus/Head'
import Layout from '@theme/Layout'
import useBaseUrl from '@docusaurus/useBaseUrl'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

type Pathway = {
  eyebrow: string
  title: string
  description: string
  link: string
  linkLabel: string
}

export default function Home(): React.JSX.Element {
  const {i18n} = useDocusaurusContext()
  const docsRoot = useBaseUrl('/docs/')
  const isSpanish = i18n.currentLocale === 'es'
  const docsUrl = (path: string) => `${docsRoot}${path}`
  const copy = isSpanish
      ? {
        heroEyebrow: 'SDK primero · Contratos explícitos · Propiedad clara',
        title: 'Compón entornos de programación con límites claros.',
        description:
          'Brambo es un microkernel orientado al SDK para integrar executors, workspaces y herramientas mediante contratos explícitos.',
        quickStart: 'Comenzar con la guía rápida',
        architecture: 'Explorar la arquitectura',
        api: 'Referencia de API',
        eyebrow: 'Rutas para empezar',
        note: 'Elige la ruta según lo que quieras hacer.',
        cards: [
          {
            eyebrow: 'Adopción',
            title: 'Ejecuta tu primera sesión',
            description: 'Instala el SDK, configura un executor y obtén un resultado tipado.',
            link: 'next/tutorials/first-session',
            linkLabel: 'Abrir la primera sesión',
          },
          {
            eyebrow: 'Extensión',
            title: 'Implementa un adapter',
            description: 'Empieza por el contrato público y verifica el adapter con la suite de cláusulas.',
            link: 'next/how-to/create-adapter',
            linkLabel: 'Crear un adapter',
          },
          {
            eyebrow: 'Límites',
            title: 'Comprende la arquitectura',
            description: 'Sigue el ciclo de vida y distingue los contratos de las garantías de seguridad.',
            link: 'next/explanation/architecture',
            linkLabel: 'Leer la arquitectura',
          },
        ] satisfies Pathway[],
        versionTitle: 'Elige la documentación',
        stable: 'Documentación estable 0.3.0',
        next: 'Documentación de trabajo Next',
        nextDescription: 'Incluye cambios aún no publicados.',
      }
    : {
        heroEyebrow: 'SDK-first · Explicit contracts · Clear ownership',
        title: 'Compose AI coding environments with clear boundaries.',
        description:
          'Brambo is an SDK-first microkernel for integrating executors, workspaces, and tools through explicit contracts.',
        quickStart: 'Start with the quick guide',
        architecture: 'Explore the architecture',
        api: 'API reference',
        eyebrow: 'Choose a starting path',
        note: 'Pick the path that matches what you want to do.',
        cards: [
          {
            eyebrow: 'Adopt',
            title: 'Run your first session',
            description: 'Install the SDK, configure an executor, and receive a typed result.',
            link: 'next/tutorials/first-session',
            linkLabel: 'Open the first session guide',
          },
          {
            eyebrow: 'Extend',
            title: 'Implement an adapter',
            description: 'Start with the public contract and verify the adapter with its clause suite.',
            link: 'next/how-to/create-adapter',
            linkLabel: 'Create an adapter',
          },
          {
            eyebrow: 'Understand',
            title: 'Learn the architecture',
            description: 'Follow the lifecycle and distinguish contracts from security guarantees.',
            link: 'next/explanation/architecture',
            linkLabel: 'Read the architecture guide',
          },
        ] satisfies Pathway[],
        versionTitle: 'Choose a documentation track',
        stable: 'Stable 0.3.0 documentation',
        next: 'Next workspace documentation',
        nextDescription: 'Includes changes that are not yet published.',
      }

  return (
    <Layout>
      <Head>
        <title>Brambo documentation</title>
        <meta name="description" content={copy.description} />
      </Head>
      <main className="homePage">
        <section className="homeHero" aria-labelledby="home-title">
          <div className="container homeHero__inner">
            <div className="homeHero__content">
              <p className="homeHero__eyebrow">{copy.heroEyebrow}</p>
              <h1 id="home-title">{copy.title}</h1>
              <p className="homeHero__lead">{copy.description}</p>
              <div className="homeHero__actions" aria-label={isSpanish ? 'Acciones principales' : 'Primary actions'}>
                <Link className="button button--primary homeButton" to={docsUrl('next/tutorials/first-session')}>
                  {copy.quickStart}
                </Link>
                <Link className="button button--secondary homeButton" to={docsUrl('next/explanation/architecture')}>
                  {copy.architecture}
                </Link>
                <Link className="homeHero__textLink" to={docsUrl('next/reference/api')}>
                  {copy.api}<span aria-hidden="true"> ↗</span>
                </Link>
              </div>
            </div>
            <div className="homeHero__diagram" aria-hidden="true">
              <div className="systemMark">
                <img className="systemMark__center" src={useBaseUrl("/img/brambo.png")} alt="Brambo mascot" />
                <span className="systemMark__node systemMark__node--top">contracts</span>
                <span className="systemMark__node systemMark__node--left">workspace</span>
                <span className="systemMark__node systemMark__node--right">executor</span>
                <span className="systemMark__node systemMark__node--bottom">session</span>
                <span className="systemMark__orbit systemMark__orbit--one" />
                <span className="systemMark__orbit systemMark__orbit--two" />
              </div>
            </div>
          </div>
        </section>

        <section className="homePaths container" aria-labelledby="pathways-title">
          <div className="homeSectionHeading">
            <div>
              <p className="homeSectionHeading__eyebrow">{copy.eyebrow}</p>
              <h2 id="pathways-title">{isSpanish ? 'Documentación para cada paso' : 'Documentation for each step'}</h2>
            </div>
            <p>{copy.note}</p>
          </div>
          <div className="homePathGrid">
            {copy.cards.map((card, index) => (
              <article className="homePathCard" key={card.title}>
                <span className="homePathCard__index" aria-hidden="true">0{index + 1}</span>
                <p className="homePathCard__eyebrow">{card.eyebrow}</p>
                <h3>{card.title}</h3>
                <p className="homePathCard__description">{card.description}</p>
                <Link className="homePathCard__link" to={docsUrl(card.link)}>
                  {card.linkLabel}<span aria-hidden="true"> →</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="homeVersion container" aria-labelledby="version-title">
          <div>
            <p className="homeSectionHeading__eyebrow">{isSpanish ? 'Versiones' : 'Versions'}</p>
            <h2 id="version-title">{copy.versionTitle}</h2>
          </div>
          <div className="homeVersion__links">
            <Link to={docsUrl('')}>{copy.stable}<span aria-hidden="true"> →</span></Link>
            <div>
              <Link to={docsUrl('next/')}>{copy.next}<span aria-hidden="true"> →</span></Link>
              <p>{copy.nextDescription}</p>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
