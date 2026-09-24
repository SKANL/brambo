import type {SidebarsConfig} from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docs: [
    {type: 'doc', id: 'index', label: 'Overview'},
    {type: 'category', label: 'Learn', items: ['tutorials/first-session']},
    {type: 'category', label: 'Guides', items: ['guides/install', 'guides/configuration', 'guides/executors-and-workspaces', 'guides/api-executors', 'guides/openai-api-adapter', 'guides/anthropic-api-adapter', 'guides/third-party-executor-providers', 'guides/tools-and-sandbox', 'guides/kernel-contracts', 'guides/contributing', 'contributing/testing']},
    {type: 'category', label: 'How-to', items: ['how-to/create-adapter', 'how-to/use-memory-provider', 'how-to/use-workspace-provider', 'how-to/run-cli', 'how-to/package-and-consumer-install']},
    {type: 'category', label: 'Concepts', items: ['explanation/architecture', 'explanation/concepts', 'explanation/security-boundaries', 'explanation/api-adapter-security', 'explanation/errors']},
    {type: 'category', label: 'Package reference', items: ['packages/adapter-api', 'packages/adapter-anthropic', 'packages/adapter-cli', 'packages/adapter-openai', 'packages/cli', 'packages/contracts', 'packages/delegation', 'packages/environment', 'packages/kernel', 'packages/lock', 'packages/memory-filesystem', 'packages/memory-sqlite', 'packages/orchestration', 'packages/projection', 'packages/provenance', 'packages/registry', 'packages/session', 'packages/sandbox', 'packages/sandbox-local', 'packages/sandbox-remote', 'packages/workspace-git-worktree', 'packages/workspace-local']},
    {type: 'category', label: 'API', items: ['reference/api', 'reference/compatibility', 'reference/claims-and-evidence', 'reference/faq']},
    {type: 'category', label: 'Troubleshooting', items: ['reference/troubleshooting']},
  ],
}

export default sidebars
