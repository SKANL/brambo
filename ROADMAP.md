# Roadmap

Brambo is an SDK-first microkernel. The roadmap is evidence-led: capabilities become promises only after a real consumer and executable proof exist.

## Current direction

- Make the contracts-only port-authoring path easy to discover and verify.
- Keep native projection ownership and reversible lifecycle behavior honest across supported executors.
- Improve provider capability evidence and fail-closed sandbox behavior without claiming unsupported operating-system guarantees.
- Make documentation, packaging, and release evidence easy for external contributors to reproduce.

## Deliberately not promised

Remote execution, arbitrary JavaScript tool handlers, and Windows/macOS isolation are not promised merely because a type or adapter seam exists. See the README and package documentation for current boundaries.

For detailed implementation history and deferred decisions, see `_bmad-output/planning-artifacts/` and `_bmad-output/implementation-artifacts/deferred-work.md`.
