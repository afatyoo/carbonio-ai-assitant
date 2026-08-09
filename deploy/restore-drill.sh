#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
	echo "Run this restore drill as root." >&2
	exit 1
fi

source /etc/carbonio-ai-assistant/gateway.env
: "${AI_DATABASE_URL:?AI_DATABASE_URL is not configured}"
: "${AI_RESTORE_DRILL_DATABASE_URL:?AI_RESTORE_DRILL_DATABASE_URL is not configured}"
if [[ "$AI_RESTORE_DRILL_DATABASE_URL" == "$AI_DATABASE_URL" || "$AI_RESTORE_DRILL_DATABASE_URL" == "${AI_BACKUP_DATABASE_URL:-}" ]]; then
	echo "Restore drill database must be isolated from production and backup connections." >&2
	exit 1
fi

backup_file="${1:-}"
if [[ -z "$backup_file" ]]; then
	backup_file="$(find /var/backups/carbonio-ai-assistant -maxdepth 1 -type f -name 'carbonio-ai-*.dump' -print | sort | tail -1)"
fi
if [[ "$backup_file" != /var/backups/carbonio-ai-assistant/carbonio-ai-*.dump || ! -f "$backup_file" ]]; then
	echo "A verified addon backup under /var/backups/carbonio-ai-assistant is required." >&2
	exit 1
fi

pg_restore --list "$backup_file" >/dev/null
backup_stamp="$(basename "$backup_file" .dump | sed 's/^carbonio-ai-//')"
state_archive="/var/backups/carbonio-ai-assistant/carbonio-ai-runtime-$backup_stamp.tar.gz"
if [[ ! -f "$state_archive" ]]; then
	echo "Matching runtime state archive is missing: $state_archive" >&2
	exit 1
fi
sha256sum -c "${backup_file}.sha256"
sha256sum -c "${state_archive}.sha256"
tar -tzf "$state_archive" | grep -Fx './manifest.json' >/dev/null
pg_restore --clean --if-exists --no-owner --no-privileges --no-comments \
	--dbname "$AI_RESTORE_DRILL_DATABASE_URL" "$backup_file"
psql "$AI_RESTORE_DRILL_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc \
	"SELECT CASE WHEN to_regclass('public.conversations') IS NOT NULL AND to_regclass('public.rag_sources') IS NOT NULL THEN 'restore_drill=ok' ELSE 'restore_drill=missing_schema' END" |
	grep -Fx 'restore_drill=ok'
echo "Restore drill completed from: $backup_file"
