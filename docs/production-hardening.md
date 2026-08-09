# Production Hardening and Recovery

This guide covers the v2.2 operational controls. The gateway remains loopback-only and all
operator endpoints must stay behind host-level access controls.

## Health and metrics

Administrators can view the health matrix in Settings. It reports gateway, PostgreSQL history,
private RAG worker, provider, and write-tool state without exposing mailbox content.

Prometheus uses a separate bearer credential:

```bash
sudo /opt/carbonio-ai-assistant/bin/set-metrics-token.sh
sudo install -o root -g prometheus -m 0640 \
  /etc/carbonio-ai-assistant/metrics-token \
  /etc/prometheus/carbonio-ai-metrics-token
```

Use `gateway/deploy/prometheus-scrape-example.yml` as the scrape template and
`gateway/deploy/prometheus-carbonio-ai.rules.yml` as the alert-rule baseline. Keep the token
out of source control and rotate it after any suspected exposure.

## Provider reliability

Configure ordered fallback models with `AI_MODEL_FALLBACKS`. A fallback is attempted only for
eligible availability conditions such as a timeout, rate limit, unavailable model, network
failure, or provider server failure. Authentication, authorization, invalid request, privacy
policy mismatch, and user cancellation fail immediately.

Use the Settings connection test after every provider or model change. The response identifies
the configured and active model. A fallback result is degraded health, not a silent success.

## Safety Center

The administrator write stop persists in `/var/lib/carbonio-ai-assistant/.runtime/security-state.json`.
Environment policy remains authoritative and cannot be overridden from the UI. Supported Undo
operations are owner-scoped, expire after 15 minutes by default, require a fresh confirmation,
and are consumed once. Permanent deletion, sending, sharing, and other irreversible operations
do not offer Undo.

## Backup policy

The daily timer runs `backup-policy.sh`. Each recovery point contains:

- a PostgreSQL custom-format dump verified by `pg_restore --list`
- a consistent SQLite audit snapshot created with `VACUUM INTO`
- saved non-secret provider configuration and runtime safety state when present
- SHA-256 checksum files for database and runtime archives

Set `AI_BACKUP_OFFSITE_PATH` to a root-owned mounted directory for a second copy. The default
retention is 14 days and can be changed with `AI_BACKUP_RETENTION_DAYS`.

```bash
systemctl status carbonio-ai-backup.timer --no-pager
sudo systemctl start carbonio-ai-backup.service
journalctl -u carbonio-ai-backup.service --since today --no-pager
```

## Restore drill

`AI_RESTORE_DRILL_DATABASE_URL` must identify an isolated non-production database and must not
match the production or backup connection. The monthly drill verifies checksums and restores the
latest database dump into that isolated target. It also verifies that a matching runtime archive
and manifest exist.

```bash
sudo systemctl start carbonio-ai-restore-drill.service
journalctl -u carbonio-ai-restore-drill.service --since today --no-pager
```

Never point the drill URL at a production database. A successful technical restore does not
establish a site recovery objective. Operators must record duration, storage growth, and the
application-level UAT result for their own environment.

## Resource controls

The gateway and worker units set memory, task, open-file, namespace, and system-call hardening.
The installer places an Nginx open-file limit drop-in but does not restart Carbonio Nginx.
Apply it only in an approved maintenance window:

```bash
sudo systemctl daemon-reload
sudo systemctl restart carbonio-nginx.service
sudo systemctl show carbonio-nginx.service -p LimitNOFILE
```

## Optional document extraction

PDF and office extraction is disabled unless all of these settings are deliberately configured:

```ini
AI_DOCUMENT_EXTRACTION_ENABLED=true
AI_MALWARE_SCANNER_COMMAND=/usr/bin/clamdscan
AI_DOCUMENT_SANDBOX_COMMAND=/usr/local/sbin/carbonio-ai-document-sandbox
AI_DOCUMENT_EXTRACTOR_COMMAND=/usr/local/bin/carbonio-ai-document-extractor
```

The sandbox wrapper must deny networking, expose only the temporary input and output paths, and
apply CPU, memory, process, output-size, and execution-time limits. If any dependency is missing
or fails, the attachment remains metadata-only.
