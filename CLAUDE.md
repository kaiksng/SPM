# CLAUDE.md

Project instructions shared by all AI agents live in AGENTS.md and are imported here so Claude Code and other agents follow the same rules:

@AGENTS.md

## Claude Code specifics

- **Plan before non-trivial work.** For a new feature, schema change or anything touching several packages, read the relevant contract in `docs/requirements` and the existing code first, propose the approach, and wait for confirmation before editing.
- **Verify, don't assume.** After a change, run the narrowest useful check first (`pnpm --filter @spm/<package> test` / `typecheck`), then `pnpm check` before reporting the work as done. Report failures with their output rather than summarising them away.
- **IMPORTANT: never write to the shared hosted Supabase project** (`--linked` commands, signups, inserts) unless the user asks in that turn. Read-only diagnosis is fine; prefer local Supabase or mocked tests.
- Writing tests: follow "Testing instructions" in AGENTS.md exactly. Mock every service a page and its children import, and query anything that appears after an interaction with `findBy…`.
- UAT test cases for stories: use the `spm-uat-case-generation` skill in `.claude/skills/`.
- Keep this file and AGENTS.md short and current. When a rule here turns out wrong, fix the file rather than working around it.
