#!/usr/bin/env bash

set -Eeuo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

for command_name in git jq node tar; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		echo "Required command is missing: $command_name" >&2
		exit 1
	fi
done

if [[ ! -x node_modules/.bin/tsc || ! -x node_modules/.bin/sdk ]]; then
	echo "Project dependencies are missing. Run pnpm install first." >&2
	exit 1
fi
if [[ ! -f gateway/node_modules/pg/package.json ]]; then
	echo "Gateway dependencies are missing. Run: npm --prefix gateway ci --omit=dev" >&2
	exit 1
fi

if [[ -n "$(git status --short)" ]]; then
	echo "Refusing to package a dirty worktree. Commit or stash changes first." >&2
	exit 1
fi

commit="$(git rev-parse HEAD)"
if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
	echo "Unable to resolve a valid Git commit." >&2
	exit 1
fi

version="$(jq -r '.version' package.json)"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
	echo "Invalid package version: $version" >&2
	exit 1
fi

node_version="v22.22.0"
package_name="carbonio-ai-assistant-v${version}"
output_dir="$project_dir/release"
archive="$output_dir/${package_name}.tar.gz"
workspace="$(mktemp -d "${TMPDIR:-/tmp}/carbonio-ai-release.XXXXXX")"
package_dir="$workspace/$package_name"

cleanup() {
	rm -rf "$workspace"
}
trap cleanup EXIT

node_modules/.bin/tsc --noEmit
node_modules/.bin/sdk build

jq -e --arg commit "$commit" \
	'.name == "carbonio-ai-assistant-ui" and .commit == $commit' \
	dist/component.json >/dev/null

mkdir -p "$package_dir/ui" "$package_dir/gateway"
cp -a dist/. "$package_dir/ui/"
cp -a gateway/package.json gateway/package-lock.json gateway/node_modules \
	gateway/src gateway/scripts gateway/deploy gateway/knowledge \
	gateway/README.md gateway/.env.example "$package_dir/gateway/"
cp deploy/install.sh deploy/uninstall.sh deploy/setup-postgres.sh \
	deploy/backup-postgres.sh deploy/restore-postgres.sh deploy/rollback.sh \
	deploy/smoke-test.sh deploy/set-api-key.sh \
	CHANGELOG.md LICENSE README.md "$package_dir/"

cat >"$package_dir/release.env" <<EOF
CARBONIO_AI_VERSION=$version
CARBONIO_AI_COMMIT=$commit
CARBONIO_AI_NODE_VERSION=$node_version
EOF

chmod 0755 "$package_dir/install.sh" "$package_dir/uninstall.sh" \
	"$package_dir/setup-postgres.sh" "$package_dir/backup-postgres.sh" \
	"$package_dir/restore-postgres.sh" "$package_dir/rollback.sh" \
	"$package_dir/smoke-test.sh" "$package_dir/set-api-key.sh"
mkdir -p "$output_dir"
	COPYFILE_DISABLE=1 tar --no-xattrs -C "$workspace" -czf "$archive" "$package_name"

(
	cd "$output_dir"
	archive_name="$(basename "$archive")"
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$archive_name" >"${archive_name}.sha256"
		sha256sum -c "${archive_name}.sha256"
	else
		shasum -a 256 "$archive_name" >"${archive_name}.sha256"
		shasum -a 256 -c "${archive_name}.sha256"
	fi
)

echo "Release archive: $archive"
cat "${archive}.sha256"
