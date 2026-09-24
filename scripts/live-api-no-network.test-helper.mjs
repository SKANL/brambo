// Imported into every Vitest process/worker by the direct-suite guard tests.
// A broken guard cannot accidentally contact a provider during RED verification.
globalThis.fetch = () => {
  console.log('NETWORK_CALL_FORBIDDEN')
  throw new Error('NETWORK_CALL_FORBIDDEN')
}
