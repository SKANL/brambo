---
title: Architecture decisions
audience: Developers evaluating brambo and contributors
prerequisites: None
outcome: Find the recorded reason behind each structural choice in brambo
scope: Index of architecture decision records
compatibility: brambo 0.5.x
translationStatus: original
---
# Architecture decisions

These records explain why brambo's boundaries sit where they do. Each one states the context, the decision, its consequences, and the files in the repository that enforce or embody it, so you can check the claim against the code. Source comments refer to the first two as AD-1 and AD-2.

| Record | Decision |
|---|---|
| [ADR-001](./adr-001) | Zero-dependency microkernel |
| [ADR-002](./adr-002) | Ports in contracts and an enforced downward topology |
| [ADR-003](./adr-003) | Three worlds over a shared core |
| [ADR-004](./adr-004) | Fail-closed, hand-written validation behind Standard Schema |
| [ADR-005](./adr-005) | Version by reject, never migrate |
| [ADR-006](./adr-006) | Vendor CLIs as trait records; API executors through an explicit registry |
| [ADR-007](./adr-007) | brambo is not a sandbox; authority is host-owned |
| [ADR-008](./adr-008) | Single-authority SQLite run store with CAS, leases and fencing |
| [ADR-009](./adr-009) | Projection under an ownership ledger |
| [ADR-010](./adr-010) | Freeze the ACP client |

A new record is added when a change alters one of these boundaries; an existing record is superseded rather than rewritten.
