import type {SidebarsConfig} from '@docusaurus/plugin-content-docs'

const pkg = (names: string[]) => names.map((name) => `packages/${name}`)

const sidebars: SidebarsConfig = {
  docs: [
    {type: 'doc', id: 'index', label: 'Overview'},
    {type: 'category', label: 'Get started', items: ['tutorials/first-session', 'guides/install', 'how-to/package-and-consumer-install']},
    {
      type: 'category',
      label: 'Concepts',
      items: ['explanation/concepts', 'explanation/architecture', 'explanation/kernel', 'explanation/principles', 'explanation/durability', 'explanation/security-boundaries', 'explanation/api-adapter-security', 'explanation/errors',
        {type: 'category', label: 'Architecture decisions', link: {type: 'doc', id: 'explanation/decisions/index'}, items: Array.from({length: 10}, (_, i) => `explanation/decisions/adr-${String(i + 1).padStart(3, '0')}`)},
      ],
    },
    {
      type: 'category',
      label: 'Embed',
      items: ['guides/executors-and-workspaces', 'guides/api-executors', 'guides/openai-api-adapter', 'guides/anthropic-api-adapter', 'guides/tools-and-sandbox', 'guides/configuration'],
    },
    {type: 'category', label: 'Orchestrate', items: ['guides/durable-orchestration', 'guides/remote-orchestration']},
    {
      type: 'category',
      label: 'Extend',
      items: ['guides/third-party-executor-providers', 'how-to/create-adapter', 'guides/custom-drivers-and-tools', 'how-to/use-memory-provider', 'how-to/use-workspace-provider', 'guides/kernel-contracts'],
    },
    {
      type: 'category',
      label: 'Package reference',
      items: [
        {type: 'category', label: 'Core', items: pkg(['contracts', 'kernel'])},
        {type: 'category', label: 'Session world', items: pkg(['session', 'adapter-cli', 'adapter-api', 'adapter-openai', 'adapter-anthropic', 'workspace-local', 'workspace-git-worktree', 'sandbox', 'sandbox-local', 'sandbox-remote'])},
        {type: 'category', label: 'Durable world', items: pkg(['orchestration', 'runtime-local', 'workflow-store-sqlite', 'workflow-coordinator', 'workflow-remote', 'workspace-artifacts-local'])},
        {type: 'category', label: 'Environment world', items: pkg(['registry', 'projection', 'environment'])},
        {type: 'category', label: 'Supporting', items: pkg(['lock', 'memory-filesystem', 'memory-sqlite', 'provenance', 'delegation', 'adapter-acp', 'cli'])},
      ],
    },
    {type: 'category', label: 'Reference', items: ['reference/api', 'reference/compatibility', 'reference/claims-and-evidence', 'reference/faq', 'reference/troubleshooting']},
    {type: 'category', label: 'Appendix', items: ['how-to/run-cli']},
    {type: 'category', label: 'Contributing', items: ['guides/contributing', 'contributing/testing']},
  ],
}

export default sidebars
