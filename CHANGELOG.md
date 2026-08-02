# Changelog

All notable changes to Carbonio AI Assistant are documented in this file.

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

[0.0.2]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.2
[0.0.3-rc.4]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.4
[0.0.3-rc.5]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.5
[0.0.3-rc.6]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.6
[0.0.3-rc.7]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.7
[0.0.3-rc.8]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.8
[0.0.3-rc.3]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.3
[0.0.3-rc.2]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.2
[0.0.3-rc.1]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.3-rc.1
[0.0.1]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.1
