# Private RAG Operations

## Install PostgreSQL extensions

Back up PostgreSQL first, then run:

```bash
sudo /opt/carbonio-ai-assistant/bin/setup-rag-postgres.sh
```

The helper installs `postgresql-16-pgvector` when required, enables `vector` and `pg_trgm`,
creates or rotates the restricted `carbonio_ai_worker` login, saves its URL in the root-only
environment file, and restarts the worker. It also rotates a root-only `carbonio_ai_backup`
login with `BYPASSRLS` for complete backup/restore. That credential is never loaded by either
application service. The helper does not alter user source selections.

## Services and health

```bash
systemctl status carbonio-ai-gateway.service --no-pager
systemctl status carbonio-ai-rag-worker.service --no-pager
journalctl -u carbonio-ai-rag-worker.service --since "15 minutes ago" --no-pager
curl -fsS http://127.0.0.1:8787/api/ai/health | jq .rag
```

Health reports the RAG backend, pgvector availability, and aggregate queue depth. It never
reports private source text or user source identifiers.

## Embeddings

The default is a local deterministic 384-dimensional private vector. For semantic production
quality, set an OpenAI-compatible self-hosted endpoint and allowlist only its host:

```ini
AI_RAG_EMBEDDING_URL=http://127.0.0.1:8080/v1/embeddings
AI_RAG_EMBEDDING_MODEL=approved-private-embedding-model
AI_RAG_EMBEDDING_HOSTS=127.0.0.1
```

Restart gateway and worker after configuration changes. Never point private embeddings at an
external host without an approved privacy review.

## Backup, restore, rollback, and incident response

`backup-postgres.sh` and `restore-postgres.sh` cover RAG tables and RLS. Restore stops gateway
and worker. Application rollback restarts both services and retains forward-only database
migrations.

For suspected leakage, disable the addon with `AI_ENABLED=false`, stop the worker, preserve a
database and journal snapshot, remove affected sources, rotate the history/RAG encryption key
through an approved re-encryption procedure, and do not resume until owner isolation and live
access revalidation tests pass.
