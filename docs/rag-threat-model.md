# Private RAG Threat Model

## Security invariants

- Ownership comes only from authenticated Carbonio `GetInfo`.
- Private sources are opt-in and isolated by forced PostgreSQL RLS plus explicit owner filters.
- Carbonio cookies, provider keys, raw private text, and decrypted job payloads are never logged.
- Retrieved text is untrusted evidence, never an instruction or authorization source.
- RAG cannot invoke a write. Mutations require the live tool confirmation framework.

## Threats and controls

| Threat | Control | Verification |
| --- | --- | --- |
| Cross-user retrieval | Forced RLS, transaction-local owner context, owner-filtered queries | Two-owner database regression |
| Forged browser owner or source ID | Owner derived from `GetInfo`; source API accepts only module names | Authentication and route tests |
| Revoked share or deleted object | Exact live read/version check before provider request | Fail-closed revalidation tests and live UAT |
| Prompt injection in mail or files | Evidence delimiters, untrusted-data system rule, suspicious-chunk flag | Injection fixture |
| Citation spoofing | Output permits only retrieved `[R#]` identifiers; source list is server-built | Citation regression |
| Poisoned or external embeddings | Self-host endpoint allowlist, fixed 384 dimensions, finite-number validation | Endpoint and dimension tests |
| Malicious attachment | Type allowlist, declared/returned MIME match, 2 MB cap, NUL/binary rejection, EICAR quarantine, no redirects | Attachment extraction fixtures |
| Session theft through jobs | Jobs contain encrypted normalized documents only, never cookies | Schema contract test |
| Resource exhaustion | Per-source 2,000-document cap, bounded mail collection, bounded chunks, durable queue, retry/backoff | Limit tests and metrics |
| Stale sync deleting new data | Only one processing sync per owner/module; finalize job follows ordered upserts | Queue regression |
| Disabled source still retrieved | Disable and document deletion share one transaction; query joins enabled sources | Removal regression |
| Database disclosure | AES-256-GCM normalized text and root-only configuration | Backup inspection and crypto tests |

## Accepted residual risks

- Safe body extraction currently supports text, CSV, Markdown, JSON, and XML. Other attachment
  types are indexed as metadata only until a sandboxed parser and malware engine are deployed.
- Files/Docs and Chats are unavailable until their official user-scoped compatibility probes
  pass on the target Carbonio version.
- Local deterministic vectors provide a confidential fallback, but a reviewed self-hosted
  embedding model is recommended for higher semantic recall.
- PostgreSQL high availability, disaster restore time, and large-mailbox performance require
  site-specific rehearsal before broad rollout.
