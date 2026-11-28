---
'@brambodev/contracts': minor
'@brambodev/session': minor
---

Let a workspace provider renew its claim on a live workspace. `WorkspaceProvider` gains an optional `renew(id)`, with a contract clause that passes when it is absent and requires a coded refusal for an id the provider does not own. A session renews after every successful turn, best effort, so a finished turn is never turned into a failure by bookkeeping.
