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
