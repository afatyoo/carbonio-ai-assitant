#!/usr/bin/env bash

set -Eeuo pipefail

base_url="${CARBONIO_AI_BASE_URL:-http://127.0.0.1:8787}"
health_file="$(mktemp /tmp/carbonio-ai-health.XXXXXX)"
headers_file="$(mktemp /tmp/carbonio-ai-headers.XXXXXX)"
trap 'rm -f "$health_file" "$headers_file"' EXIT

curl -fsS -D "$headers_file" -o "$health_file" "$base_url/api/ai/health"
jq -e '.status == "ok" and .enabled == true and .historyBackend == "postgresql"' "$health_file" >/dev/null
grep -Eiq '^x-content-type-options: nosniff' "$headers_file"
grep -Eiq '^x-frame-options: SAMEORIGIN' "$headers_file"
grep -Eiq '^cache-control: no-store' "$headers_file"

if [[ "$base_url" == "http://127.0.0.1:8787" ]]; then
	systemctl is-active --quiet carbonio-ai-gateway.service
	systemctl is-active --quiet carbonio-ai-rag-worker.service
	listeners="$(ss -ltnp)"
	grep -Eq '127\.0\.0\.1:8787' <<<"$listeners"
	if grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\[::\]):8787' <<<"$listeners"; then
		echo "Gateway unexpectedly has a public listener." >&2
		exit 1
	fi
	/opt/zextras/common/sbin/nginx -t -c /opt/zextras/conf/nginx.conf >/dev/null
fi

unauthorized_status="$(curl -sS -o /dev/null -w '%{http_code}' "$base_url/api/ai/admin/metrics")"
[[ "$unauthorized_status" == "401" ]]
metrics_unauthorized_status="$(curl -sS -o /dev/null -w '%{http_code}' "$base_url/api/ai/internal/metrics")"
[[ "$metrics_unauthorized_status" == "401" ]]
metrics_status="not_configured"
if [[ -r /etc/carbonio-ai-assistant/metrics-token ]]; then
	metrics_token="$(tr -d '\r\n' </etc/carbonio-ai-assistant/metrics-token)"
	metrics_body="$(curl -fsS -H "Authorization: Bearer $metrics_token" "$base_url/api/ai/internal/metrics")"
	grep -Fq 'carbonio_ai_' <<<"$metrics_body"
	metrics_status="ok"
fi
cross_origin_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
	-H 'Origin: https://untrusted.invalid' -H 'Content-Type: application/json' \
	--data '{}' "$base_url/api/ai/chat")"
[[ "$cross_origin_status" == "403" ]]

echo "smoke_health=ok headers=ok loopback=ok admin_auth=ok metrics_auth=$metrics_status csrf=ok history=postgresql rag_worker=ok"
