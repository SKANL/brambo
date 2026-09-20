import type {Config} from '@docusaurus/types'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)

const config: Config = {
  title: 'brambo',
  tagline: 'An SDK-first microkernel for composing AI coding environments',
  url: 'https://skanl.github.io',
  baseUrl: '/brambo/',
  staticDirectories: ['static', 'generated'],
  organizationName: 'SKANL',
  projectName: 'brambo',
  favicon: 'img/favicon.ico',
  onBrokenLinks: 'throw',
  markdown: {hooks: {onBrokenMarkdownLinks: 'throw'}},
  i18n: {defaultLocale: 'en', locales: ['en', 'es']},
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/SKANL/brambo/tree/main/docs-site/',
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
  themeConfig: {
    metadata: [
      {name: 'description', content: 'brambo is an SDK-first microkernel for composing AI coding environments.'},
      {name: 'keywords', content: 'brambo, SDK, microkernel, AI coding environments, TypeScript'},
    ],
    navbar: {
      title: 'brambo',
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
