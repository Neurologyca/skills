#!/usr/bin/env bash
# Sync the agent skills published by DevLab into this repository: plugins/neurologyca/skills/.
#
# DevLab is the source of truth. This script downloads every skill listed in
# <DEVLAB>/.well-known/agent-skills/index.json, checks its sha256 digest, unpacks it, and refuses
# the result if anything still points at the test environment. Nothing is replaced until every
# check has passed. The Sync skills workflow runs it; it also runs locally.
#
# Usage: bash .github/scripts/sync-skills.sh [devlab-origin]   (default: https://devlab.neurologyca.com)
# Needs: bash, curl, unzip, sha256sum, cmp, node (>= 18).
set -euo pipefail

DEVLAB="${1:-https://devlab.neurologyca.com}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="$REPO/plugins/neurologyca/skills"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
die() { echo "ERROR: $*" >&2; exit 1; }

[ -f "$REPO/.claude-plugin/marketplace.json" ] || die "mirror repo not found at $REPO"
echo "Source: $DEVLAB"

# 1. The index must be served by DevLab itself, not through a redirect to another host.
final_url="$(curl -fsSL -o "$WORK/index.json" -w '%{url_effective}' "$DEVLAB/.well-known/agent-skills/index.json")"
case "$final_url" in
  "$DEVLAB"/*) ;;
  *) die "the index was redirected to $final_url. Is DevLab production deployed?" ;;
esac

# 2. name<TAB>url<TAB>sha256 for every skill. Archives must be on the same origin.
node -e '
  const [file, origin] = process.argv.slice(1);
  const d = JSON.parse(require("fs").readFileSync(file, "utf8"));
  if (!Array.isArray(d.skills) || d.skills.length === 0) throw new Error("the index lists no skills");
  for (const s of d.skills) {
    if (s.type !== "archive") throw new Error(`unsupported skill type ${s.type} for ${s.name}`);
    if (!/^[a-z0-9-]+$/.test(s.name)) throw new Error(`unexpected skill name ${s.name}`);
    const url = new URL(s.url, origin + "/");
    if (url.origin !== origin) throw new Error(`${s.name} is served from another origin: ${url.origin}`);
    const digest = String(s.digest || "").replace(/^sha256:/, "");
    if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error(`missing sha256 digest for ${s.name}`);
    console.log([s.name, url.href, digest].join("\t"));
  }
' "$WORK/index.json" "$DEVLAB" > "$WORK/skills.tsv"
[ -s "$WORK/skills.tsv" ] || die "empty skill list"

mkdir -p "$WORK/out"
while IFS=$'\t' read -r name url digest; do
  curl -fsSL -o "$WORK/$name.zip" "$url"
  echo "$digest  $WORK/$name.zip" | sha256sum -c --quiet - || die "sha256 mismatch for $name"
  unzip -q "$WORK/$name.zip" -d "$WORK/out/$name"
  [ -f "$WORK/out/$name/SKILL.md" ] || die "$name has no SKILL.md at its root"
  [ -f "$WORK/out/$name/LICENSE.txt" ] || die "$name has no LICENSE.txt"
  version="$(sed -n 's/^  version: "\(.*\)"/\1/p' "$WORK/out/$name/SKILL.md" | head -1)"
  echo "  $name $version"
done < "$WORK/skills.tsv"

# 3. Safety and environment checks on everything that would be published.
[ -z "$(find "$WORK/out" -type l)" ] || die "an archive contains symbolic links"
# Only public production hosts may appear: no test, dev or legacy hosts, and no Engine or internal hosts.
other_hosts="$(grep -rIhoE '[a-z0-9.-]+\.(neurologyca\.(com|ai)|kopernica\.(io|ai))' "$WORK/out" |
               grep -vxE '(devlab|www)\.neurologyca\.com|neurologyca\.com' | sort -u || true)"
if [ -n "$other_hosts" ]; then
  echo "$other_hosts" | sed 's/^/  /' >&2
  die "the skills mention hosts other than devlab.neurologyca.com (listed above)"
fi
# Production builds declare environment "devlab" and docs "https://devlab.neurologyca.com/docs".
while IFS=$'\t' read -r name _ _; do
  grep -qx '  environment: "devlab"' "$WORK/out/$name/SKILL.md" ||
    die "$name is not a production build: $(grep -m1 '^  environment: ' "$WORK/out/$name/SKILL.md" || echo 'no environment')"
  grep -qx '  docs: "https://devlab.neurologyca.com/docs"' "$WORK/out/$name/SKILL.md" ||
    die "$name does not point its docs at https://devlab.neurologyca.com/docs"
done < "$WORK/skills.tsv"
first="$(head -1 "$WORK/skills.tsv" | cut -f1)"
while IFS=$'\t' read -r name _ _; do
  cmp -s "$WORK/out/$first/LICENSE.txt" "$WORK/out/$name/LICENSE.txt" || die "$name has a different LICENSE.txt"
done < "$WORK/skills.tsv"

# 4. Only now replace the skills and the root LICENSE.
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$WORK/out/." "$DEST/"
cp "$DEST/$first/LICENSE.txt" "$REPO/LICENSE"

echo "Done. Review with: git -C \"$REPO\" status && git -C \"$REPO\" diff --stat"
