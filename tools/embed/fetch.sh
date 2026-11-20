#!/usr/bin/env bash
# Provision the pinned multilingual-e5-small files and the ONNX Runtime 1.30.0
# linux-x64 shared library used by bin/embed. Idempotent and bounded: every
# download has a timeout and a pinned SHA-256. Run with an optional target dir.
set -euo pipefail

MODEL_REV=761b726dd34fb83930e26aab4e9ac3899aa1fa78
ORT_VERSION=1.30.0
# Microsoft's official linux-x64 wheel for the pinned ORT release. It carries
# the same libonnxruntime.so as the release tarball; using the wheel here keeps
# provisioning possible on hosts where GitHub release assets are unreachable.
ORT_ARCHIVE=onnxruntime-${ORT_VERSION}-cp312-cp312-manylinux_2_28_x86_64.whl
ORT_URL=https://files.pythonhosted.org/packages/34/35/e7f862dbacbc99fadd9b14a614e49c99bf0f35fd9927a82f096e3de33531/${ORT_ARCHIVE}
ORT_SHA256=fa688e7891a6aa206636fe7372e27ee75fd17713289f6b4fc7b190e0a7de9328

for tool in curl sha256sum unzip; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done

target=${1:-${LEARNING_EMBED_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/learning/embed}}
mkdir -p -- "$target"
dir=$(cd -- "$target" && pwd -P)

sha256_of() {
  sha256sum -- "$1" | awk '{print $1}'
}

fetch_verified() {
  local url=$1 expected=$2 destination=$3 actual
  if [[ -f "$destination" ]] && [[ "$(sha256_of "$destination")" == "$expected" ]]; then
    echo "already verified: $(basename -- "$destination")"
    return 0
  fi
  mkdir -p -- "$(dirname -- "$destination")"
  echo "fetching: $url"
  curl --http1.1 --fail --location --silent --show-error \
    --connect-timeout 20 --max-time 600 --retry 2 --retry-delay 2 \
    --output "$destination.part" -- "$url"
  actual=$(sha256_of "$destination.part")
  if [[ "$actual" != "$expected" ]]; then
    echo "SHA-256 mismatch for $(basename -- "$destination"): expected $expected, got $actual" >&2
    return 1
  fi
  mv -f -- "$destination.part" "$destination"
  echo "verified: $(basename -- "$destination")"
}

base=https://huggingface.co/Xenova/multilingual-e5-small/resolve/${MODEL_REV}
while read -r name expected; do
  [[ -n "$name" ]] || continue
  fetch_verified "$base/$name" "$expected" "$dir/$(basename -- "$name")"
done <<'FILES'
onnx/model_quantized.onnx f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193
config.json cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1
special_tokens_map.json d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7
tokenizer.json 0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39
tokenizer_config.json a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b
FILES

fetch_verified "$ORT_URL" "$ORT_SHA256" "$dir/$ORT_ARCHIVE"

runtime=$dir/onnxruntime
lib=$runtime/lib/libonnxruntime.so
marker=$runtime/.version
expected_marker="${ORT_VERSION} ${ORT_SHA256}"
if [[ -f "$lib" ]] && [[ -f "$marker" ]] && [[ "$(<"$marker")" == "$expected_marker" ]]; then
  echo "already provisioned: ONNX Runtime $ORT_VERSION"
else
  mkdir -p -- "$runtime/lib"
  echo "extracting: ONNX Runtime $ORT_VERSION linux-x64"
  unzip -p "$dir/$ORT_ARCHIVE" "onnxruntime/capi/libonnxruntime.so.${ORT_VERSION}" > "$lib.part"
  unzip -p "$dir/$ORT_ARCHIVE" onnxruntime/capi/libonnxruntime_providers_shared.so \
    > "$runtime/lib/libonnxruntime_providers_shared.so.part"
  chmod 755 -- "$lib.part" "$runtime/lib/libonnxruntime_providers_shared.so.part"
  mv -f -- "$lib.part" "$lib"
  mv -f -- "$runtime/lib/libonnxruntime_providers_shared.so.part" \
    "$runtime/lib/libonnxruntime_providers_shared.so"
  printf '%s\n' "$expected_marker" > "$marker.part"
  mv -f -- "$marker.part" "$marker"
fi

for name in model_quantized.onnx tokenizer.json config.json special_tokens_map.json tokenizer_config.json; do
  [[ -f "$dir/$name" ]] || { echo "Missing asset: $dir/$name" >&2; exit 1; }
done
[[ -f "$lib" ]] || { echo "Missing library: $lib" >&2; exit 1; }
echo "embed assets ready in $dir"
