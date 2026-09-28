#!/usr/bin/env bash
# Builds the `release` branch from a commit on main, keeping only the paths in release.files.
# Each run adds one commit on top of the previous release, so `git pull` works on the server.
#
#   scripts/make-release.sh            # release current HEAD
#   scripts/make-release.sh v1.2.0     # release a tag or commit
#   git push origin release            # then publish it
set -euo pipefail

SRC="${1:-HEAD}"
BRANCH="${RELEASE_BRANCH:-release}"
cd "$(git rev-parse --show-toplevel)"
SRC_SHA="$(git rev-parse --verify "${SRC}^{commit}")"

INDEX="$(mktemp)"
trap 'rm -f "$INDEX"' EXIT
export GIT_INDEX_FILE="$INDEX"
git read-tree --empty

LIST="$(git show "$SRC_SHA:release.files")" # fails the script if the allowlist is missing
while IFS= read -r path; do
  [[ -z "$path" || "$path" == \#* ]] && continue
  entries="$(git ls-tree -r --full-tree "$SRC_SHA" -- "$path")"
  if [[ -z "$entries" ]]; then
    echo "release.files: '$path' not found in $SRC" >&2
    exit 1
  fi
  printf '%s\n' "$entries" | git update-index --index-info
done <<< "$LIST"

TREE="$(git write-tree)"
if [[ "$TREE" == "$(git hash-object -t tree /dev/null)" ]]; then
  echo "refusing to create an empty release" >&2
  exit 1
fi
unset GIT_INDEX_FILE

PARENT=""
for ref in "refs/heads/$BRANCH" "refs/remotes/origin/$BRANCH"; do
  if git rev-parse -q --verify "$ref" >/dev/null; then PARENT="$(git rev-parse "$ref")"; break; fi
done

if [[ -n "$PARENT" && "$(git rev-parse "$PARENT^{tree}")" == "$TREE" ]]; then
  echo "release is already up to date with $SRC ($SRC_SHA)"
  exit 0
fi

MSG="Release from main @ ${SRC_SHA:0:12}

Source: $(git log -1 --format='%s' "$SRC_SHA")"
if [[ -n "$PARENT" ]]; then
  COMMIT="$(git commit-tree "$TREE" -p "$PARENT" -m "$MSG")"
else
  COMMIT="$(git commit-tree "$TREE" -m "$MSG")"
fi
git update-ref "refs/heads/$BRANCH" "$COMMIT"
echo "$BRANCH -> ${COMMIT:0:12} (from ${SRC_SHA:0:12}). Publish with: git push origin $BRANCH"
