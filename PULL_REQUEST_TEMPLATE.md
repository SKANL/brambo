## Outcome

Describe the user-visible result and why this change belongs in panda.

## Scope

- [ ] I kept the change within the stated boundary.
- [ ] I included tests and documentation for behavior that changed.
- [ ] I did not add unsupported platform or security claims.

## Verification

- [ ] `pnpm check`
- [ ] `pnpm build && pnpm proof:consumer-install` (when publishable packages or exports changed)
- [ ] `pnpm docs:check` (when documentation changed)

## Notes for reviewers

Call out compatibility, migration, security, or known limitations here.
