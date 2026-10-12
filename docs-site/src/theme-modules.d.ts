// Docusaurus resolves @theme/* at build time; @docusaurus/theme-classic is not a direct
// dependency, so only the components the pages import are declared here for `tsc`.
declare module '@theme/*' {
  import type { ComponentType, ReactNode } from 'react'
  const Component: ComponentType<{ readonly children?: ReactNode; readonly [prop: string]: unknown }>
  export default Component
}
