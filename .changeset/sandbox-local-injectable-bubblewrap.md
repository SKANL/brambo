---
'@brambodev/sandbox-local': patch
---

Make the Linux provider's bubblewrap discovery injectable through `bubblewrapProbe` and `bubblewrapEvidenceProbe`. The capability is discovered by running a binary, so a test that reads it asserts whatever the host happens to provide; the seams let each prlimit argv shape be stated by the test instead of inferred from the runner.
