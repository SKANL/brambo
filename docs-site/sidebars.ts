import type {SidebarsConfig} from '@docusaurus/plugin-content-docs'

const pkg = (names: string[]) => names.map((name) => `packages/${name}`)

const sidebars: SidebarsConfig = {
  docs: [
    {type: 'doc', id: 'index', label: 'Overview'},
    {type: 'category', label: 'Learn', items: ['tutorials/first-session']},
    {type: 'category', label: 'Guides', items: ['guides/install', 'guides/configuration', 'guides/executors-and-workspaces', 'guides/api-executors', 'guides/openai-api-adapter', 'guides/anthropic-api-adapter', 'guides/third-party-executor-providers', 'guides/tools-and-sandbox', 'guides/custom-drivers-and-tools', 'guides/durable-orchestration', 'guides/remote-orchestration', 'guides/kernel-contracts', 'guides/contributing', 'contributing/testing']},
    {type: 'category', label: 'How-to', items: ['how-to/create-adapter', 'how-to/use-memory-provider', 'how-to/use-workspace-provider', 'how-to/run-cli', 'how-to/package-and-consumer-install']},
    {type: 'category', label: 'Concepts', items: ['explanation/architecture', 'explanation/concepts', 'explanation/security-boundaries', 'explanation/api-adapter-security', 'explanation/errors']},
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
    {type: 'category', label: 'API', items: ['reference/api', 'reference/compatibility', 'reference/claims-and-evidence', 'reference/faq']},
    {type: 'category', label: 'Troubleshooting', items: ['reference/troubleshooting']},
  ],
}

export default sidebars
