#!/usr/bin/env bash
# Ends the tutor turn the studio is holding, through the studio's own abort route:
# the same POST the page's «Detener» button sends, so the code that owns the turn
# releases it before the restart that follows.
#
# The route is loopback only: /<STUDIO_TOKEN>/abort, with the studio's own origin and
# a JSON body. The token is read from the studio's environment file the way the shell
# reads it, and it is never printed: curl receives the URL on stdin, so it never
# reaches argv or the journal.
#
#   bash deploy/vps/abort-turn.sh <env-file> <cause>
#     exit 0  the studio answered 200: the turn is released
#     exit 1  no usable token or port, or the studio did not answer 200
set -euo pipefail
env_file=${1:?usage: abort-turn.sh <env-file> <cause>}
cause=${2:?usage: abort-turn.sh <env-file> <cause>}
[[ "$cause" =~ ^[a-z]+$ ]] || { echo 'abort-turn: cause must be a lowercase word' >&2; exit 2; }

# A setting as the shell reads the env file. A file that does not parse yields nothing.
studio_setting() {
  (
    set -a
    # shellcheck disable=SC1090 # the path is the operator's env file, not a literal
    . "$env_file" 2>/dev/null
    set +a
    printf '%s' "${!1:-}"
  ) || true
}
token=$(studio_setting STUDIO_TOKEN)
port=$(studio_setting STUDIO_PORT)
port=${port:-4747}
[[ "$token" =~ ^[a-f0-9]{64}$ ]] || { echo "abort-turn: STUDIO_TOKEN is not set (64 hex characters) in $env_file; the deploy cannot end the turn" >&2; exit 1; }
[[ "$port" =~ ^[0-9]+$ ]] || { echo 'abort-turn: STUDIO_PORT is not a port number' >&2; exit 1; }

origin="http://127.0.0.1:$port"
code=$(
  printf 'url = "%s/%s/abort"\n' "$origin" "$token" |
    curl --silent --max-time 90 --config - --request POST \
      --header "Origin: $origin" --header 'Content-Type: application/json' \
      --data "{\"cause\":\"$cause\"}" --output /dev/null --write-out '%{http_code}'
) || code=000
if [[ "$code" != 200 ]]; then
  echo "abort-turn: the studio did not confirm the abort (HTTP $code)" >&2
  exit 1
fi
