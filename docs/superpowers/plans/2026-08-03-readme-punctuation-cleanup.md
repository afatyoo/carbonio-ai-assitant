# README Punctuation Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove em dashes and semicolons from the English operator README without changing technical meaning.

**Architecture:** Extend the existing README release contract with punctuation guards, then rewrite only affected README prose. Preserve code blocks, commands, URLs, identifiers, version data, and operational behavior.

**Tech Stack:** Markdown and the existing Node.js 22 release-contract test.

## Global Constraints

- Modify README prose only, plus its narrowly scoped contract test.
- Do not alter application, gateway, deployment, dependency, release, or server behavior.
- Preserve all commands, URLs, paths, hashes, identifiers, and technical claims.
- Keep the README fully English and operator-first.

---

### Task 1: Add punctuation regression guards

**Files:**
- Modify: `scripts/self-test-release-report.mjs`

**Interfaces:**
- Consumes: `repositoryReadme`, already loaded by the release-contract test.
- Produces: assertions that reject Unicode em dashes and semicolons in `README.md`.

- [ ] Add `assert.doesNotMatch(repositoryReadme, /—/)` and
  `assert.doesNotMatch(repositoryReadme, /;/)` after the README section assertions.
- [ ] Run the release-contract test and verify it fails against the existing punctuation.
- [ ] Commit with `test: reject awkward readme punctuation`.

### Task 2: Rewrite affected README prose

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the approved punctuation rules and existing operator guide.
- Produces: the same guide with no em dash or semicolon.

- [ ] Locate every `—` and `;` in `README.md`, classify its sentence role, and replace it
  with a comma, period, colon, parentheses, or rewritten sentence.
- [ ] Re-scan `README.md` and confirm both character counts are zero.
- [ ] Run the release contract, local-link validation, and `git diff --check`.
- [ ] Commit with `docs: simplify readme punctuation`.

### Task 3: Verify and publish

**Files:**
- Verify: `README.md`
- Verify: `scripts/self-test-release-report.mjs`

**Interfaces:**
- Consumes: the two completed commits.
- Produces: a clean, tested fast-forward update on `main`.

- [ ] Run type-check, lint, UI contracts, deployment smoke, release contract, build, gateway
  syntax check, and gateway self-tests.
- [ ] Confirm the diff is limited to README cleanup, its contract guard, and approved process
  documentation.
- [ ] Fetch `origin`, confirm a fast-forward push remains possible, and push `HEAD:main`
  without force.
- [ ] Wait for exact-head GitHub CI and report its result.
