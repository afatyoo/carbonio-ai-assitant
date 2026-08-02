#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
	echo "Run this command as root." >&2
	exit 1
fi
if ! command -v systemd-creds >/dev/null 2>&1; then
	echo "systemd-creds is required for encrypted credential storage." >&2
	exit 1
fi

config_file="/etc/carbonio-ai-assistant/gateway.env"
credential_root="/etc/credstore.encrypted"
credential_file="$credential_root/carbonio-ai-agent-api-key.cred"
dropin_root="/etc/systemd/system/carbonio-ai-gateway.service.d"
dropin_file="$dropin_root/20-agent-api-key.conf"

api_key=""
if [[ "${1:-}" == "--migrate-env" ]]; then
	if [[ ! -f "$config_file" ]]; then
		echo "Gateway environment file was not found." >&2
		exit 1
	fi
	set -a
	# shellcheck disable=SC1090
	source "$config_file"
	set +a
	api_key="${AI_AGENT_API_KEY:-}"
else
	read -r -s -p "AI provider API key: " api_key
	echo
fi
if [[ -z "$api_key" ]]; then
	echo "API key cannot be empty." >&2
	exit 1
fi

install -d -o root -g root -m 0700 "$credential_root" "$dropin_root"
credential_tmp="$(mktemp /tmp/carbonio-ai-credential.XXXXXX)"
env_tmp="$(mktemp /tmp/carbonio-ai-env.XXXXXX)"
cleanup() {
	rm -f "$credential_tmp" "$env_tmp"
}
trap cleanup EXIT

printf '%s' "$api_key" |
	systemd-creds encrypt --name=carbonio-ai-agent-api-key - "$credential_tmp"
install -o root -g root -m 0600 "$credential_tmp" "$credential_file"

cat >"$dropin_file" <<EOF
[Service]
LoadCredentialEncrypted=carbonio-ai-agent-api-key:$credential_file
EOF
chmod 0644 "$dropin_file"

if [[ -f "$config_file" ]]; then
	awk '!/^AI_AGENT_API_KEY=/' "$config_file" >"$env_tmp"
	install -o root -g root -m 0600 "$env_tmp" "$config_file"
fi

unset api_key AI_AGENT_API_KEY
systemctl daemon-reload
systemctl restart carbonio-ai-gateway.service
echo "Encrypted AI provider credential installed and gateway restarted."
