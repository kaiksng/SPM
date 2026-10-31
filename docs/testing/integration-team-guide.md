# Integration testing: teammate instructions

As of 2026-10-31, this checkout has 30 application integration cases for SPM-2,
SPM-13 and SPM-14. Of the 57 non-retired stories in Jira export (6), **54 still
need their integration coverage assessed**. This is a story count, not a
promise that exactly 54 more tests are needed. Some ACs belong to UI tests;
one integration case may also support multiple stories. Use the current
[coverage matrix](integration-coverage-matrix.md) when work starts.

The next story in the agreed roadmap is SPM-15. Coordinate with the team so
two people do not unknowingly implement the same increment.

1. **Get the shared testing code and skill.** Use the team's agreed branch/ref
   containing the harness and this guide. If they are not in `main` yet, ask
   the owner for that ref; do not assume a fresh `main` checkout contains them.
   The Codex entry point is
   [the repository skill](../../.agents/skills/spm-integration-testing/SKILL.md).
   Claude Code has a [matching entry point](../../.claude/skills/spm-integration-testing/SKILL.md).
   Both use the same canonical instructions; there is no machine-specific
   installation script or private Kai configuration to copy.
   If the skill is shared as a ZIP, inspect its contents and copy the new
   `.agents/skills/spm-integration-testing`, `.claude/skills/spm-integration-testing`
   and this guide into the repository root, reviewing before overwriting any
   existing version. The ZIP does not replace the required test harness/code.

2. **Prepare your environment and personal branch.** Install/use Node 24,
   pnpm 11 and Docker, and start Docker. Open the repository on your own
   intended working branch and inspect `git status` before syncing. Preserve
   unrelated work. Follow the repository's `git fetch origin main`,
   `git merge origin/main` and `pnpm install` instructions. Do not switch to
   someone else's branch or create a worktree unless that is your agreed setup.

3. **Choose one story and provide current requirements.** Give the agent the
   exact Jira key and your latest CSV path. The export must include Description
   and the acceptance criteria. Story title/status alone is insufficient.
   Avoid pasting credentials or using real attendee data as fixtures.

4. **Invoke the skill with a clear request.** In Codex, select/mention
   `$spm-integration-testing`. If it is not shown, restart the agent or use
   the explicit file-path prompt below. For another agent, ask it to read the
   Claude entry point or the canonical file directly. Discovery alone is not
   evidence the agent actually followed it: its response should identify the
   skill and the inspected story/code.

   Example prompt (replace the story and CSV path):

   ```text
   Use $spm-integration-testing for SPM-15 in this ConnectSphere repository.
   Latest Jira CSV: /path/to/latest-jira.csv
   Use my current branch; do not create or switch branches unless I ask.
   Inspect the code and existing coverage, explain the ACs and business
   steps, and wait for my scope approval before writing tests.
   Reuse the disposable local Supabase harness. Do not use hosted test data.
   After approval, implement only this story. If all scoped checks pass
   and there are no unresolved issues, commit to my current branch.
   Do not push, create a PR, or merge into main or another person's branch.
   ```

   Explicit-path fallback:

   ```text
   Read .agents/skills/spm-integration-testing/SKILL.md and follow it for
   SPM-15. My latest Jira CSV is /path/to/latest-jira.csv. Present the story
   walkthrough and business steps before coding. Use my current branch.
   Do not push, create a PR, or change hosted Supabase.
   ```

   The first prompt explicitly permits a local commit; omit that sentence if
   you want an uncommitted review first. Merging a worktree into a named
   personal branch needs your own authorization. Kai's permission to merge
   into `staging-kk` does not authorize that on every teammate's machine.

5. **Review and approve the walkthrough.** Check the story goal, current
   behaviour, AC mapping, collaborating components, dependencies and gaps.
   Resolve requirement conflicts before implementing the affected criteria.
   Approve the numbered business steps when they match what the team agreed.
   Do not approve changing an assertion merely to match a known product bug.

6. **Let the agent add tests through real application paths.** Files go under
   `tests/integration/` and end in `.integration.test.ts`. Cases carry story/AC
   comments. Reuse the fixtures and optional real backend helper, with synthetic
   accounts and independent data. Check owner/allowed success as well as
   denial, and inspect persisted records and relevant history/notifications.
   Keep screen navigation and visual messages in UI/E2E tests. Several cases
   per story are normal; a new file is not automatically required for each AC.

7. **Run the checks and read their output.** From the repository, use:

   ```sh
   pnpm typecheck:integration
   pnpm test:integration
   pnpm check
   ```

   The integration runner creates and resets its own disposable database,
   runs safety checks and all discovered suites, checks cleanup and removes
   its stack. It does not require hosted keys. Run one integration command at
   a time on a computer because worktrees share fixed test ports. For pgTAP
   verification use `pnpm test:integration:db`, which prepares its own fresh
   database; do not reset the ordinary development or shared hosted database.

8. **Review failures and the diff.** Confirm that tests exercised the real
   service/route and database boundary, that assertions have a justified
   requirement, and that no production guard was weakened. Test fixtures must
   satisfy current constraints, including required coordinator assignments.
   Every created entity needs cleanup. Distinguish fixture mistakes from
   product defects; record both rather than rerunning unchanged code until
   green. Resolve unexplained failures/flakes before merging.

9. **Update evidence for your story.** The agent updates the coverage matrix
   and [results guide](integration-testing.md) with actual counts, AC evidence,
   exclusions, failures and fixes. Existing histories are preserved. The
   remaining story count decreases when that story's scoped coverage is
   implemented and validated, not when a file or Jira Done status appears.
   Other resources/roles may still need tests under their own stories.

10. **Commit or merge locally only within your authorization.** Inspect the
    changed files and ensure no credentials, `.env` files, generated runtime
    directories or private project notes are staged. Commit just the approved
    increment after all checks pass. If you authorized a worktree merge into
    your personal branch, verify that merged checkout too. Leave main and
    other teammates' branches alone.

11. **Push and review a PR as a human.** Push your personal branch and open or
    update its PR according to team practice. Wait for `checks`, `database`,
    `e2e` and `integration` to pass on the latest PR commit. In the integration
    log, confirm your new cases were discovered and the total grew from the
    baseline; a green job that never collected your file is insufficient.
    The existing job runs new suites automatically, so a workflow edit is
    usually unnecessary. Get team review before merging into `main`.

12. **Keep hosted verification separate.** A green local/GitHub suite proves
    the tested paths against disposable infrastructure. Checking deployed
    settings/migrations and performing agreed hosted UAT are separate tasks.
    Never point this reset/fixture suite at the shared Supabase project. Then
    choose the next story with the team and repeat from the current evidence.

Codex repository discovery and invocation reference:
[official OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills).
