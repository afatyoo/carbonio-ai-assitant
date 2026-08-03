# Operator-First README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brief README with a complete English operator-first guide for Carbonio AI Assistant v1.0.0.

**Architecture:** Keep `README.md` as the shortest complete operational path and link to the detailed stable release report, provider policy, browser support, and UAT runbook for exhaustive evidence. Extend the existing release-contract test so critical README claims—especially the RAG boundary, all eight accepted external limitations, and lifecycle commands—cannot silently disappear.

**Tech Stack:** Markdown, Node.js 22 release-contract tests, Bash deployment scripts, Carbonio Iris/Nginx/systemd, PostgreSQL.

## Global Constraints

- The README is fully English and operator-first.
- Version-specific claims target exact stable release `v1.0.0`.
- Production deployment uses the public release archive and portable SHA-256 file.
- Commands must match the shipped scripts under `deploy/`.
- No credential, API key, session cookie, or production secret may be embedded.
- Full mailbox/files/workspace vector RAG is deferred and must not be presented as implemented.
- The eight accepted external gates remain known limitations, not passing evidence.
- This documentation change must not modify application or deployment behavior.

---

### Task 1: Protect the README operational contract

**Files:**
- Modify: `scripts/self-test-release-report.mjs`
- Test: `scripts/self-test-release-report.mjs`

**Interfaces:**
- Consumes: repository-root `README.md` and the existing Node `assert` test harness.
- Produces: release-contract assertions for required README headings, stable artifact identity, RAG boundary, eight known limitations, service name, and deployment lifecycle commands.

- [ ] **Step 1: Add failing README assertions**

Read `README.md` after package-version validation and assert that it contains these exact
operational anchors:

```js
const repositoryReadme = await readFile(path.join(projectRoot, 'README.md'), 'utf8');
for (const heading of [
	'## What v1.0.0 includes',
	'## RAG scope',
	'## Known limitations',
	'## Production deployment',
	'## Upgrade',
	'## Rollback',
	'## Uninstall',
	'## Troubleshooting'
]) {
	assert.match(repositoryReadme, new RegExp(`^${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'm'));
}
assert.match(repositoryReadme, /carbonio-ai-assistant-v1\.0\.0\.tar\.gz/);
assert.match(repositoryReadme, /carbonio-ai-gateway\.service/);
assert.match(repositoryReadme, /not full mailbox, attachment, file, or workspace vector RAG/i);
for (const limitation of [
	'logout/login/login-again',
	'Firefox desktop and narrow-layout',
	'real non-administrator Settings boundary',
	'large-mailbox',
	'live attachment',
	'remaining calendar mutation lifecycle',
	'Carbonio upgrade rehearsal',
	'separate staging and PostgreSQL replica/failover'
]) {
	assert.match(repositoryReadme, new RegExp(limitation, 'i'));
}
for (const command of ['install.sh', 'smoke-test.sh', 'rollback.sh', 'uninstall.sh']) {
	assert.match(repositoryReadme, new RegExp(command.replace('.', '\\\\.')));
}
```

- [ ] **Step 2: Run the contract to prove it fails on the brief README**

Run: `pnpm run self-test:release`

Expected: FAIL because `README.md` does not yet contain `## RAG scope` and the other
operator sections.

- [ ] **Step 3: Commit the failing contract**

```bash
git add scripts/self-test-release-report.mjs
git commit -m "test: require operator readme coverage"
```

### Task 2: Write the operator-first README

**Files:**
- Modify: `README.md`
- Reference: `docs/releases/v1.0.0.md`
- Reference: `docs/provider-data-policy.md`
- Reference: `docs/browser-support.md`
- Reference: `docs/uat-runbook.md`
- Reference: `deploy/README.md`
- Reference: `deploy/install.sh`
- Reference: `deploy/setup-postgres.sh`
- Reference: `deploy/set-api-key.sh`
- Reference: `deploy/backup-postgres.sh`
- Reference: `deploy/restore-postgres.sh`
- Reference: `deploy/rollback.sh`
- Reference: `deploy/smoke-test.sh`
- Reference: `deploy/uninstall.sh`

**Interfaces:**
- Consumes: the exact v1.0.0 feature/evidence record and shipped operator scripts.
- Produces: a single English README that serves as the repository landing page and complete production-pilot operating path.

- [ ] **Step 1: Replace the introduction and capability inventory**

Write the title, stable-release badge/link, screenshot, support statement, and sections
`What v1.0.0 includes`, `RAG scope`, `Architecture`, and `Tested environment`. State that
the addon is a separate Carbonio microfrontend plus loopback gateway and that the current
knowledge feature is a curated lexical Carbonio API documentation index—not mailbox,
attachment, file, or workspace vector RAG.

- [ ] **Step 2: Document usage and safety boundaries**

Add user workflows for opening the robot-icon route, selecting an administrator-allowed
model, asking bounded email/calendar questions, reviewing exact mutation previews,
confirming once, and managing conversation history. Add administrator workflows for
provider/model policy, account enablement, quotas, tool permissions, kill switches, and
request-ID/audit review. Explicitly describe Carbonio-session scoping, credentials,
PostgreSQL ownership, data minimization, OpenRouter `data_collection: "deny"` plus
`zdr: true`, and the limits of free-model evaluation.

- [ ] **Step 3: Add the exact known-limitations section**

List all eight accepted external gates verbatim in meaning: logout/login/login-again,
Firefox desktop/narrow, real non-admin boundary, large mailbox, live attachment, remaining
calendar mutation/replay, Carbonio upgrade rehearsal, and separate staging plus PostgreSQL
replica/failover. State that risk acceptance permitted v1.0.0 but did not convert these
items into passes. Also mention the skipped optional permanent-delete/replay and `AI-UAT`
tag/folder lifecycle.

- [ ] **Step 4: Document production prerequisites and verified download**

Include Carbonio Iris/Nginx, root access, PostgreSQL, `curl`, `jq`, `tar`, `systemctl`,
`sha256sum`, outbound Node/provider access, and trusted Carbonio TLS as prerequisites.
Show a version-pinned download into a dedicated directory, download of both assets, and:

```bash
sha256sum --check carbonio-ai-assistant-v1.0.0.tar.gz.sha256
tar -xzf carbonio-ai-assistant-v1.0.0.tar.gz
cd carbonio-ai-assistant-v1.0.0
```

State the published archive SHA-256:
`1f1b1695a3ec4a084627ded3a111f4b29c3a45a82149da10bec22a04404d6e4f`.

- [ ] **Step 5: Document database, environment, and credential configuration**

Use the shipped helpers instead of inventing SQL or secret-storage commands. Document
running `setup-postgres.sh`, configuring `/etc/carbonio-ai-assistant/gateway.env` with
site-specific non-secret policy values, and installing the provider key with
`set-api-key.sh`. Explain that the production smoke test requires
`historyBackend=postgresql`, `AI_ADMIN_ACCOUNTS` is fail-closed when empty, and provider
URLs/models remain restricted by administrator allowlists.

- [ ] **Step 6: Document install, verify, upgrade, rollback, and uninstall**

Use the exact commands:

```bash
sudo ./install.sh
sudo /opt/carbonio-ai-assistant/bin/smoke-test.sh
systemctl status carbonio-ai-gateway.service --no-pager
sudo /opt/carbonio-ai-assistant/bin/backup-postgres.sh
sudo /opt/carbonio-ai-assistant/bin/rollback.sh <40-character-commit> --yes
sudo ./uninstall.sh
sudo ./uninstall.sh --yes --purge-data
```

Require backup catalog validation before upgrade, explain versioned UI/gateway releases,
forward-only database migrations, authenticated browser verification, default preserved
data on uninstall, and the destructive irreversible meaning of `--purge-data`.

- [ ] **Step 7: Add troubleshooting and developer paths**

Cover HTML parsed as JSON, HTTP 405, empty streamed answers, health failures,
`journalctl -u carbonio-ai-gateway.service`, Nginx validation, PostgreSQL backend checks,
and visible request-ID correlation. Finish with local Node 22/pnpm 10 setup, repository
structure, exact verification commands, documentation links, roadmap/deferred RAG, and MIT
license.

- [ ] **Step 8: Run the README contract and formatting checks**

Run:

```bash
pnpm run self-test:release
git diff --check
```

Expected: `release_report_contract=ok` and no whitespace errors.

- [ ] **Step 9: Commit the README**

```bash
git add README.md
git commit -m "docs: add production operator guide"
```

### Task 3: Verify the complete documentation change

**Files:**
- Verify: `README.md`
- Verify: `scripts/self-test-release-report.mjs`
- Verify: all local links referenced by `README.md`

**Interfaces:**
- Consumes: completed README and repository test/build scripts.
- Produces: evidence that the documentation is internally consistent and did not regress release gates.

- [ ] **Step 1: Validate local Markdown targets and forbidden placeholders**

Extract relative Markdown targets from `README.md`, ignore `http`, fragment, and image
URLs, then assert every remaining target exists. Search for `TBD`, `TODO`, `FIXME`, secret
patterns, stale release versions, and commands/options not present in `deploy/` scripts.

- [ ] **Step 2: Run full repository verification**

Run:

```bash
pnpm run type-check
pnpm run lint
pnpm run self-test:ui
pnpm run self-test:deploy
pnpm run self-test:release
pnpm run build
npm --prefix gateway run check
npm --prefix gateway run self-test
```

Expected: every command exits zero; release test prints `release_report_contract=ok` and
gateway tests finish with all self-test success markers.

- [ ] **Step 3: Review the final diff against the approved design**

Confirm the README is English-only, operator-first, accurately states current RAG scope,
lists all eight known limitations, uses exact v1.0.0 commands, and links exhaustive evidence
instead of duplicating the entire bug ledger.

- [ ] **Step 4: Commit any verification-only corrections**

If verification reveals a documentation defect, update only `README.md` or the contract
assertions, rerun the failing and full gates, then commit:

```bash
git add README.md scripts/self-test-release-report.mjs
git commit -m "docs: correct operator guide verification"
```

If no correction is required, do not create an empty commit.
