# README Punctuation Cleanup Design

**Date:** 2026-08-03

## Objective

Make the English operator README read more naturally by removing em dashes and semicolons
from prose without changing technical meaning or application behavior.

## Scope

- Replace every em dash in `README.md` prose with a comma, period, colon, parentheses, or a
  rewritten sentence appropriate to the surrounding meaning.
- Replace prose and list-item semicolons with periods, commas, or separate list items.
- Preserve code blocks, shell commands, URLs, paths, identifiers, version numbers, hashes,
  environment-variable names, and documented operational behavior exactly.
- Keep the README fully English and retain the operator-first structure.
- Do not modify application, gateway, deployment, dependency, release, or server behavior.

## Validation

- `README.md` contains no Unicode em dash and no semicolon.
- The release-report README contract remains green.
- Every local Markdown link still resolves.
- `git diff --check` reports no formatting errors.
- The final diff contains punctuation/copy changes only in the README, plus documentation
  process artifacts and any narrowly required contract assertion.
