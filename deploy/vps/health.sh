#!/usr/bin/env bash
set -euo pipefail
fail() { echo "learning-studio: FAIL ($1)"; exit 1; }
systemctl --user is-active --quiet learning-studio || fail 'service inactive'
code=$(curl -s --retry 10 --retry-connrefused --retry-delay 1 --max-time 10 -o /dev/null -w '%{http_code}' -H 'Host: alelaptop.tail104959.ts.net:8445' http://127.0.0.1:4747/) || fail 'loopback unreachable'
[[ "$code" == 302 ]] || fail "loopback HTTP $code, expected 302"
if command -v tailscale >/dev/null 2>&1; then
  code=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' https://alelaptop.tail104959.ts.net:8445/) || fail 'tailnet HTTPS unreachable'
  [[ "$code" == 302 ]] || fail "tailnet HTTP $code, expected 302"
  echo 'learning-studio: OK (active; loopback and tailnet HTTP 302)'
else
  echo 'learning-studio: OK (active; loopback HTTP 302; tailnet check skipped: tailscale unavailable)'
fi
