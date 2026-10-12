# CLAUDE.md

Project instructions for all AI agents live in AGENTS.md. It is the single source of truth; do not duplicate its content here.

@AGENTS.md

## Claude Code specifics

- Use plan mode (or propose a plan and wait) before non-trivial work, as AGENTS.md's "Working on a user story" requires.
- UAT test cases for stories: use the `spm-uat-case-generation` skill in `.claude/skills/`. For rewriting stories or acceptance criteria use `spm-user-story-refinement`.
- Personal preferences live in `CLAUDE.local.md` (not committed).
- When a story changes the schema, a shared pattern, a story's status or an agreed decision, update `.claude/project-knowledge.md` and its changelog in the same session.
- Keep this file and AGENTS.md short and current. When a rule turns out wrong, fix the file rather than working around it.
