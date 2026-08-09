#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
	echo "Run this backup policy as root." >&2
	exit 1
fi

source /etc/carbonio-ai-assistant/gateway.env
retention_days="${AI_BACKUP_RETENTION_DAYS:-14}"
if [[ ! "$retention_days" =~ ^[0-9]{1,4}$ ]] || (( retention_days < 1 )); then
	echo "AI_BACKUP_RETENTION_DAYS must be an integer from 1 to 9999." >&2
	exit 1
fi

backup_output="$(/opt/carbonio-ai-assistant/bin/backup-postgres.sh)"
backup_file="${backup_output#Backup created: }"
if [[ "$backup_file" != /var/backups/carbonio-ai-assistant/carbonio-ai-*.dump || ! -f "$backup_file" ]]; then
	echo "Backup helper returned an unexpected path." >&2
	exit 1
fi

pg_restore --list "$backup_file" >/dev/null
sha256sum "$backup_file" >"${backup_file}.sha256"
chmod 0600 "${backup_file}.sha256"

backup_stamp="$(basename "$backup_file" .dump | sed 's/^carbonio-ai-//')"
state_directory="/var/backups/carbonio-ai-assistant/runtime-state-$backup_stamp"
state_archive="/var/backups/carbonio-ai-assistant/carbonio-ai-runtime-$backup_stamp.tar.gz"
/opt/carbonio-ai-assistant/runtime/node-v22.22.0-linux-x64/bin/node \
	/opt/carbonio-ai-assistant/gateway/scripts/backup-runtime-state.mjs "$state_directory"
tar -C "$state_directory" -czf "$state_archive" .
chmod 0600 "$state_archive"
sha256sum "$state_archive" >"${state_archive}.sha256"
chmod 0600 "${state_archive}.sha256"
rm -rf "$state_directory"

if [[ -n "${AI_BACKUP_OFFSITE_PATH:-}" ]]; then
	if [[ "${AI_BACKUP_OFFSITE_PATH}" != /* || "${AI_BACKUP_OFFSITE_PATH}" == / ]]; then
		echo "AI_BACKUP_OFFSITE_PATH must be a non-root absolute directory." >&2
		exit 1
	fi
	install -d -o root -g root -m 0700 "$AI_BACKUP_OFFSITE_PATH"
	install -o root -g root -m 0600 "$backup_file" "$AI_BACKUP_OFFSITE_PATH/$(basename "$backup_file")"
	install -o root -g root -m 0600 "${backup_file}.sha256" "$AI_BACKUP_OFFSITE_PATH/$(basename "${backup_file}.sha256")"
	install -o root -g root -m 0600 "$state_archive" "$AI_BACKUP_OFFSITE_PATH/$(basename "$state_archive")"
	install -o root -g root -m 0600 "${state_archive}.sha256" "$AI_BACKUP_OFFSITE_PATH/$(basename "${state_archive}.sha256")"
fi

find /var/backups/carbonio-ai-assistant -maxdepth 1 -type f \
	\( -name 'carbonio-ai-*.dump' -o -name 'carbonio-ai-*.dump.sha256' -o -name 'carbonio-ai-runtime-*.tar.gz' -o -name 'carbonio-ai-runtime-*.tar.gz.sha256' \) \
	-mtime "+$retention_days" -delete

echo "Backup policy completed: $backup_file"
