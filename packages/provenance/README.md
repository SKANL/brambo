# @brambodev/provenance

Content-bound provenance primitives for brambo. A receipt identifies the exact base, paths, modes and bytes that were reviewed. It does not run a reviewer or claim that external evidence is authoritative.

`ReviewReport` adds the same boundary for findings: every finding requires evidence and a causal classification. Only `introduced`, `behavior-activated`, and `worsened` blockers prevent delivery; `pre-existing`, `base-only`, and `unknown` findings remain visible without being silently treated as regressions. Reports are validated against the current target hash before this decision is made.
