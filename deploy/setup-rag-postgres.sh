#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
	echo "Run this setup as root." >&2
	exit 1
fi

for command_name in apt-get createuser grep install openssl runuser psql systemctl; do
	command -v "$command_name" >/dev/null 2>&1 || {
		echo "Required command is missing: $command_name" >&2
		exit 1
	}
done

db_name="${AI_RAG_DATABASE_NAME:-carbonio_ai}"
if ! runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_database WHERE datname='${db_name}'" | grep -qx 1; then
	echo "Database ${db_name} does not exist. Run setup-postgres.sh first." >&2
	exit 1
fi

if ! runuser -u postgres -- psql -d "$db_name" -Atqc \
	"SELECT 1 FROM pg_available_extensions WHERE name='vector'" | grep -qx 1; then
	apt-get update
	DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql-16-pgvector
fi

runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$db_name" -c \
	"CREATE EXTENSION IF NOT EXISTS vector"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$db_name" -c \
	"CREATE EXTENSION IF NOT EXISTS pg_trgm"

worker_user="carbonio_ai_worker"
worker_password="$(openssl rand -hex 24)"
if ! runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_roles WHERE rolname='${worker_user}'" | grep -qx 1; then
	runuser -u postgres -- createuser --no-createdb --no-createrole --no-superuser "$worker_user"
fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c \
	"ALTER ROLE ${worker_user} LOGIN PASSWORD '${worker_password}'"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$db_name" -c \
	"GRANT CONNECT ON DATABASE ${db_name} TO ${worker_user}; GRANT USAGE ON SCHEMA public TO ${worker_user}; GRANT SELECT, INSERT, UPDATE, DELETE ON rag_sources, rag_documents, rag_chunks, rag_tombstones, rag_jobs TO ${worker_user}"

config_file="/etc/carbonio-ai-assistant/gateway.env"
backup_root="/var/lib/carbonio-ai-assistant/install-backups"
install -d -o carbonio-ai -g carbonio-ai -m 0700 "$backup_root"
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$config_file" "$backup_root/gateway.env.pre-rag.${backup_stamp}"
config_tmp="$(mktemp /tmp/carbonio-ai-rag-env.XXXXXX)"
trap 'rm -f "$config_tmp" "${config_tmp}.next"' EXIT
grep -Ev '^AI_RAG_WORKER_DATABASE_URL=' "$config_file" >"$config_tmp" || true
{
	cat "$config_tmp"
	printf '%s\n' "AI_RAG_WORKER_DATABASE_URL=postgresql://${worker_user}:${worker_password}@127.0.0.1:5432/${db_name}"
} >"${config_tmp}.next"
install -o root -g root -m 0600 "${config_tmp}.next" "$config_file"

if systemctl list-unit-files carbonio-ai-rag-worker.service --no-legend 2>/dev/null |
	grep -q '^carbonio-ai-rag-worker\.service'; then
	systemctl enable carbonio-ai-rag-worker.service >/dev/null
	systemctl restart carbonio-ai-rag-worker.service
fi

echo "PostgreSQL RAG extensions are ready in ${db_name}."
echo "Dedicated RAG worker role is ready: ${worker_user}."
