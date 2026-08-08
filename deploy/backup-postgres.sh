#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
	echo "Run this backup as root." >&2
	exit 1
fi

source /etc/carbonio-ai-assistant/gateway.env
: "${AI_DATABASE_URL:?AI_DATABASE_URL is not configured}"
database_url="${AI_BACKUP_DATABASE_URL:-$AI_DATABASE_URL}"

backup_root="/var/backups/carbonio-ai-assistant"
install -d -o root -g root -m 0700 "$backup_root"
backup_file="$backup_root/carbonio-ai-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges \
	--file "$backup_file" "$database_url"
chmod 0600 "$backup_file"
echo "Backup created: $backup_file"
