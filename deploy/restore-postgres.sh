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

systemctl stop carbonio-ai-gateway.service
restore_succeeded=0
restart_gateway() {
	systemctl start carbonio-ai-gateway.service
	if [[ "$restore_succeeded" != "1" ]]; then
		echo "Restore failed; gateway was restarted against the current database." >&2
	fi
}
trap restart_gateway EXIT

pg_restore --clean --if-exists --no-owner --no-privileges \
	--dbname "$AI_DATABASE_URL" "$2"
restore_succeeded=1
echo "Restore completed from: $2"
