# Carbonio Full User RAG, Model Consistency, and Side Panel Plan

**Date:** 2026-08-08

**Baseline:** v1.0.1 at `b5550b2b75b7211c500835b45e227dbd32e3a59b`

**Goal:** Deliver a complete user-scoped Carbonio assistant across Mail, attachments,
Calendar, Tasks, Contacts, Files/Docs, and Chats where supported, while fixing effective-model
configuration and presenting assistant responses as clean plain text in full chat and a new
context-aware side panel.

## Product Boundary

- Every private source belongs to the authenticated user and is protected by current Carbonio ACLs.
- No admin mailbox, admin knowledge upload, admin impersonation, or internal Carbonio database access.
- Official Carbonio documentation remains a built-in public corpus maintained through releases.
- RAG retrieves and grounds. Mutations always use live Carbonio APIs, preview, one-time confirmation,
  idempotency, stale-version checks, and audit.
- User private indexing is empty by default. `All my supported data` remains an explicit opt-in.
- Unsupported modules fail visibly as unavailable rather than using undocumented bypasses.

## Release 1: v1.0.2 Model and Plain-Text Hotfix

### Confirmed defect

Production currently has an environment model of `inclusionai/ling-3.0-flash:free`, a saved
UI config model of `openrouter/free`, one stale user preference, and three active conversations
that retain the old model. Environment values override saved config at gateway startup, while
the UI reports the saved value. Chat sends the conversation/user selection, so the old model
can continue to be used.

### Implementation

1. Add failing tests for environment lock, saved config conflict, stale preference, stale
   conversation, provider switch, allowlist change, restart, and multi-tab refresh.
2. Extend config responses with `configRevision`, `effectiveProvider`, `effectiveModel`,
   `configSource`, and locked-field metadata.
3. Reject writes to environment-locked fields. The UI must say `Managed by environment` and
   must never report a successful effective change when the field is locked.
4. Reload config, models, preferences, and active conversation model after a successful change.
5. Reset preferences that are no longer allowed or provider-compatible.
6. Store historical `modelUsed` per assistant message. Do not force new requests to a stale
   conversation model after config revision changes.
7. Invalidate model discovery cache and relevant provider circuit state on a provider revision.
8. Log request ID, provider, and effective model without prompt, mailbox content, or credentials.
9. Add a plain-text response contract to agent prompts and a streaming-safe display normalizer.
10. Strip presentation-only `###`, `**`, and horizontal rules from assistant display text only.
11. Preserve source quotes, code, email bodies, draft bodies, and confirmation payloads unchanged.
12. Format timestamps through the normalized Carbonio locale and never expose raw epoch values.
13. Use the supplied `TEST UPGRADE` response as a golden regression fixture.

### Acceptance

- Settings, health/config response, request log, and provider payload identify the same model.
- Restart does not silently restore an overridden model.
- Existing conversation history opens, but its stale model cannot control a new request.
- Assistant messages contain no raw Markdown emphasis/headings/rules and no raw epoch timestamp.

## Release 2: v1.1.0 Context-Aware Side Panel

1. Define a typed context reference containing module, object ID, revision, selection, folder,
   and requested action. Do not trust browser-provided body content for authorization.
2. Add the robot action to the Mail item toolbar and a closable responsive side panel.
3. Re-fetch the selected item server-side with the active Carbonio session.
4. Do not send context to an AI provider until the user triggers an action.
5. Cancel in-flight work when the active item changes and reject stale revisions.
6. Mail actions: summarize, action items, reply draft, translate, explain attachment,
   related messages, and meeting proposal.
7. Calendar actions: meeting preparation, attendee context, follow-up, and reschedule proposal.
8. Files/Docs actions: summarize, ask document, compare versions, and open citations.
9. Share history infrastructure with full chat while recording explicit context scope.
10. Route every write action through the existing confirmation framework.

### Acceptance

- Switching email cannot leak the previous email into the next response.
- The side panel never fetches another user's item from a forged browser ID.
- Keyboard, narrow layout, dark/light theme, all nine locales, and cancellation pass UAT.

## Release 3: v2.0.0 Full User-Scoped RAG

### Foundation

1. Threat-model cross-user leakage, revoked shares, prompt injection, malicious files,
   poisoned embeddings, citation spoofing, and resource exhaustion.
2. Add PostgreSQL `pgvector`, forward-only migrations, separate migration/runtime/worker roles,
   forced RLS, owner transaction context, FTS GIN, and HNSW indexes.
3. Add a separate systemd RAG worker with durable idempotent jobs, retry/backoff, checkpointing,
   cancellation, metrics, and graceful shutdown.
4. Use short-lived user capability leases. Never persist raw Carbonio session cookies in jobs.
5. Encrypt private normalized text and use self-hosted embeddings by default for confidential data.

### Source adapters

1. Mail/thread: bounded pagination, normalized body, participants, deep-links, folder/tag/unread
   live-state merge, move/delete tombstones, and current ACL checks.
2. Attachments: byte-level MIME validation, malware quarantine, sandboxed extraction, size/type
   allowlist, no network, cleanup, parent-message citation, and deletion propagation.
3. Calendar/Tasks: semantic title/body/location indexing; free/busy, recurrence, revision,
   status, and invitation state always fetched live.
4. Contacts: index user-owned contacts and groups; GAL remains live-only and is never vectorized.
5. Files/Docs: official REST/GraphQL compatibility probe, versioned extraction, current ACL,
   share/revoke/version/delete sync, and deep-link citations.
6. Chats/Rooms: implement only after an official user-scoped API compatibility gate; revalidate
   membership and retention on every retrieval.

### Retrieval and answer contract

1. Classify general chat, documentation, private retrieval, live read, and mutation intents.
2. Run owner-filtered FTS and vector search, combine with RRF, deduplicate, rerank with timeout,
   enforce relevance threshold, and bound total context.
3. Treat retrieved content as untrusted data, not model instructions.
4. Validate every citation against chunks actually retrieved and revalidate source access when opened.
5. Merge vector evidence with live operational state without putting stale state in the index.
6. Return a clear no-evidence answer when relevance is below threshold.

### User controls

1. Add `Manage AI Sources` with per-module selection, `All my supported data`, estimate,
   privacy disclosure, retention, quota, pause, resume, reauthorize, re-index, and remove.
2. Removal blocks retrieval immediately and asynchronously deletes chunks, vectors, caches,
   and citation availability.
3. Show only the user's source health and costs. Operator metrics contain identifiers/hashes,
   never private source text.

### Quality gates

- Cross-user, revoked, deleted, expired, and forged-citation leakage: zero.
- Citation validity: 100 percent.
- No-answer precision: at least 90 percent.
- Retrieval recall@8: at least 85 percent on versioned synthetic/golden data.
- Retriever p95 excluding generation: at most 800 ms at accepted pilot scale.
- Gateway remains available when worker, embedding provider, or reranker fails.
- Backup/restore preserves RLS, tombstones, encryption, and source ownership.
- Every module adapter passes exact-target, stale-version, confirmation, replay, and rollback tests.

## Documentation Deliverables

- Architecture and threat-model ADRs.
- User source and privacy guide.
- Per-module API compatibility matrix.
- Data retention, deletion, and provider policy.
- Evaluation dataset and scorecard.
- Install, migration, backup/restore, rollback, re-index, and incident runbooks.
- Updated README, changelog, release report, and Obsidian Plan 02.

## Official Sources

- [Carbonio API Overview](https://docs.zextras.com/carbonio/html/develop/toc.html)
- [Mail service summary](https://docs.zextras.com/apidoc/api-reference/zimbraMail/service-summary.html)
- [Search API](https://docs.zextras.com/apidoc/api-reference/Mail/Search.html)
- [GetAppointment](https://docs.zextras.com/apidoc/api-reference/zimbraMail/GetAppointment.html)
- [GetICal](https://docs.zextras.com/apidoc/api-reference/zimbraMail/GetICal.html)
- [GetContacts](https://docs.zextras.com/apidoc/api-reference/Mail/GetContacts.html)
- [Files component](https://docs.zextras.com/carbonio/html/architecture/components/component-files.html)

## Approval Required Before Implementation

1. Private indexing remains opt-in, including the one-click `All my supported data` option.
2. Confidential embeddings default to a self-hosted model.
3. New requests follow the new effective model after config revision while history retains
   per-message model provenance.
4. Plain-text normalization applies only to assistant display answers, never email/draft content.
