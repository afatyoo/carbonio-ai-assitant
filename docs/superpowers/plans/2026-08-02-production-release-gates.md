# Production Release Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production smoke checks fail closed unless PostgreSQL history is active, and make every GitHub tag release run the same core regression, PostgreSQL reconnect, audit, and secret-scan gates as pull-request CI.

**Architecture:** Exercise the real `deploy/smoke-test.sh` against a local HTTP fixture so the SQLite fallback is proven to fail before changing the script. Keep CI and Release workflows aligned around PostgreSQL 16, then publish the change as `0.0.3-rc.17` because RC16 is already tagged and deployed.

**Tech Stack:** Bash, Node.js 22, GitHub Actions YAML, PostgreSQL 16, npm/pnpm.

## Global Constraints

- Production history backend must be exactly `postgresql`; SQLite remains development-only.
- Gateway must remain loopback-only and all existing health/header/admin-auth/CSRF smoke gates must remain active.
- Release tags must equal the root package version and package the exact Git commit.
- Release workflow must run gateway syntax/self-tests, real PostgreSQL disconnect/reconnect, dependency audits, and gitleaks before publishing.
- Production-ready vector/user-workspace RAG remains out of scope.

---

### Task 1: Fail-closed production smoke and complete tag-release gates

**Files:**
- Create: `deploy/self-test-smoke.mjs`
- Modify: `deploy/smoke-test.sh`
- Modify: `package.json`
- Modify: `gateway/package.json`
- Modify: `gateway/package-lock.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `CHANGELOG.md`
- Include: `docs/superpowers/plans/2026-08-02-production-release-gates.md`

**Interfaces:**
- Consumes: `CARBONIO_AI_BASE_URL` accepted by `deploy/smoke-test.sh`.
- Produces: root npm script `self-test:deploy`; release version `0.0.3-rc.17` across root and gateway manifests.

- [ ] **Step 1: Write the failing real smoke test**

  Create `deploy/self-test-smoke.mjs` that starts a local HTTP server on an ephemeral loopback port. It must return required security headers, `401` for `/api/ai/admin/metrics`, `403` for cross-origin `/api/ai/chat`, and a configurable health body. Spawn the real shell script twice:

  ```js
  const sqlite = await runSmoke({ status: 'ok', enabled: true, historyBackend: 'sqlite' });
  assert.notEqual(sqlite.status, 0, 'production smoke must reject SQLite history');

  const postgres = await runSmoke({ status: 'ok', enabled: true, historyBackend: 'postgresql' });
  assert.equal(postgres.status, 0, postgres.stderr);
  ```

  The fixture must assert the success output includes a PostgreSQL-history marker and always close the HTTP server.

- [ ] **Step 2: Run the smoke test and verify RED**

  Run: `node deploy/self-test-smoke.mjs`

  Expected: FAIL because current `deploy/smoke-test.sh` accepts `historyBackend: "sqlite"`.

- [ ] **Step 3: Make production smoke fail closed**

  Change the health assertion to require exactly:

  ```jq
  .status == "ok" and .enabled == true and .historyBackend == "postgresql"
  ```

  Preserve the existing header, loopback, Nginx, admin-auth, and CSRF checks. Include `history=postgresql` in the final success line.

- [ ] **Step 4: Run the smoke test and verify GREEN**

  Run: `node deploy/self-test-smoke.mjs`

  Expected: `smoke_sqlite_rejected=ok smoke_postgresql=ok` with exit code `0`.

- [ ] **Step 5: Add the deployment test to normal CI**

  Add root script:

  ```json
  "self-test:deploy": "node deploy/self-test-smoke.mjs"
  ```

  Run it in `.github/workflows/ci.yml` after UI contracts and before packaging/build gates.

- [ ] **Step 6: Align the tag release workflow with the full core gate**

  Add a healthy PostgreSQL 16 service using the same `carbonio_ai_test` role/database as CI. Install gateway dependencies without omitting test execution needs. Run:

  ```bash
  pnpm run self-test:deploy
  npm --prefix gateway run check
  npm --prefix gateway run self-test
  AI_TEST_DATABASE_URL=postgresql://carbonio_ai_test:carbonio_ai_test@127.0.0.1:5432/carbonio_ai_test npm --prefix gateway run self-test:postgres
  pnpm audit --audit-level high
  npm --prefix gateway audit --audit-level high
  ```

  Add `gitleaks/gitleaks-action@v2.3.9` with `GITHUB_TOKEN` before artifact publication.

- [ ] **Step 7: Bump RC metadata and changelog**

  Set root, gateway, and gateway lockfile versions to `0.0.3-rc.17`. Add a dated changelog entry describing strict PostgreSQL smoke enforcement and tag-release parity.

- [ ] **Step 8: Run the complete verification suite**

  Run:

  ```bash
  pnpm run lint
  pnpm run type-check
  pnpm run self-test:ui
  pnpm run self-test:deploy
  npm --prefix gateway run check
  npm --prefix gateway run self-test
  pnpm run build
  git diff --check
  ```

  Expected: all commands exit `0`.

- [ ] **Step 9: Commit**

  ```bash
  git add .github/workflows/ci.yml .github/workflows/release.yml CHANGELOG.md package.json gateway/package.json gateway/package-lock.json deploy/smoke-test.sh deploy/self-test-smoke.mjs docs/superpowers/plans/2026-08-02-production-release-gates.md
  git commit -m "ci: enforce production release gates"
  ```
