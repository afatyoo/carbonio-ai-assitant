#!/usr/bin/env bash

set -Eeuo pipefail

target_commit="${1:-}"
confirmation="${2:-}"
if [[ ! "$target_commit" =~ ^[0-9a-f]{40}$ || "$confirmation" != "--yes" ]]; then
	echo "Usage: $0 <40-character-commit> --yes" >&2
	exit 1
fi
if [[ "$EUID" -ne 0 ]]; then
	echo "Run this rollback as root." >&2
	exit 1
fi

app_root="/opt/carbonio-ai-assistant"
app_link="$app_root/gateway"
target_release="$app_root/releases/$target_commit"
iris_root="/opt/zextras/web/iris"
target_ui="$iris_root/carbonio-ai-assistant-ui/$target_commit"
registry="$iris_root/components.json"

if [[ ! -f "$app_root/.managed-by-carbonio-ai-assistant" ]]; then
	echo "Managed installation marker is missing." >&2
	exit 1
fi
if [[ ! -f "$target_release/src/server.js" || ! -f "$target_ui/component.json" ]]; then
	echo "The requested gateway/UI release is not installed: $target_commit" >&2
	exit 1
fi

current_release="$(readlink -f "$app_link")"
current_commit="$(basename "$current_release")"
backup_root="/var/lib/carbonio-ai-assistant/install-backups"
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
registry_backup="$backup_root/components.json.pre-rollback.$backup_stamp"
install -d -o carbonio-ai -g carbonio-ai -m 0700 "$backup_root"
cp -a "$registry" "$registry_backup"

set_gateway_link() {
	local release_path="$1"
	local next_link="$app_root/gateway.rollback-next"
	ln -sfn "$release_path" "$next_link"
	mv -Tf "$next_link" "$app_link"
}

restore_previous() {
	set_gateway_link "$current_release"
	cp -a "$registry_backup" "$registry"
	systemctl restart carbonio-ai-gateway.service || true
	systemctl restart carbonio-ai-rag-worker.service || true
	systemctl reload carbonio-nginx.service || true
}
trap restore_previous ERR

set_gateway_link "$target_release"
touch "$target_ui/component.json"
registry_tmp="$(mktemp /tmp/carbonio-ai-rollback-registry.XXXXXX)"
trap 'rm -f "$registry_tmp"' EXIT
find "$iris_root/" -maxdepth 3 -mindepth 3 -type f -name component.json -printf '%T@ %p\n' |
	sort -rn |
	awk '{ n = split($2, path, "/"); component = path[6]; if (!seen[component]++) print $2 }' |
	xargs jq -s '{"components":.}' >"$registry_tmp"
jq -e --arg commit "$target_commit" \
	'.components | map(select(.name == "carbonio-ai-assistant-ui" and .commit == $commit)) | length == 1' \
	"$registry_tmp" >/dev/null
install -o zextras -g zextras -m 0644 "$registry_tmp" "$registry"
/opt/zextras/common/sbin/nginx -t -c /opt/zextras/conf/nginx.conf
systemctl restart carbonio-ai-gateway.service
systemctl restart carbonio-ai-rag-worker.service
systemctl reload carbonio-nginx.service

for attempt in $(seq 1 30); do
	if curl -fsS --max-time 2 http://127.0.0.1:8787/api/ai/health >/dev/null; then
		trap - ERR
		echo "Rollback completed: $current_commit -> $target_commit"
		echo "Database schema was not downgraded (forward-only migration policy)."
		exit 0
	fi
	sleep 1
done

echo "Rollback health check failed; restoring $current_commit." >&2
false
