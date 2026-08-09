#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
	echo "Run this helper as root." >&2
	exit 1
fi

for command_name in openssl systemctl; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		echo "Required command is missing: $command_name" >&2
		exit 1
	fi
done

config_root="/etc/carbonio-ai-assistant"
environment_file="$config_root/gateway.env"
token_file="$config_root/metrics-token"
install -d -o root -g root -m 0755 "$config_root"
touch "$environment_file"
chmod 0600 "$environment_file"

token="$(openssl rand -hex 32)"
environment_tmp="$(mktemp "$config_root/gateway.env.XXXXXX")"
cleanup() {
	rm -f "$environment_tmp"
}
trap cleanup EXIT

grep -Ev '^AI_METRICS_TOKEN=' "$environment_file" >"$environment_tmp" || true
printf 'AI_METRICS_TOKEN=%s\n' "$token" >>"$environment_tmp"
install -o root -g root -m 0600 "$environment_tmp" "$environment_file"
printf '%s\n' "$token" | install -o root -g root -m 0600 /dev/stdin "$token_file"

systemctl restart carbonio-ai-gateway.service
echo "Metrics authentication token rotated."
echo "Bearer token file: $token_file"
echo "Grant the local Prometheus process read access through an operator-managed group or credentials copy."
