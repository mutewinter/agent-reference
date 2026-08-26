#!/usr/bin/env bash
# Regenerate the terminal captures in snippets/ by running the CLI from this
# repository's working tree, so a slide can never show output the code stopped
# producing. Uses macOS `script` to give the CLI a tty, which is what makes it
# emit color; the escape codes are what Shiki renders on the slide.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
demo=$(mktemp -d)
trap 'rm -rf "$demo"' EXIT

run() { node --experimental-strip-types "$repo/src/cli.ts" "$@"; }

# A throwaway project of public dependencies. Nothing on a slide should come
# from a real checkout: no local paths, no private repository names. Pinned
# coordinates need no lockfile, so this directory holds one file.
cat > "$demo/agent-reference.json" <<'JSON'
{
  "$schema": "https://agent-reference.dev/schema/agent-reference.schema.json",
  "packages": {
    "semver": "7.8.4",
    "typescript": "5.9.3"
  },
  "sets": [
    {
      "name": "validation",
      "description": "Schema libraries we compare against",
      "git": ["github:colinhacks/zod", "github:honojs/hono"]
    }
  ]
}
JSON

cd "$demo"
run get semver > /dev/null
script -q /dev/null node --experimental-strip-types "$repo/src/cli.ts" status < /dev/null \
  | perl -0pe 's/\A\^D//; s/[\x04\x08]//g; s/\r//g' \
  > "$here/snippets/status.ansi"

echo "wrote snippets/status.ansi"
