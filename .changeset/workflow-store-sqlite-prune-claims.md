---
'@brambodev/workflow-store-sqlite': patch
---

Prune lease claim rows that are released, superseded or expired so the table stays bounded; fencing epochs are preserved.
