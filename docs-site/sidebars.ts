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
      items: ['guides/host-integration', 'guides/executors-and-workspaces', 'guides/cancellation-timeouts-retries', 'guides/api-executors', 'guides/openai-api-adapter', 'guides/anthropic-api-adapter', 'guides/tools-and-sandbox'],
    },
    {type: 'category', label: 'Orchestrate', items: ['tutorials/durable-workflow', 'guides/durable-orchestration', 'guides/coordinator-and-worker', 'guides/remote-orchestration', 'guides/artifacts', 'reference/durable-semantics']},
    {
      type: 'category',
      label: 'Extend',
      items: ['guides/third-party-executor-providers', 'how-to/create-adapter', 'guides/contract-suites', 'guides/custom-drivers-and-tools', 'how-to/use-workspace-provider', 'how-to/use-memory-provider', 'guides/kernel-contracts'],
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
    {type: 'category', label: 'Reference', items: ['reference/api', 'reference/error-codes', 'guides/configuration', 'reference/compatibility', 'reference/package-status', 'reference/known-limitations', 'reference/claims-and-evidence', 'reference/faq', 'reference/troubleshooting']},
    {type: 'category', label: 'Appendix', items: [{type: 'doc', id: 'how-to/run-cli', label: 'CLI'}]},
    {type: 'category', label: 'Contributing', items: ['guides/contributing', 'contributing/testing']},
  ],
}

export default sidebars
