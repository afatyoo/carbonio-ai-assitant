#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
	echo "Run this installer as root." >&2
	exit 1
fi

release_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$release_dir/release.env"

if [[ ! "${CARBONIO_AI_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; then
	echo "Invalid or missing CARBONIO_AI_COMMIT." >&2
	exit 1
fi
if [[ ! "${CARBONIO_AI_NODE_VERSION:-}" =~ ^v22\.[0-9]+\.[0-9]+$ ]]; then
	echo "Invalid or missing CARBONIO_AI_NODE_VERSION." >&2
	exit 1
fi

for command_name in curl jq tar systemctl sha256sum; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		echo "Required command is missing: $command_name" >&2
		exit 1
	fi
done

iris_root="/opt/zextras/web/iris"
nginx_root="/opt/zextras/conf/nginx"
app_root="/opt/carbonio-ai-assistant"
app_bin="$app_root/bin"
app_release="$app_root/releases/$CARBONIO_AI_COMMIT"
app_link="$app_root/gateway"
runtime_name="node-${CARBONIO_AI_NODE_VERSION}-linux-x64"
runtime_dir="$app_root/runtime/$runtime_name"
data_root="/var/lib/carbonio-ai-assistant"
config_root="/etc/carbonio-ai-assistant"
marker="$app_root/.managed-by-carbonio-ai-assistant"
ui_root="$iris_root/carbonio-ai-assistant-ui"
ui_target="$ui_root/$CARBONIO_AI_COMMIT"
ui_marker="$ui_root/.managed-by-carbonio-ai-assistant"
service_file="/etc/systemd/system/carbonio-ai-gateway.service"
nginx_upstream="$nginx_root/extensions/upstream-carbonio-ai.conf"
nginx_backend="$nginx_root/extensions/backend-carbonio-ai.conf"

if [[ ! -d "$iris_root" || ! -f "$iris_root/components.json" ]]; then
	echo "Carbonio Iris registry was not found at $iris_root." >&2
	exit 1
fi
if [[ ! -x /opt/zextras/common/sbin/nginx ]]; then
	echo "Carbonio Nginx binary was not found." >&2
	exit 1
fi

install -d -o root -g root -m 0755 \
	"$app_root" "$app_root/releases" "$app_root/runtime" "$app_bin"
printf '%s\n' "carbonio-ai-assistant" >"$marker"
chmod 0644 "$marker"
install -o root -g root -m 0755 \
	"$release_dir/setup-postgres.sh" "$app_bin/setup-postgres.sh"
install -o root -g root -m 0755 \
	"$release_dir/backup-postgres.sh" "$app_bin/backup-postgres.sh"
install -o root -g root -m 0755 \
	"$release_dir/restore-postgres.sh" "$app_bin/restore-postgres.sh"
install -o root -g root -m 0755 \
	"$release_dir/rollback.sh" "$app_bin/rollback.sh"
install -o root -g root -m 0755 \
	"$release_dir/smoke-test.sh" "$app_bin/smoke-test.sh"
install -o root -g root -m 0755 \
	"$release_dir/set-api-key.sh" "$app_bin/set-api-key.sh"

if ! getent passwd carbonio-ai >/dev/null; then
	useradd --system \
		--home-dir "$data_root" \
		--shell /usr/sbin/nologin \
		carbonio-ai
fi

install -d -o carbonio-ai -g carbonio-ai -m 0700 "$data_root"
install -d -o root -g root -m 0755 "$config_root"
if [[ ! -f "$config_root/gateway.env" ]]; then
	install -o root -g root -m 0600 /dev/null "$config_root/gateway.env"
fi

if [[ ! -d "$runtime_dir" ]]; then
	node_archive="/tmp/${runtime_name}.tar.xz"
	node_checksums="/tmp/node-${CARBONIO_AI_NODE_VERSION}-SHASUMS256.txt"
	node_base_url="https://nodejs.org/dist/${CARBONIO_AI_NODE_VERSION}"
	curl -fL --retry 3 -o "$node_archive" \
		"$node_base_url/${runtime_name}.tar.xz"
	curl -fL --retry 3 -o "$node_checksums" \
		"$node_base_url/SHASUMS256.txt"
	(
		cd /tmp
		grep " ${runtime_name}.tar.xz$" "$node_checksums" | sha256sum -c -
	)
	tar -xJf "$node_archive" -C "$app_root/runtime"
	chown -R root:root "$runtime_dir"
fi

if [[ ! -d "$app_release" ]]; then
	install -d -o root -g root -m 0755 "$app_release"
	cp -a "$release_dir/gateway/." "$app_release/"
	chown -R root:root "$app_release"
fi

"$runtime_dir/bin/node" --check "$app_release/src/server.js"
next_link="$app_root/gateway.next"
if [[ -e "$next_link" || -L "$next_link" ]]; then
	rm -f "$next_link"
fi
ln -s "$app_release" "$next_link"
mv -Tf "$next_link" "$app_link"

install -o root -g root -m 0644 \
	"$app_release/deploy/carbonio-ai-gateway.service" "$service_file"

install -d -o zextras -g zextras -m 0755 "$nginx_root/extensions"
install -o zextras -g zextras -m 0644 \
	"$app_release/deploy/nginx/upstream-carbonio-ai.conf" "$nginx_upstream"
install -o zextras -g zextras -m 0644 \
	"$app_release/deploy/nginx/backend-carbonio-ai.conf" "$nginx_backend"

if ! /opt/zextras/common/sbin/nginx -t -c /opt/zextras/conf/nginx.conf; then
	echo "Carbonio Nginx validation failed. The service was not reloaded." >&2
	exit 1
fi

install -d -o zextras -g zextras -m 0755 "$ui_root" "$ui_target"
cp -a "$release_dir/ui/." "$ui_target/"
chown -R zextras:zextras "$ui_root"
printf '%s\n' "carbonio-ai-assistant-ui" >"$ui_marker"
chown zextras:zextras "$ui_marker"
chmod 0644 "$ui_marker"
touch "$ui_target/component.json"

backup_root="$data_root/install-backups"
install -d -o carbonio-ai -g carbonio-ai -m 0700 "$backup_root"
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$iris_root/components.json" \
	"$backup_root/components.json.${backup_stamp}"

registry_tmp="$(mktemp /tmp/carbonio-ai-components.XXXXXX)"
cleanup_registry_tmp() {
	rm -f "$registry_tmp"
}
trap cleanup_registry_tmp EXIT

find "$iris_root/" \
	-maxdepth 3 \
	-mindepth 3 \
	-type f \
	-name component.json \
	-printf '%T@ %p\n' |
	sort -rn |
	awk '{
		n = split($2, path, "/")
		component = path[6]
		if (!seen[component]++) print $2
	}' |
	xargs jq -s '{"components":.}' >"$registry_tmp"

jq -e --arg commit "$CARBONIO_AI_COMMIT" \
	'.components
	 | map(select(.name == "carbonio-ai-assistant-ui" and .commit == $commit))
	 | length == 1' \
	"$registry_tmp" >/dev/null
install -o zextras -g zextras -m 0644 \
	"$registry_tmp" "$iris_root/components.json"

systemctl daemon-reload
systemctl enable carbonio-ai-gateway.service >/dev/null
systemctl restart carbonio-ai-gateway.service

gateway_ready=0
for attempt in $(seq 1 30); do
	if curl -fsS --max-time 2 \
		http://127.0.0.1:8787/api/ai/health >/dev/null; then
		gateway_ready=1
		break
	fi
	sleep 1
done
if [[ "$gateway_ready" != "1" ]]; then
	echo "Gateway did not become ready. Check journalctl -u carbonio-ai-gateway." >&2
	exit 1
fi

systemctl reload carbonio-nginx.service

echo "Carbonio AI Assistant installed successfully."
echo "Commit: $CARBONIO_AI_COMMIT"
echo "Gateway: $(systemctl is-active carbonio-ai-gateway.service)"
echo "Data directory: $data_root"
