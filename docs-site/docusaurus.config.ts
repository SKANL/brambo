import type {Config} from '@docusaurus/types'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)

const config: Config = {
  title: 'brambo',
  titleDelimiter: ' | ',
  tagline: 'An SDK-first microkernel for composing AI coding environments',
  url: 'https://skanl.github.io',
  baseUrl: '/brambo/',
  staticDirectories: ['static', 'generated'],
  organizationName: 'SKANL',
  projectName: 'brambo',
  favicon: 'img/favicon.png',
  onBrokenLinks: 'throw',
  stylesheets: [
    {href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap', type: 'text/css'},
  ],
  headTags: [
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.googleapis.com'}},
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous'}},
  ],
  markdown: {mermaid: true, hooks: {onBrokenMarkdownLinks: 'throw'}},
  i18n: {defaultLocale: 'en', locales: ['en', 'es']},
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/SKANL/brambo/tree/main/docs-site/',
          lastVersion: 'current',
          versions: {
            current: {label: '0.5.x'},
          },
        },
        blog: false,
        theme: {customCss: './src/css/custom.css'},
      },
    ],
  ],
  plugins: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en', 'es'],
        indexDocs: true,
        indexBlog: false,
        indexPages: true,
      },
    ],
  ],
  themes: ['@docusaurus/theme-mermaid'],
  themeConfig: {
    mermaid: {theme: {light: 'neutral', dark: 'neutral'}},
    metadata: [
      {name: 'description', content: 'brambo is an SDK-first microkernel for composing AI coding environments.'},
      {name: 'keywords', content: 'brambo, SDK, microkernel, AI coding environments, TypeScript'},
      {property: 'og:site_name', content: 'brambo'},
      {property: 'og:type', content: 'website'},
      {name: 'twitter:card', content: 'summary'},
    ],
    navbar: {
      title: 'brambo',
      logo: {alt: 'brambo panda', src: 'img/favicon.png'},
      items: [
        {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs'},
        {type: 'localeDropdown', position: 'right'},
        {href: 'https://github.com/SKANL/brambo', label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [{title: 'Project', items: [{label: 'GitHub', href: 'https://github.com/SKANL/brambo'}]}],
    },
  },
}
export default config
