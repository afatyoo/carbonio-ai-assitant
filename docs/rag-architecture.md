# Private RAG Architecture

Carbonio AI Assistant v2 indexes only data selected by the authenticated user. It never
uses an administrator mailbox, Carbonio database access, impersonation, or a browser-supplied
account ID.

## Data flow

1. The user enables a source in Settings. Sources are disabled and empty by default.
2. A sync request authenticates with `GetInfo` and reads supported Carbonio objects with the
   active session. The session cookie stays in gateway memory and is never written to a job.
3. Normalized documents are encrypted with AES-256-GCM before entering PostgreSQL jobs.
4. `carbonio-ai-rag-worker.service` claims durable jobs, creates bounded overlapping chunks,
   and obtains a 384-dimensional embedding from an allowlisted self-hosted endpoint. When no
   endpoint is configured, a deterministic local private vector is used.
5. PostgreSQL stores encrypted normalized text, a GIN full-text vector, and a pgvector column
   with an HNSW cosine index. Forced RLS requires a transaction-local authenticated owner ID.
6. Retrieval performs owner-filtered lexical and vector search, reciprocal-rank fusion,
   thresholding, deduplication, and a maximum of eight evidence chunks.
7. Every selected record is re-fetched or version-checked through the active Carbonio session
   before its evidence can reach the model. Deleted, revoked, or stale records fail closed.
8. The prompt marks evidence as untrusted data. Only citations corresponding to retrieved
   chunks survive output validation.

The worker uses the dedicated `carbonio_ai_worker` database login, which is granted only DML
access to RAG tables. A separate root-only `carbonio_ai_backup` login has `BYPASSRLS` solely so
verified full backups and restores remain possible after forced RLS. Neither role is used by
interactive gateway requests. The worker never performs Carbonio reads and cannot use a Carbonio session. Writes remain in
the existing live tool framework with exact previews, one-time confirmation, idempotency,
stale-version checks, and audit records. RAG never executes a mutation.

## Deletion and retention

Disabling a source blocks retrieval and deletes its documents and pending jobs in one database
transaction. A completed sync records tombstones for records no longer returned by Carbonio,
deletes their chunks, and retains tombstone identifiers for 30 days. No private source text is
stored in logs, metrics, or tombstones.

Database backup and restore include sources, encrypted documents, chunks, vectors, jobs,
tombstones, RLS policies, history, and audit state. Migrations are forward-only.
