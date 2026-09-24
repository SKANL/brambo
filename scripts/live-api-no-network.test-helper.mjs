// Imported into every Vitest process/worker by the direct-suite guard tests.
// A broken guard cannot accidentally contact a provider during RED verification.
globalThis.fetch = () => { throw new Error('NETWORK_CALL_FORBIDDEN') }
