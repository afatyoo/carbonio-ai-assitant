# Carbonio AI Assistant v1 Beta Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the already verified RC19 core as a transparently documented `v1.0.0-beta.1` GitHub prerelease with aligned metadata, a reproducible archive, curated release notes, and exact-build evidence.

**Architecture:** Keep application and database behavior unchanged. Add a small Node.js release-note composer whose inputs are explicit build metadata, validate it with a self-test, make packaging include the authoritative report, and have GitHub Actions publish the composed report plus immutable commit/run/checksum evidence.

**Tech Stack:** TypeScript/React Carbonio microfrontend, Node.js 22.22.0 gateway and release tooling, Bash packaging, pnpm/npm, GitHub Actions, Markdown.

## Global Constraints

- Root `package.json`, `gateway/package.json`, and both version fields in `gateway/package-lock.json` must be `1.0.0-beta.1`.
- The annotated Git tag and GitHub prerelease must be `v1.0.0-beta.1`; this work must not claim stable `v1.0.0`.
- Preserve Node.js `v22.22.0` in packaged `release.env` and preserve the MIT license.
- Do not alter runtime behavior or database schemas; only release metadata, documentation, packaging, and release-publication behavior may change.
- The authoritative source report is `docs/releases/v1.0.0-beta.1.md`; it must distinguish verified behavior, preview-only checks, executed UAT mutations, open gates, and deferred production RAG.
- A tag may be pushed only after the exact commit passes the full branch CI workflow.

---

## File Structure

- Create `scripts/build-release-notes.mjs`: validate explicit release metadata and compose the GitHub body from the authoritative report plus an immutable verification appendix.
- Create `scripts/self-test-release-report.mjs`: exercise the composer success/failure paths and assert the version/report/repository contract.
- Create `docs/releases/v1.0.0-beta.1.md`: detailed public report, closed-bug ledger, UAT evidence, limitations, and operator instructions.
- Modify `package.json`: beta version and release self-test command.
- Modify `gateway/package.json` and `gateway/package-lock.json`: aligned beta versions only.
- Modify `deploy/package-release.sh`: fail if the matching report is absent and copy it into the archive as `RELEASE_NOTES.md`.
- Modify `.github/workflows/ci.yml`: run the release contract test on every candidate commit.
- Modify `.github/workflows/release.yml`: run the contract test, compose exact-build notes, and publish them with `--notes-file`.
- Modify `README.md`: identify the beta prerelease and link its detailed report.
- Modify `CHANGELOG.md`: add the beta summary, report link, and repair missing/duplicate comparison references.

---

### Task 1: Release-note composer contract

**Files:**
- Create: `scripts/self-test-release-report.mjs`
- Create: `scripts/build-release-notes.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildReleaseNotes({ reportPath, version, tag, commit, runUrl, checksumPath, outputPath })` with string paths/metadata.
- Produces: an async function that validates SemVer/tag/40-character lowercase commit/checksum inputs and writes a GitHub release body; CLI flags use the same property names in kebab case.

- [ ] **Step 1: Write the failing self-test**

  Add a self-test that creates a temporary report and checksum, imports `buildReleaseNotes`, verifies the output contains the source report plus `v1.0.0-beta.1`, an exact 40-character commit, the Actions run URL, and the checksum line, then verifies a mismatched tag rejects with `Tag v1.0.0-beta.2 does not match version 1.0.0-beta.1`.

- [ ] **Step 2: Run the test and confirm RED**

  Run: `node scripts/self-test-release-report.mjs`

  Expected: non-zero exit because `scripts/build-release-notes.mjs` does not exist.

- [ ] **Step 3: Implement the minimal composer**

  Export `buildReleaseNotes`, validate required inputs before writing, read the report and checksum, and append this exact heading structure:

  ```markdown
  ## Exact-build verification

  - Tag: `v1.0.0-beta.1`
  - Commit: `<40 lowercase hexadecimal characters>`
  - Release workflow: <GitHub Actions URL>
  - Artifact checksum: `<checksum line>`
  ```

  Add a direct CLI that requires `--report`, `--version`, `--tag`, `--commit`, `--run-url`, `--checksum`, and `--output`.

- [ ] **Step 4: Register and run the contract test**

  Add `"self-test:release": "node scripts/self-test-release-report.mjs"` to root scripts.

  Run: `pnpm run self-test:release`

  Expected: `release_report_contract=ok` and exit 0.

- [ ] **Step 5: Commit the independent tooling change**

  ```bash
  git add package.json scripts/build-release-notes.mjs scripts/self-test-release-report.mjs
  git commit -m "build: add curated release note contract"
  ```

---

### Task 2: Authoritative beta report and version alignment

**Files:**
- Create: `docs/releases/v1.0.0-beta.1.md`
- Modify: `package.json`
- Modify: `gateway/package.json`
- Modify: `gateway/package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the report path/version convention used by Task 1.
- Produces: one public report containing all 18 approved sections and one version value shared by UI, gateway, package lock, archive, and tag.

- [ ] **Step 1: Expand the contract test for repository metadata**

  Make the self-test read the three package files and require `1.0.0-beta.1`; require the report to contain headings for Executive summary, CI/CD and verification matrix, Complete closed-bug ledger, Live UAT results, Known limitations and open gates, Deferred scope, and Installation/upgrade/rollback; require bug IDs `BUG-001` through `BUG-024`; require README and CHANGELOG to link `docs/releases/v1.0.0-beta.1.md`.

- [ ] **Step 2: Run the expanded test and confirm RED**

  Run: `pnpm run self-test:release`

  Expected: non-zero exit reporting the current `0.0.3-rc.19` version and missing report.

- [ ] **Step 3: Align versions without changing dependencies**

  Change only version metadata in root/gateway manifests and the gateway lockfile root/package entries to `1.0.0-beta.1`; do not regenerate dependency ranges or schemas.

- [ ] **Step 4: Write the complete report from verified evidence**

  Include all approved capabilities and every `BUG-001`–`BUG-024` entry with symptom, cause, resolution, and regression evidence. Record Send ID `439`, Inbox ID `440`, mark-read/move audit execution, PostgreSQL reconnect survival, strict PostgreSQL production health, and that permanent deletion/replay were skipped. Include every external gate from the approved design, the Nginx open-file warning, and the deferred vector/user-workspace RAG scope. Do not include credentials, a live database URL, or unsupported live-test claims.

- [ ] **Step 5: Update public entry points**

  Add a top `1.0.0-beta.1` CHANGELOG entry linking the detailed report, repair missing RC18/RC19 comparison links and the duplicate RC3 reference, and update README status/link copy to say controlled-pilot prerelease rather than stable production release.

- [ ] **Step 6: Verify and commit the report unit**

  Run: `pnpm run self-test:release`

  Expected: `release_report_contract=ok` and exit 0.

  ```bash
  git add package.json gateway/package.json gateway/package-lock.json README.md CHANGELOG.md docs/releases/v1.0.0-beta.1.md scripts/self-test-release-report.mjs
  git commit -m "docs: publish v1 beta release report"
  ```

---

### Task 3: Packaging and GitHub release integration

**Files:**
- Modify: `deploy/package-release.sh`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/self-test-release-report.mjs`

**Interfaces:**
- Consumes: `docs/releases/v${version}.md` and Task 1 CLI.
- Produces: archive member `RELEASE_NOTES.md` and a GitHub prerelease body whose appendix identifies the exact tag, commit, workflow run, and SHA-256 asset.

- [ ] **Step 1: Add packaging/publication assertions to the self-test**

  Require the packaging script to resolve `docs/releases/v${version}.md`, require the CI workflow to invoke `pnpm run self-test:release`, and require the release workflow to invoke `scripts/build-release-notes.mjs` and publish with `--notes-file` instead of `--generate-notes`.

- [ ] **Step 2: Run the test and confirm RED**

  Run: `pnpm run self-test:release`

  Expected: non-zero exit identifying the missing package/workflow contract.

- [ ] **Step 3: Make packaging fail closed and include the report**

  After reading the package version, resolve `release_report="$project_dir/docs/releases/v${version}.md"`, fail with `Release report is missing: ...` if absent, and copy it to `$package_dir/RELEASE_NOTES.md` with the existing README/CHANGELOG/license files.

- [ ] **Step 4: Wire CI and release publication**

  Run `pnpm run self-test:release` in both workflows. After packaging, invoke the composer with `${GITHUB_REF_NAME}`, `${GITHUB_SHA}`, `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`, the generated checksum, and output `release/github-release-notes.md`. Publish assets with `gh release create ... --notes-file release/github-release-notes.md`; retain automatic `--prerelease` for hyphenated SemVer tags.

- [ ] **Step 5: Verify and commit the integration**

  Run: `pnpm run self-test:release`

  Expected: `release_report_contract=ok` and exit 0.

  ```bash
  git add deploy/package-release.sh .github/workflows/ci.yml .github/workflows/release.yml scripts/self-test-release-report.mjs
  git commit -m "ci: publish curated beta release evidence"
  ```

---

### Task 4: Exact-candidate verification and review

**Files:**
- Verify only; modify files only to fix an evidenced failure.

**Interfaces:**
- Consumes: the complete beta candidate.
- Produces: a clean exact commit with local gates passing and reviewer approval before remote publication.

- [ ] **Step 1: Run focused release and metadata checks**

  ```bash
  pnpm run self-test:release
  node -e 'const a=require("./package.json").version,b=require("./gateway/package.json").version,c=require("./gateway/package-lock.json"); if(a!==b||a!==c.version||a!==c.packages[""].version) process.exit(1); console.log(a)'
  ```

  Expected: contract OK and four aligned values `1.0.0-beta.1`.

- [ ] **Step 2: Run the full local non-destructive suite**

  ```bash
  pnpm run lint
  pnpm run type-check
  pnpm run self-test:ui
  pnpm run self-test:deploy
  npm --prefix gateway run check
  npm --prefix gateway run self-test
  pnpm run build
  ```

  Expected: every command exits 0.

- [ ] **Step 3: Verify packaging from a clean commit**

  Commit any evidence-backed corrections, confirm `git status --short` is empty, then run `pnpm run package:release`. Verify the archive is named `carbonio-ai-assistant-v1.0.0-beta.1.tar.gz`, its checksum validates, `RELEASE_NOTES.md` is present, and `release.env` contains version `1.0.0-beta.1`, the current 40-character commit, and Node `v22.22.0`.

- [ ] **Step 4: Request code review**

  Review the range from `3fd1287` through candidate HEAD for spec compliance, accidental runtime/schema changes, release safety, report accuracy, secret disclosure, and test gaps. Resolve every High/Medium finding and rerun the affected gates.

- [ ] **Step 5: Push the branch and require exact-commit CI**

  Push `core-production-completion`, inspect the GitHub Actions run for the candidate SHA, and continue only after CI reports success for that exact SHA. Do not reuse RC19 CI as beta evidence.

---

### Task 5: Tag and publish the prerelease

**Files:**
- Remote Git tag and GitHub prerelease only; do not deploy the beta to the Carbonio pilot host in this task.

**Interfaces:**
- Consumes: the exact CI-green candidate commit.
- Produces: annotated tag `v1.0.0-beta.1`, public prerelease, archive/checksum assets, and exact-build verification in the release body.

- [ ] **Step 1: Create and verify the annotated tag locally**

  ```bash
  git tag -a v1.0.0-beta.1 -m "Carbonio AI Assistant v1.0.0-beta.1"
  git rev-list -n 1 v1.0.0-beta.1
  git rev-parse HEAD
  ```

  Expected: both commit hashes are identical.

- [ ] **Step 2: Push the tag and wait for release workflow success**

  Push only `v1.0.0-beta.1`, then inspect the tag-triggered Release artifact workflow. Expected: lint, type-check, UI/deploy/gateway/PostgreSQL tests, audits, secret scan, packaging, checksum validation, and publication all succeed.

- [ ] **Step 3: Inspect public release integrity**

  Verify GitHub marks the release as prerelease; the body contains all authoritative report sections plus exact tag/commit/run/checksum; both archive and checksum assets exist; the downloaded checksum validates; and the archive embeds matching `release.env` plus `RELEASE_NOTES.md`.

- [ ] **Step 4: Record final evidence and hand off**

  Report the exact commit, CI and Release workflow URLs/IDs, tag URL, release URL, artifact SHA-256, closed-bug count, known open gates, and the explicit boundary that pilot deployment and production-ready RAG remain separate follow-up work.
