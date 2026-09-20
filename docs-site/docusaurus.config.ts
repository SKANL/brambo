import type {Config} from '@docusaurus/types'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)

const config: Config = {
  title: 'panda',
  tagline: 'An SDK-first microkernel for composing AI coding environments',
  url: 'https://skanl.github.io',
  baseUrl: '/panda/',
  staticDirectories: ['static', 'generated'],
  organizationName: 'SKANL',
  projectName: 'panda',
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
          editUrl: 'https://github.com/SKANL/panda/tree/main/docs-site/',
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
      {name: 'description', content: 'panda is an SDK-first microkernel for composing AI coding environments.'},
      {name: 'keywords', content: 'panda, SDK, microkernel, AI coding environments, TypeScript'},
    ],
    navbar: {
      title: 'panda',
      items: [
        {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs'},
        {type: 'localeDropdown', position: 'right'},
        {href: 'https://github.com/SKANL/panda', label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [{title: 'Project', items: [{label: 'GitHub', href: 'https://github.com/SKANL/panda'}]}],
    },
  },
}
export default config
