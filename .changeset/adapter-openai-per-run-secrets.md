---
'@brambodev/adapter-openai': patch
---

Track secrets per run instead of a shared mutable credential so rotating credentials and concurrent runs stay redacted.
