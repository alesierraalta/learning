#!/usr/bin/env bash
set -euo pipefail

if ! command -v pdftotext >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq poppler-utils
fi
