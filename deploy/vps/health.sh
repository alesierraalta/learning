#!/usr/bin/env bash
set -euo pipefail
fail() { echo "learning-studio: FAIL ($1)"; exit 1; }
systemctl --user is-active --quiet learning-studio || fail 'service inactive'
code=$(curl -s --retry 10 --retry-connrefused --retry-delay 1 --max-time 10 -o /dev/null -w '%{http_code}' -H 'Host: 10.154.59.151:8445' http://127.0.0.1:4747/) || fail 'loopback unreachable'
[[ "$code" == 302 ]] || fail "loopback HTTP $code, expected 302"
ca="$HOME/sync-hub/certs/infra-root-ca.crt"
code=$(curl -s --retry 5 --retry-connrefused --retry-delay 1 --max-time 15 --cacert "$ca" -o /dev/null -w '%{http_code}' https://10.154.59.151:8445/) || fail 'ZeroTier HTTPS unreachable'
[[ "$code" == 302 ]] || fail "ZeroTier HTTPS $code, expected 302"
echo 'learning-studio: OK (active; loopback HTTP 302; ZeroTier HTTPS 302 with a trusted certificate)'
