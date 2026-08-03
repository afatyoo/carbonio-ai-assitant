# Operator-First README Design

**Date:** 2026-08-03  
**Project:** Carbonio AI Assistant  
**Target release:** v1.0.0

## Objective

Replace the current brief README with a complete English operator-first guide. A Carbonio
administrator should be able to understand the product boundary, decide whether the
release fits the intended environment, deploy the signed-off release artifact, configure
the gateway safely, verify the installation, and recover or uninstall without inspecting
the source code.

## Audience

The primary audience is a Carbonio administrator deploying a controlled production pilot.
Secondary audiences are security reviewers, operators troubleshooting the gateway, and
contributors running the project locally.

## Information Architecture

The README will use this order:

1. Product overview, stable-release status, screenshot, and release links.
2. Supported capabilities grouped by chat/history, email, calendar, provider/admin, and
   reliability.
3. A prominent RAG scope section distinguishing curated Carbonio API documentation
   retrieval from full mailbox, attachment, file, or workspace vector indexing.
4. Architecture and request/data flow, including the Carbonio session boundary,
   loopback-only gateway, provider call, SOAP tools, and PostgreSQL history.
5. Tested environment, production prerequisites, and known limitations/risk acceptance.
6. Security and privacy boundaries, including confirmation behavior, credentials,
   OpenRouter privacy controls, and data minimization.
7. User and administrator usage: opening the assistant, choosing an allowed model,
   asking read questions, reviewing mutation previews, confirming once, managing history,
   and configuring providers.
8. Production deployment from the public GitHub release: download, SHA-256 verification,
   database setup, environment configuration, API-key installation, installer execution,
   smoke test, and authenticated browser verification.
9. Upgrade, rollback, backup/restore boundaries, uninstall, and destructive-data warnings.
10. Troubleshooting for HTML parsed as JSON, HTTP 405, empty streamed answers, service
    health, journald, PostgreSQL, Nginx, and request-ID correlation.
11. Local development, verification commands, repository structure, roadmap, contributing
    references, and MIT license.

## Accuracy and Safety Rules

- Commands will reflect the actual `deploy/` scripts shipped in the v1.0.0 artifact.
- Production instructions will use the release archive and portable checksum, not an
  unverified branch checkout.
- Values that vary by site will use descriptive placeholders and will not contain real
  API keys, database passwords, session cookies, or production credentials.
- The guide will state that `install.sh` requires root, installs a bundled Node 22 runtime,
  registers the UI, installs the Nginx route, and manages
  `carbonio-ai-gateway.service` through systemd.
- Upgrade instructions will require a verified PostgreSQL backup before running the new
  installer.
- Rollback will be described as UI/gateway rollback with forward-only database migrations.
- Uninstall will distinguish the default data-preserving behavior from irreversible
  `--purge-data` behavior.
- Known limitations will remain open and will not be described as passed merely because
  the project owner accepted their risk for v1.0.0.
- Full mailbox/workspace RAG will be stated as deferred scope, not an existing feature.

## Documentation Boundaries

The README will provide the shortest complete operational path. The detailed closed-bug
ledger, exhaustive UAT evidence, and release-specific risk record remain in
`docs/releases/v1.0.0.md`; provider policy and the UAT runbook remain authoritative for
their respective details. The README will link to those documents instead of duplicating
them in full.

## Validation

The completed README must pass these checks:

- every referenced local path exists;
- every documented script and option matches its implementation;
- release version, archive name, checksum, and service name match v1.0.0;
- RAG scope and all eight accepted external limitations are explicitly visible;
- install, upgrade, rollback, smoke-test, and uninstall examples are shell-valid;
- no secret-like value or internal session material is introduced;
- the repository's release-report contract and standard lint/type/test/build gates remain
  green.

## Out of Scope

This change does not alter application behavior, deployment scripts, release artifacts,
provider policy, or the accepted risk record. It does not implement production-ready
mailbox/files vector RAG.
