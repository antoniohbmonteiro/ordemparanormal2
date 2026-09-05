# CLAUDE.md

## Project contract

Before making code changes, read `AGENTS.md`. It is the shared repository contract for architecture, domain rules, Foundry boundaries, language, validation, releases, and Git discipline.

Follow it unless the user explicitly overrides a project choice for the current task.

## Working method

1. Inspect the current files relevant to the request before proposing or implementing changes.
2. Do not infer repository behavior from filenames, old docs, previous Ordem systems, or Foundry v13 patterns.
3. Treat current code and tests as implemented truth. Use `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/PLAYTEST_FEATURE_NOTES.md`, and `docs/ROADMAP.md` as design context, but flag documentation drift when it conflicts with current code.
4. Verify current Foundry v14 public APIs when framework behavior is uncertain.
5. Prefer small, typed, incremental changes that preserve existing architecture.
6. Keep game rules in pure/domain code when practical; keep Foundry and DOM concerns at adapters/application boundaries.
7. Do not invent playtest mechanics, formulas, relationships, persistence, tie rules, or automation.
8. Do not introduce generic engines or broad abstractions for hypothetical future features.

## Plan reviews

When asked to review a Plan, return only one of these verdicts:

- `SIM` only when the Plan is fully implementable as written with no required changes.
- `NÃO` if any required change exists, and explain exactly what must be corrected before implementation.

Never approve a Plan and then add corrections or caveats.

## Language

- Player/GM-facing UI text: Portuguese (Brazil).
- Code identifiers, files, classes, functions, types, tests, architecture names, and commits: English.
- Code comments: English, only when useful.

## Validation

During implementation, run focused tests for the touched behavior.

Before declaring a code change complete, run:

```bash
npm run check
```

If Foundry runtime behavior changed, also provide a concise manual Foundry v14 smoke test.

## Commit authorship and attribution

- Never add `Co-Authored-By`, `Co-authored-by`, `Signed-off-by`, `Generated-by`, `Assisted-by`, AI attribution, Claude attribution, Anthropic attribution, or similar attribution trailers to commits unless the user explicitly requests them.
- Never identify Claude, Anthropic, an AI model, an AI coding agent, or an AI tool as an author, co-author, committer, contributor, or collaborator of the project.
- Never use `git commit --author` to attribute a commit to Claude, Anthropic, an AI model, an AI coding agent, or another identity.
- Never set or override `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, or `GIT_COMMITTER_EMAIL`.
- Never modify the repository or global `user.name` or `user.email` Git configuration.
- All commits must use the user's existing configured Git author and committer identity.
- Never add Claude, Anthropic, or another AI tool to `AUTHORS`, `CONTRIBUTORS`, package metadata, system authors, release notes, acknowledgements, or similar contributor metadata unless the user explicitly requests it.
- Suggested commit messages must contain only the Conventional Commit message. Do not append attribution trailers.
- If an external tool automatically proposes attribution metadata, remove it before committing.
- If preserving the user's Git identity cannot be guaranteed, do not create the commit; report the problem instead.

## Change safety

- Preserve unrelated user changes.
- Do not force-push.
- Do not create or push tags/releases unless explicitly requested.
- Do not bump versions unless the task includes a release/version change.
- Do not copy protected official prose or artwork.

## Delivery

For implementation work, finish with:

- summary;
- changed files;
- validation performed;
- manual smoke test when relevant;
- `git add` command;
- suggested Conventional Commit;
- push command when appropriate.

When suggesting a commit, provide only the commit message itself. Never append attribution, co-author, sign-off, generated-by, or AI-related trailers.
