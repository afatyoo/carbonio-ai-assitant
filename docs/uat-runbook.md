# Production Pilot UAT Runbook

Use 2–5 named internal accounts. Record request IDs for every failure. Do not use
real confidential mail while the free-model pilot is active.

## Pre-deployment

- CI is green for the exact commit.
- Release checksum is verified before extraction.
- PostgreSQL backup completes and `pg_restore --list` can read it.
- `AI_ENABLED_ACCOUNTS`, `AI_WRITE_TOOL_ACCOUNTS`, admin, provider, and model
  allowlists contain only approved pilot identities.
- OpenRouter input/output logging and training opt-in are disabled.

## Automated smoke test

```bash
sudo /opt/carbonio-ai-assistant/bin/smoke-test.sh
```

Expected: `smoke_health=ok headers=ok loopback=ok admin_auth=ok csrf=ok`.

## Authenticated Webmail checks

- Log in, log out, and log in again with each pilot account.
- Confirm the robot button and AI view load in both supported themes.
- Confirm a non-admin cannot edit provider/API-key settings.
- Confirm an admin can see policy metrics and recent tool audit records.
- Create, reload, rename, delete, undo, and search a conversation.
- Restart the gateway and PostgreSQL separately; confirm history survives.
- Summarize unread mail and search a large mailbox with no more than bounded results.
- Read plain-text and HTML messages; confirm remote images are not loaded by the tool.
- Test an email with attachment metadata; content must not be uploaded automatically.
- Generate a reply draft, inspect every field, confirm once, and verify it in Drafts.
- Generate a meeting, inspect timezone/attendees/conflicts, confirm once, and verify Calendar.
- Re-submit both confirmation tokens; both must be rejected without duplicate objects.
- Test invalid API key, provider `429`, provider timeout, and Carbonio SOAP failure.
- Confirm errors are localized, contain a request ID, and do not expose a secret.

## Rollback rehearsal

Choose an already installed previous commit and run:

```bash
sudo /opt/carbonio-ai-assistant/bin/rollback.sh <commit> --yes
sudo /opt/carbonio-ai-assistant/bin/smoke-test.sh
```

Roll forward to the candidate commit and rerun smoke tests. Application rollback does
not downgrade PostgreSQL schema: migrations are forward-only and must remain backward
compatible for at least one released application version. A database restore is a
separate emergency procedure using a verified backup and an approved maintenance window.

## Sign-off

Record commit, artifact SHA-256, tester accounts, timestamp, passed/failed cases,
known issues, and explicit approver. Expand beyond the pilot allowlist only after sign-off.
