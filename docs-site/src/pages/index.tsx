import React from 'react'
import Layout from '@theme/Layout'
import Link from '@docusaurus/Link'

export default function Home(): React.JSX.Element {
  return (
    <Layout>
      <main className="container margin-vert--lg">
        <h1>panda</h1>
        <p>An SDK-first microkernel for composing AI coding environments.</p>
        <Link className="button button--primary" to="/docs/">
          Read the documentation
        </Link>
      </main>
    </Layout>
  )
}
