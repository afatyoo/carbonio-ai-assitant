# Changelog

All notable changes to Carbonio AI Assistant are documented in this file.

## [Unreleased]

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
[0.0.1]: https://github.com/afatyoo/carbonio-ai-assitant/releases/tag/v0.0.1
