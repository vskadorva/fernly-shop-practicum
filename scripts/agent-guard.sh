#!/usr/bin/env bash
# agent-guard.sh — reject agent patches that touch forbidden paths or files outside allowed globs.
# Bash 3.2 compatible.
set -euo pipefail

usage() {
  echo "usage: agent-guard.sh <patch> <allowed pattern>..." >&2
}

if [ $# -lt 1 ]; then
  usage
  exit 1
fi

PATCH="$1"
shift

if [ $# -eq 0 ]; then
  usage
  exit 1
fi

if [ ! -f "$PATCH" ]; then
  echo "agent-guard: patch file not found: $PATCH" >&2
  exit 1
fi

# Empty patch is allowed.
if [ ! -s "$PATCH" ]; then
  exit 0
fi

NUMSTAT="$(git apply --numstat "$PATCH" 2>&1)" || {
  echo "agent-guard: could not read patch: $PATCH" >&2
  echo "$NUMSTAT" >&2
  exit 1
}

if [ -z "$NUMSTAT" ]; then
  exit 0
fi

FORBIDDEN=()
DISALLOWED=()

is_person_only() {
  local f="$1"
  case "$f" in
    web/src/*|api/src/*|.github/*|.cursor/*|scripts/*)
      return 0
      ;;
    */package.json|package.json|*/package-lock.json|package-lock.json)
      return 0
      ;;
    playwright.config.ts|*/playwright.config.ts)
      return 0
      ;;
    web/cypress.config.ts)
      return 0
      ;;
    a11y-baseline.json|*/a11y-baseline.json)
      return 0
      ;;
    *-snapshots/*|*/-*-snapshots/*)
      return 0
      ;;
    */cypress/screenshots/*|*/cypress/results/*)
      return 0
      ;;
    .env|.env.*|*/.env|*/.env.*)
      return 0
      ;;
  esac
  return 1
}

# Return 0 if path matches any allowed shell glob; directory/* patterns match the whole subtree.
path_allowed() {
  local f="$1"
  shift
  local pat
  for pat in "$@"; do
    case "$f" in
      $pat)
        return 0
        ;;
    esac
    case "$pat" in
      */*)
        if [ "${pat##*/}" = "*" ]; then
          local prefix="${pat%/*}/"
          case "$f" in
            ${prefix}*)
              return 0
              ;;
          esac
        fi
        ;;
    esac
  done
  return 1
}

while IFS= read -r line; do
  [ -z "$line" ] && continue
  # numstat: added\tremoved\tpath (path may contain spaces — last field)
  path="${line##*$'\t'}"

  if is_person_only "$path"; then
    FORBIDDEN+=("$path")
    continue
  fi

  if ! path_allowed "$path" "$@"; then
    DISALLOWED+=("$path")
  fi
done <<EOF
$NUMSTAT
EOF

err=0
if [ ${#FORBIDDEN[@]} -gt 0 ]; then
  err=1
  echo "agent-guard: patch touches paths only a person may change:" >&2
  local_i=0
  while [ "$local_i" -lt ${#FORBIDDEN[@]} ]; do
    echo "  ${FORBIDDEN[$local_i]}" >&2
    local_i=$((local_i + 1))
  done
fi

if [ ${#DISALLOWED[@]} -gt 0 ]; then
  err=1
  echo "agent-guard: patch touches paths outside allowed patterns:" >&2
  local_j=0
  while [ "$local_j" -lt ${#DISALLOWED[@]} ]; do
    echo "  ${DISALLOWED[$local_j]}" >&2
    local_j=$((local_j + 1))
  done
fi

exit "$err"
