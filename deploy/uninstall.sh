#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
	echo "Run this uninstaller as root." >&2
	exit 1
fi

assume_yes=0
purge_data=0
for argument in "$@"; do
	case "$argument" in
		--yes) assume_yes=1 ;;
		--purge-data) purge_data=1 ;;
		*)
			echo "Unknown option: $argument" >&2
			echo "Usage: $0 [--yes] [--purge-data]" >&2
			exit 1
			;;
	esac
done

iris_root="/opt/zextras/web/iris"
app_root="/opt/carbonio-ai-assistant"
data_root="/var/lib/carbonio-ai-assistant"
config_root="/etc/carbonio-ai-assistant"
ui_root="$iris_root/carbonio-ai-assistant-ui"
service_file="/etc/systemd/system/carbonio-ai-gateway.service"
nginx_upstream="/opt/zextras/conf/nginx/extensions/upstream-carbonio-ai.conf"
nginx_backend="/opt/zextras/conf/nginx/extensions/backend-carbonio-ai.conf"

if [[ ! -f "$app_root/.managed-by-carbonio-ai-assistant" ]]; then
	echo "Managed installation marker was not found; refusing to uninstall." >&2
	exit 1
fi

if [[ "$assume_yes" != "1" ]]; then
	echo "This removes the Carbonio AI UI, gateway, runtime, and proxy route."
	if [[ "$purge_data" == "1" ]]; then
		echo "Conversation history and saved AI configuration will also be deleted."
	else
		echo "Conversation history and saved AI configuration will be preserved."
	fi
	read -r -p "Continue? [y/N] " answer
	if [[ ! "$answer" =~ ^[Yy]$ ]]; then
		echo "Uninstall cancelled."
		exit 0
	fi
fi

systemctl disable --now carbonio-ai-gateway.service >/dev/null 2>&1 || true
rm -f "$service_file"
systemctl daemon-reload

rm -f "$nginx_upstream" "$nginx_backend"
if /opt/zextras/common/sbin/nginx -t -c /opt/zextras/conf/nginx.conf; then
	systemctl reload carbonio-nginx.service
else
	echo "Warning: Carbonio Nginx validation failed after removing the AI route." >&2
fi

if [[ -f "$ui_root/.managed-by-carbonio-ai-assistant" ]]; then
	rm -rf "$ui_root"
fi

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
install -o zextras -g zextras -m 0644 \
	"$registry_tmp" "$iris_root/components.json"

rm -rf "$app_root"

if [[ "$purge_data" == "1" ]]; then
	rm -rf "$data_root" "$config_root"
	if getent passwd carbonio-ai >/dev/null; then
		userdel carbonio-ai
	fi
	echo "Carbonio AI Assistant and its persistent data were removed."
else
	echo "Carbonio AI Assistant was removed."
	echo "Persistent data was preserved at $data_root and $config_root."
fi
