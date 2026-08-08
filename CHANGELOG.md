# Changelog

All notable changes to Carbonio AI Assistant are documented in this file.

## [2.0.1] - 2026-08-08

### Fixed

- Fixed private Mail and attachment synchronization on Carbonio servers that reject the
  unsupported pseudo-folder query `in:anywhere` as folder path `//anywhere`.
- All-mail indexing now omits the optional Search query, while attachment indexing uses only
  the supported `has:attachment` predicate.
- Added request-builder regression coverage that prevents the invalid pseudo-folder from
  returning to the RAG collection path.
- Source status now refreshes automatically while indexing is in progress, so completed
  document and chunk counts appear without a manual page reload.
- Added a user-scoped Tasks compatibility fallback for Carbonio servers that reject
  `types=task`: retry with appointment-backed items in standard Tasks folder ID 15, then
  retrieve each result through the official `GetTask` operation.

### Verified

- Passed gateway syntax checks, the full gateway regression suite, and release contracts.
- Authenticated Webmail Mail sync returned HTTP 202, indexed 11 documents into 11 chunks,
  completed all encrypted worker jobs, and returned the durable queue to zero.
- See the [detailed v2.0.1 report](docs/releases/v2.0.1.md).

## [2.0.0] - 2026-08-08

### Added

- Added explicit user-controlled private indexing for Mail, safe attachment text and metadata,
  Calendar, Tasks, and personal Contacts.
- Added localized Manage AI Sources controls across all nine official Carbonio locales.
- Added a separate hardened RAG worker with encrypted durable jobs, bounded chunking,
  retry/backoff, deletion finalization, and tombstones.
- Added PostgreSQL forced RLS, GIN full-text search, pgvector storage, HNSW indexing,
  reciprocal-rank fusion, and an allowlisted self-hosted embedding endpoint contract.
- Added architecture, threat model, compatibility, privacy, operations, and evaluation guides.

### Security

- Carbonio session cookies never enter RAG jobs or persistent source data.
- Every retrieved private record is revalidated live against the authenticated Carbonio
  session and current revision before provider use.
- Disabled, deleted, revoked, or stale sources fail closed and cannot be retrieved.
- Model-generated private citation identifiers are limited to evidence actually retrieved.
- Safe attachment text extraction enforces MIME allowlists, a 2 MB cap, binary rejection,
  EICAR quarantine, no redirects, and loopback-only Carbonio content access.
- Patched newly disclosed moderate PostCSS path-disclosure and DOMPurify detached-subtree
  advisories in the Carbonio UI build dependency graph.

### Limitations

- Files/Docs and Chats remain fail-visible unavailable until official user-scoped API probes pass.
- Binary and document attachment bodies remain metadata-only.
- Site-specific retrieval quality, large-mailbox latency, and PostgreSQL HA gates remain documented.

### Verified

- Passed production forced-RLS inspection, two-owner isolation, pgvector/HNSW, encrypted live
  worker lifecycle, immediate removal, full backup, catalog validation, and disposable restore.

- See the [detailed v2.0.0 report](docs/releases/v2.0.0.md).

## [1.1.0] - 2026-08-08

### Added

- Added a Carbonio Shell utility panel for context-aware Mail and Calendar assistance.
- Added explicit per-selection consent, quick email/calendar actions, safe plain-text panel
  chat, and shared server-side conversation history.
- Added typed context references for message, conversation, and appointment targets.
- Added server-side exact-item re-fetch using the authenticated Carbonio session.
- Added complete context-panel translations for all nine official Carbonio locales.

### Security

- Browser-provided item bodies are discarded. Only validated IDs and bounded metadata cross
  the UI-to-gateway boundary.
- Selection changes abort in-flight requests, clear prior context, and reset consent.
- Compact-panel confirmations are not executable. Write actions remain in the full assistant.

### Verified

- Added regressions for context parsing, unsupported modules/actions, forged identifiers,
  exact SOAP target use, provider grounding, selection cancellation, i18n, and safe rendering.

- See the [detailed v1.1.0 report](docs/releases/v1.1.0.md).

## [1.0.2] - 2026-08-08

### Fixed

- Prevented environment configuration from silently overriding a model selected in Settings.
- Added effective provider, effective model, configuration revision, source metadata, and
  environment-managed field locks to the Settings contract.
- Invalidated stale account model preferences after an effective configuration change.
- Prevented historical conversations from changing the model used for new requests.
- Rendered assistant responses as readable plain text and localized labeled timestamps.
- Patched high-severity build-time dependency advisories by overriding vulnerable Less,
  fast-uri, js-yaml, and nanoid transitive versions.

### Verified

- Added regressions for environment locks, revision changes, safe plain-text rendering,
  localized timestamps, i18n parity, gateway security, history isolation, and TypeScript.

- See the [detailed v1.0.2 report](docs/releases/v1.0.2.md).

## [1.0.1] - 2026-08-03

### Added

- Added complete French, Hindi, Italian, Brazilian Portuguese, Russian, Spanish, and Thai
  catalogs alongside English and Indonesian for all addon-owned UI text.
- Added manifest-driven checks for exact key parity, placeholders, source coverage, non-empty
  values, and production build output across all nine official Carbonio locales.

### Fixed

- Normalized regional Carbonio locale values such as `pt-BR` and `id-ID` to supported base
  catalogs, with deterministic English fallback for unsupported community locales.

### Limitations

- The seven new catalogs are high-quality first passes without native linguistic sign-off.
  AI answers, mailbox content, citations, and external provider messages are not translated.

- See the [detailed v1.0.1 report](docs/releases/v1.0.1.md).

## [1.0.0] - 2026-08-03

### Security

- Explicit mailbox/calendar data-access opt-outs now bypass all Carbonio mailbox and
  calendar tools, documentation RAG, and synthetic tool context. The direct provider path
  receives exactly one original user message with no system/tool/RAG wrapper.
- The bilingual classifier covers access/read/use/open/check variants, Unicode apostrophes,
  plural protected objects, quoted and hypothetical text, reinforced opt-outs, and multiple
  opt-outs without weakening ordinary email/calendar requests.

### Fixed

- Closed the live beta UAT bug where `Jangan akses email atau kalender` triggered
  documentation retrieval and `search_emails` solely because the negated sentence contained
  the words `balas` and `email`.

### Verified

- Added a real `runAgent` → HTTP-provider regression with 13 positive bilingual opt-out
  prompts and eight false-positive/hypothetical cases. The test asserts zero tool events,
  empty mailbox/RAG context, and an exact user-only provider payload.
- The internal candidate passed full local and installed gateway suites, strict PostgreSQL
  production smoke, PostgreSQL idle disconnect/reconnect without gateway restart, and
  authenticated Chrome UAT on the exact commit. See the
  [detailed v1.0.0 report](docs/releases/v1.0.0.md).

## [1.0.0-beta.1] - 2026-08-02

### Added

- Published the complete controlled-pilot feature set as a SemVer beta: native Carbonio
  assistant UI, bilingual experience, administrator-managed providers/models, PostgreSQL
  history, confirmation-protected email/calendar tools, documentation knowledge retrieval,
  security policy, observability, systemd packaging, and atomic deployment/rollback.
- Added an authoritative [detailed release report](docs/releases/v1.0.0-beta.1.md) covering
  all implemented capabilities, Carbonio SOAP boundaries, the complete 24-item closed-bug
  ledger, exact live UAT evidence, known acceptance gaps, and operator procedures.

### Security

- Preserved fail-closed exact-target mutation resolution, one-time owner-bound
  confirmations, idempotency, Carbonio session/CSRF checks, loopback gateway binding,
  encrypted administrator credentials, production PostgreSQL enforcement, account policy,
  OpenRouter ZDR/data-collection locks, audit records, quotas, and the write kill switch.

### Changed

- Promoted package metadata from the `0.0.3-rc.*` sequence to `1.0.0-beta.1` without a
  runtime behavior or database-schema change.
- GitHub prereleases now use the curated report plus exact build/tag/workflow/checksum
  evidence instead of generated commit-title notes as their authoritative release body.
- Release archives include `RELEASE_NOTES.md` alongside version/commit/runtime metadata.

### Verified

- RC19 core behavior passed the full UI, deployment, gateway, PostgreSQL reconnect,
  production build, audit, and secret-scan pipeline before beta promotion.
- The Carbonio pilot passed strict PostgreSQL-backed smoke, provider streaming, history
  persistence, and approved send/mark-read/move-to-Trash mutation UAT. Permanent deletion,
  calendar mutation lifecycle, final pilot sign-off, and other listed external gates remain
  explicitly open in the detailed report.

## [0.0.3-rc.19] - 2026-08-02

### Fixed

- Folder-qualified explicit message targets such as `email Inbox ID 440` now resolve
  through exact `GetMsg` revalidation instead of being rejected as ambiguous. The parser
  remains restricted to known Carbonio standard folder names and still requires the
  confirmation flow before any mutation.
- Move-email destinations are resolved only from one complete terminal `to`, `into`, or
  `ke` clause, preventing source qualifiers or connector words inside subjects from being
  mistaken for the destination. Ambiguous destinations and bare numeric folder values
  fail closed before mailbox access.

## [0.0.3-rc.18] - 2026-08-02

### Fixed

- Explicit mail IDs now discard only terminal sentence punctuation before exact Carbonio
  `GetMsg` revalidation. Authenticated RC17 UAT reproduced `email ID 435.` being sent as
  malformed ID `435.`; the target is now revalidated as `435` before confirmation.

## [0.0.3-rc.17] - 2026-08-02

### Security

- Mail and calendar mutations now fail closed unless an explicit ID, an explicit
  latest/next request, or exactly one criteria-matching target is resolved; confirmation
  tokens and previews bind the exact message or versioned appointment target.
- Production deployment smoke checks now fail closed unless the health endpoint reports
  PostgreSQL-backed history; SQLite is development-only.
- Tag releases now enforce the same deployment smoke, gateway regression and PostgreSQL
  reconnect coverage, dependency audits, and secret scan gates as pull-request CI.

## [0.0.3-rc.16] - 2026-08-02

### Fixed

- PostgreSQL idle-client errors are now handled and logged without terminating the
  gateway when the database is restarted or a network connection is interrupted.
- Regression coverage includes secret-safe structured logging plus a real PostgreSQL
  idle-backend termination and successful reconnect through the same pool.

## [0.0.3-rc.15] - 2026-08-02

### Security

- OpenRouter production requests now enforce Zero Data Retention and deny provider
  data collection even if an environment override is accidentally set to disable them.
- An integration regression test captures the real outbound provider request and guards
  the production privacy routing contract.

## [0.0.3-rc.14] - 2026-08-02

### Fixed

- Streaming AI errors now retain the gateway request ID so users and operators can
  correlate failures with structured server logs during support and UAT.

## [0.0.3-rc.13] - 2026-08-02

### Security

- Appointment update, invitation, and cancellation tools now reject recurring events at
  schema validation time, including direct tool API calls outside natural-language routing.

## [0.0.3-rc.12] - 2026-08-02

### Fixed

- `GetAppointment` normalization now accepts Carbonio JSON array forms for start, end,
  organizer, and timezone so update previews show a real before/after diff.

## [0.0.3-rc.11] - 2026-08-02

### Fixed

- Upcoming appointment searches now scope an otherwise empty Carbonio search to the
  default Calendar folder (`inid:10`), matching the server search grammar used in UAT.

## [0.0.3-rc.10] - 2026-08-02

### Fixed

- Email action previews now render sender and date in the email card instead of the
  calendar branch; the UI contract guards the field placement.
- Release archives omit macOS extended attributes to avoid extraction warnings on Linux.

## [0.0.3-rc.9] - 2026-08-02

### Added

- Confirmed email draft update, forward draft, send, mark-read, tag, move, and permanent
  delete tools using Carbonio `SaveDraft`, `SendMsg`, and `MsgAction` contracts.
- Bounded appointment detail, contact/GAL search, attendee resolution, calendar draft,
  version-aware appointment update, invitation, and cancellation tools.
- Localized confirmation cards and result messages for every email and calendar mutation,
  including permanent-action warnings and appointment before/after changes.
- Explicit Indonesian and English action routing that never executes a mutation until the
  account-bound one-time confirmation token is accepted.

### Fixed

- Appointment results no longer claim invitations were sent when no attendees were listed.
- Default write-enabled account permissions now include mail write and calendar write scopes.

## [0.0.3-rc.8] - 2026-08-02

### Fixed

- Chat confirmation, retry, stop, and send controls use accessible native themed
  buttons so their labels remain visible with Carbonio Design System 12 in production.

## [0.0.3-rc.7] - 2026-08-02

### Added

- CI regression contract for Carbonio theme tokens, narrow responsive breakpoints,
  reduced motion, safe text rendering, and English/Indonesian translation parity.

### Fixed

- Indonesian `Buat ...` and `Buatkan ...` draft/meeting requests now both enter the
  confirmation workflow instead of falling through to a normal chat response.
- The production example aligns its default free OpenRouter model with an endpoint
  verified through the authenticated ZDR catalog; availability must be rechecked at rollout.

## [0.0.3-rc.6] - 2026-08-02

### Fixed

- The encrypted credential helper can migrate API keys saved by the legacy Settings
  UI and removes the plaintext config field only after encryption succeeds.

## [0.0.3-rc.5] - 2026-08-02

### Fixed

- Release packaging now includes the encrypted API-key helper required by the
  installer. RC4 was not activated on the pilot because its installer failed closed
  when that helper was absent.

## [0.0.3-rc.4] - 2026-08-02

### Added

- Per-provider circuit breakers with half-open recovery and administrator metrics.
- End-to-end request cancellation from the chat UI through the gateway to provider fetches.
- Retry/regenerate controls and localized stopped-generation feedback.
- Persistent per-account input/output token accounting, daily token quota enforcement,
  a self-service usage endpoint, and usage visibility in Settings.
- Account-, Carbonio group-, and domain-scoped model/tool allowlists with precedence,
  cached session-based group resolution, and write kill-switch enforcement.
- Owner-scoped model preferences stored separately from administrator provider settings.
- Safe HTML-to-plain-text email normalization and bounded attachment metadata retrieval
  without downloading attachment content.
- Bounded full-message and thread retrieval for email-summary requests.
- Reliability coverage proving invalid provider credentials are not retried.
- Conflict-aware meeting-slot proposals with up to three alternatives before the
  confirmed Carbonio appointment mutation.
- Encrypted systemd credential storage and in-place migration for provider API keys;
  secrets are no longer persisted in the gateway application config.

### Changed

- Chat content, suggestions, model controls, and the composer now adapt to narrow
  Carbonio panes without forcing a two-column layout.

## [0.0.3-rc.3] - 2026-08-02

### Fixed

- Release checksum files now contain a portable archive basename instead of the
  GitHub Actions runner's absolute path and are self-verified during packaging.

## [0.0.3-rc.2] - 2026-08-02

### Added

- Tagged release artifacts are now published as GitHub Releases with generated notes,
  SHA-256 checksums, and automatic prerelease classification for release candidates.

### Verified

- The exact release-candidate artifact passed all gateway regression tests on the
  Carbonio production-pilot server.
- PostgreSQL history, Carbonio reverse proxy routing, security smoke checks, provider
  timeout/retry handling, and the systemd gateway service remained healthy.

## [0.0.3-rc.1] - 2026-08-02

### Added

- Soft-delete and restore endpoints for conversations.
- Undo notification after deleting a conversation.
- Cursor-based history pagination with a localized `Load more` control.
- Owner-scoped conversation title search with a localized empty state.
- Loading skeletons and pagination error states.
- SQLite migration for `deleted_at`, `message_count`, and the paginated owner index.
- Self-tests for owner isolation, rename, pagination, summary privacy, soft-delete,
  and restore.
- End-to-end request IDs from the UI through gateway responses and structured logs.
- Structured JSON logs for HTTP requests, provider calls, mailbox tools, and SOAP calls.
- Bounded provider and SOAP timeouts.
- Provider retry for HTTP `429`, `502`, `503`, and network errors with exponential
  backoff and jitter.
- Reliability self-tests for retry and timeout behavior.
- A direct conversation delete button on history hover, while retaining Delete in
  the overflow menu for discoverability.
- A curated Carbonio email API knowledge index covering `SaveDraft`, `SendMsg`,
  reply/forward, attachments, and bounded `GetMsg` usage.
- Local documentation retrieval with an authenticated search endpoint, provider
  prompt grounding, official citations, and retrieval self-tests.
- A shadcn Marker-inspired inline process indicator with an accessible spinner,
  shimmer text, and localized tool status labels.
- A schema-based agent tool registry with risk levels, permissions, bounded
  execution, owner-scoped audit records, one-time confirmation tokens, and
  idempotency storage.
- Authenticated tool catalog and per-user audit endpoints.
- Bounded `get_email` and `get_email_thread` tools backed by Carbonio `GetMsg` and
  `GetConv` without changing read state.
- A confirmed `create_email_draft` tool backed by Carbonio `SaveDraft`, with
  recipient/subject/body preview, one-time tokens, and idempotent execution.
- A localized in-chat draft confirmation card for reply and compose requests.
- Calendar search and free/busy tools backed by the official Carbonio SOAP APIs.
- Natural-language appointment planning with explicit attendee extraction, conflict
  warnings, localized preview, one-time confirmation, and idempotent creation.
- Deterministic IANA timezone conversion, attendee validation, complete appointment
  preview metadata, and mutation result IDs in owner-scoped audit records.
- PostgreSQL production conversation storage with versioned schema migrations,
  normalized message rows, encrypted message content, retention cleanup, and a
  verified one-time SQLite migration.
- PostgreSQL setup, backup, and guarded restore scripts with dedicated database
  credentials and installer-managed operational commands.
- Administrator-only provider configuration, provider/model allowlists, fail-closed
  custom endpoints, cross-site request protection, and security response headers.
- Persistent daily account quotas, per-minute rate limiting, write-tool and global
  kill switches, administrator metrics, and graceful database shutdown.
- User-facing AI processing disclosure and read-only settings UI for non-admin users.
- Per-account pilot/write-tool feature flags and secret-pattern redaction before
  mailbox context is sent to an external provider.
- Per-request OpenRouter Zero Data Retention and data-collection denial, plus a
  documented provider privacy review for the production pilot.
- Bounded/sanitized model output, safe plain-text UI rendering verification,
  success/error/latency metrics, provider health gauges, and an administrator
  audit/status panel in AI settings.
- GitHub Actions CI/release workflows, dependency updates, project linting,
  read-only production smoke tests, atomic UI/gateway rollback, and a pilot UAT runbook.
- Patched transitive build dependencies through pinned pnpm overrides; local UI and
  gateway audits report zero known vulnerabilities.

### Changed

- Conversation rename now uses the dedicated `PATCH` endpoint.
- Conversation list responses contain metadata only; full message bodies are loaded
  only when a conversation is opened.
- Email search no longer requests full message content when only list metadata is needed.
- Documentation RAG activates only for API guidance and compose-related requests,
  keeping normal mailbox summaries free from unrelated API context.
- Response chunking now preserves long tokens such as documentation citation URLs.
- Chat responses now use the gateway SSE transport so tool and generation states
  update while a request is running.
- Existing mailbox search and unread-list tools now execute through the shared
  Tool Framework instead of direct handler calls.

## [0.0.2] - 2026-07-31

### Added

- Carbonio-aware localization with English and Indonesian translations.
- ChatGPT-style conversation actions shown on hover or keyboard focus.
- Inline conversation rename and persistent conversation deletion.

### Changed

- Localized the assistant, settings, status, accessibility, and sidebar text.
- Preserved custom conversation titles when a renamed chat receives new messages.
- Refined the conversation sidebar spacing, scrolling, focus, and active states.

## [0.0.1] - 2026-07-31

### Added

- Initial public MVP with a Carbonio microfrontend, AI gateway, provider settings,
  mailbox tools, server-side SQLite history, and systemd-based deployment tooling.

[1.0.1]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v1.0.1
[1.0.0]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v1.0.0
[1.0.0-beta.1]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v1.0.0-beta.1
[0.0.3-rc.19]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.19
[0.0.3-rc.18]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.18
[0.0.2]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.2
[0.0.3-rc.4]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.4
[0.0.3-rc.5]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.5
[0.0.3-rc.6]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.6
[0.0.3-rc.7]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.7
[0.0.3-rc.8]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.8
[0.0.3-rc.9]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.9
[0.0.3-rc.10]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.10
[0.0.3-rc.11]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.11
[0.0.3-rc.12]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.12
[0.0.3-rc.13]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.13
[0.0.3-rc.14]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.14
[0.0.3-rc.15]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.15
[0.0.3-rc.16]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.16
[0.0.3-rc.17]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.17
[0.0.3-rc.3]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.3
[0.0.3-rc.2]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.2
[0.0.3-rc.1]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.1
[0.0.1]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.1
