#!/usr/bin/env bash
# Serve https://learnings.infra.local to ZeroTier members from this host.
#
# The name resolves only inside the ZeroTier network: the record answers the ZeroTier
# address, and the resolver listens on that address alone. Point the network's managed
# DNS at 10.154.59.151 for the infra.local domain in ZeroTier Central; members then
# resolve the name at home and away, while the public internet has no such record.
set -euo pipefail

assets=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
zt_ip=10.154.59.151

if ! ip -o -4 addr show | grep -q " $zt_ip/"; then
  echo "learnings-dns: no interface holds $zt_ip; is ZeroTier joined?" >&2
  exit 1
fi
if ! command -v dnsmasq >/dev/null 2>&1; then
  echo 'learnings-dns: installing dnsmasq'
  sudo apt-get update -qq
  sudo apt-get install -y -qq dnsmasq
fi
sudo install -m 644 "$assets/learnings-dns.conf" /etc/dnsmasq.d/learnings.conf
sudo systemctl enable dnsmasq >/dev/null 2>&1 || true
sudo systemctl restart dnsmasq

# Prove the record answers on the ZeroTier address, not on the loopback.
for _attempt in 1 2 3 4 5; do
  if answer=$(dig +short +time=2 +tries=1 @$zt_ip learnings.infra.local A 2>/dev/null) && [[ "$answer" == "$zt_ip" ]]; then
    echo "learnings-dns: OK ($zt_ip answers learnings.infra.local; point ZeroTier managed DNS at it)"
    exit 0
  fi
  sleep 1
done
echo "learnings-dns: FAIL ($zt_ip did not answer learnings.infra.local)" >&2
sudo systemctl status dnsmasq --no-pager -n 5 >&2 || true
exit 1
