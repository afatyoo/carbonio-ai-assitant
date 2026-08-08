#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
	echo "Run this setup as root." >&2
	exit 1
fi

for command_name in openssl psql createuser createdb runuser systemctl curl; do
	command -v "$command_name" >/dev/null 2>&1 || {
		echo "Required command is missing: $command_name" >&2
		exit 1
	}
done

db_name="carbonio_ai"
db_user="carbonio_ai"
db_password="$(openssl rand -hex 24)"
history_key="$(openssl rand -base64 32 | tr -d '\n')"
config_file="/etc/carbonio-ai-assistant/gateway.env"
data_root="/var/lib/carbonio-ai-assistant"
node_bin="/opt/carbonio-ai-assistant/runtime/node-v22.22.0-linux-x64/bin/node"
migration_script="/opt/carbonio-ai-assistant/gateway/scripts/migrate-history-to-postgres.mjs"
database_url="postgresql://${db_user}:${db_password}@127.0.0.1:5432/${db_name}"

if ! runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_roles WHERE rolname='carbonio_ai'" | grep -qx 1; then
	runuser -u postgres -- createuser --no-createdb --no-createrole --no-superuser "$db_user"
fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c \
	"ALTER ROLE carbonio_ai LOGIN PASSWORD '${db_password}'"
if ! runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_database WHERE datname='carbonio_ai'" | grep -qx 1; then
	runuser -u postgres -- createdb --owner "$db_user" "$db_name"
fi

backup_root="$data_root/install-backups"
install -d -o carbonio-ai -g carbonio-ai -m 0700 "$backup_root"
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -f "$config_file" ]]; then
	cp -a "$config_file" "$backup_root/gateway.env.pre-postgres.${backup_stamp}"
fi
if [[ -f "$data_root/.runtime/history.sqlite" ]]; then
	cp -a "$data_root/.runtime/history.sqlite" \
		"$backup_root/history.sqlite.pre-postgres.${backup_stamp}"
	chown carbonio-ai:carbonio-ai "$backup_root/history.sqlite.pre-postgres.${backup_stamp}"
	chmod 0600 "$backup_root/history.sqlite.pre-postgres.${backup_stamp}"
	runuser -u carbonio-ai -- env \
		AI_DATABASE_URL="$database_url" \
		AI_HISTORY_ENCRYPTION_KEY="$history_key" \
		"$node_bin" "$migration_script" "$data_root/.runtime/history.sqlite"
else
	runuser -u carbonio-ai -- env \
		AI_DATABASE_URL="$database_url" \
		AI_HISTORY_ENCRYPTION_KEY="$history_key" \
		"$node_bin" --input-type=module -e \
		'import { closeHistoryDatabase } from "/opt/carbonio-ai-assistant/gateway/src/history.js"; await closeHistoryDatabase();'
fi

config_tmp="$(mktemp /tmp/carbonio-ai-gateway-env.XXXXXX)"
trap 'rm -f "$config_tmp"' EXIT
if [[ -f "$config_file" ]]; then
	grep -Ev '^AI_(DATABASE_URL|DATABASE_POOL_SIZE|DATABASE_SSL|HISTORY_ENCRYPTION_KEY|DELETED_HISTORY_RETENTION_DAYS)=' \
		"$config_file" >"$config_tmp" || true
fi
{
	cat "$config_tmp"
	printf '%s\n' \
		"AI_DATABASE_URL=${database_url}" \
		"AI_DATABASE_POOL_SIZE=10" \
		"AI_DATABASE_SSL=false" \
		"AI_HISTORY_ENCRYPTION_KEY=${history_key}" \
		"AI_DELETED_HISTORY_RETENTION_DAYS=30"
} >"${config_tmp}.next"
install -o root -g root -m 0600 "${config_tmp}.next" "$config_file"
rm -f "${config_tmp}.next"

systemctl restart carbonio-ai-gateway.service
systemctl enable carbonio-ai-rag-worker.service >/dev/null
systemctl restart carbonio-ai-rag-worker.service
for attempt in $(seq 1 30); do
	if health="$(curl -fsS --max-time 2 http://127.0.0.1:8787/api/ai/health 2>/dev/null)"; then
		if [[ "$health" == *'"historyBackend":"postgresql"'* ]]; then
			echo "PostgreSQL history migration completed."
			echo "Database: $db_name"
			echo "Backup directory: $backup_root"
			exit 0
		fi
	fi
	sleep 1
done

echo "Gateway did not report the PostgreSQL backend. Restore the previous gateway.env backup." >&2
exit 1
