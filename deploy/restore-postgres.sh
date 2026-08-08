#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
	echo "Run this restore as root." >&2
	exit 1
fi
if [[ "${1:-}" != "--yes" || -z "${2:-}" || ! -f "$2" ]]; then
	echo "Usage: $0 --yes /absolute/path/to/backup.dump" >&2
	exit 1
fi

source /etc/carbonio-ai-assistant/gateway.env
: "${AI_DATABASE_URL:?AI_DATABASE_URL is not configured}"
database_url="${AI_BACKUP_DATABASE_URL:-$AI_DATABASE_URL}"

systemctl stop carbonio-ai-rag-worker.service
systemctl stop carbonio-ai-gateway.service
restore_succeeded=0
restart_gateway() {
	systemctl start carbonio-ai-gateway.service
	systemctl start carbonio-ai-rag-worker.service
	if [[ "$restore_succeeded" != "1" ]]; then
		echo "Restore failed; gateway was restarted against the current database." >&2
	fi
}
trap restart_gateway EXIT

pg_restore --clean --if-exists --no-owner --no-privileges --no-comments \
	--dbname "$database_url" "$2"
restore_succeeded=1
echo "Restore completed from: $2"
