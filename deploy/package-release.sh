#!/usr/bin/env bash

set -Eeuo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

for command_name in git jq tar pnpm; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		echo "Required command is missing: $command_name" >&2
		exit 1
	fi
done

if [[ -n "$(git status --short)" ]]; then
	echo "Refusing to package a dirty worktree. Commit or stash changes first." >&2
	exit 1
fi

commit="$(git rev-parse HEAD)"
if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
	echo "Unable to resolve a valid Git commit." >&2
	exit 1
fi

node_version="v22.22.0"
package_name="carbonio-ai-assistant-${commit}"
output_dir="$project_dir/release"
archive="$output_dir/${package_name}.tar.gz"
workspace="$(mktemp -d "${TMPDIR:-/tmp}/carbonio-ai-release.XXXXXX")"
package_dir="$workspace/$package_name"

cleanup() {
	rm -rf "$workspace"
}
trap cleanup EXIT

pnpm run type-check
pnpm run build

jq -e --arg commit "$commit" \
	'.name == "carbonio-ai-assistant-ui" and .commit == $commit' \
	dist/component.json >/dev/null

mkdir -p "$package_dir/ui" "$package_dir/gateway"
cp -a dist/. "$package_dir/ui/"
cp -a gateway/package.json gateway/src gateway/scripts gateway/deploy \
	gateway/README.md gateway/.env.example "$package_dir/gateway/"
cp deploy/install.sh deploy/uninstall.sh "$package_dir/"

cat >"$package_dir/release.env" <<EOF
CARBONIO_AI_COMMIT=$commit
CARBONIO_AI_NODE_VERSION=$node_version
EOF

chmod 0755 "$package_dir/install.sh" "$package_dir/uninstall.sh"
mkdir -p "$output_dir"
COPYFILE_DISABLE=1 tar -C "$workspace" -czf "$archive" "$package_name"

if command -v sha256sum >/dev/null 2>&1; then
	sha256sum "$archive" >"${archive}.sha256"
else
	shasum -a 256 "$archive" >"${archive}.sha256"
fi

echo "Release archive: $archive"
cat "${archive}.sha256"
